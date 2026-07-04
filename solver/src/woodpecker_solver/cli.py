from __future__ import annotations

import atexit
import json
import os
import signal
import subprocess
import time
from concurrent.futures import FIRST_COMPLETED, Future, ProcessPoolExecutor, wait
from dataclasses import dataclass
from pathlib import Path
from typing import Annotated, Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

import chess
import typer

from woodpecker_solver.config import AppSettings, load_settings
from woodpecker_solver.engine import StockfishAnalyzer
from woodpecker_solver.solver import FenSolver

app = typer.Typer(add_completion=False, no_args_is_help=True)

_worker_settings: AppSettings | None = None
_worker_analyzer: StockfishAnalyzer | None = None


@dataclass(frozen=True)
class WorkItem:
    index: int
    fen: str


@dataclass(frozen=True)
class WorkResult:
    item: WorkItem
    status: str
    document: dict[str, Any] | None = None
    reason: str | None = None
    error_type: str | None = None
    error_message: str | None = None
    elapsed_seconds: float | None = None


@app.command()
def solve_fens(
    input_dir: Annotated[Path, typer.Option("--input", file_okay=False, dir_okay=True, help="Base FEN input directory.")],
    name: Annotated[str, typer.Option("--name", help="Collection name.")],
    server_url: Annotated[str, typer.Option("--server-url", help="Base URL for the Woodpecker server.")] = "http://127.0.0.1:3001",
    server_dir: Annotated[Path, typer.Option("--server-dir", file_okay=False, dir_okay=True, help="Woodpecker server project directory.")] = Path("../app/server"),
    no_start_server: Annotated[bool, typer.Option("--no-start-server", help="Require an already-running server instead of starting one.")] = False,
    config: Annotated[Path, typer.Option("--config", exists=True, dir_okay=False, help="Path to appsettings.json.")] = Path("appsettings.json"),
    limit: Annotated[int | None, typer.Option("--limit", min=1, help="Maximum number of FEN lines to process.")] = None,
    overwrite: Annotated[bool, typer.Option("--overwrite", help="Regenerate existing DB-backed solutions.")] = False,
    parallel: Annotated[int, typer.Option("--parallel", min=1, help="Number of FENs to solve concurrently.")] = 4,
) -> None:
    settings = load_settings(config)
    fen_file = input_dir / name / f"{name}.fen"

    if not fen_file.exists():
        raise typer.BadParameter(f"FEN file does not exist: {fen_file}")

    server = SolutionServerClient(server_url)
    managed_server = _ensure_server(server, server_dir, no_start_server)
    try:
        _solve_fens_with_server(server, settings, fen_file, name, limit, overwrite, parallel)
    finally:
        if managed_server is not None:
            managed_server.stop()


def _solve_fens_with_server(
    server: SolutionServerClient,
    settings: AppSettings,
    fen_file: Path,
    name: str,
    limit: int | None,
    overwrite: bool,
    parallel: int,
) -> None:
    server.check_health()

    lines = _read_fens(fen_file)
    if limit is not None:
        lines = lines[:limit]

    solved_count = 0
    skipped_count = 0
    error_count = 0

    existing_fens: set[str] = set()
    if not overwrite and lines:
        existing_fens = server.existing_fens(name, [fen for _, fen in lines])

    work_items: list[WorkItem] = []
    for index, fen in lines:
        if fen in existing_fens:
            skipped_count += 1
            typer.echo(f"skip existing {name}/{index}")
            continue
        work_items.append(WorkItem(index=index, fen=fen))

    if work_items:
        run_start = time.perf_counter()
        store_batch: list[StoredSolution] = []
        with ProcessPoolExecutor(max_workers=parallel, initializer=_init_worker, initargs=(settings,)) as executor:
            pending_items = iter(work_items)
            futures: dict[Future[WorkResult], WorkItem] = {}

            def submit_next() -> bool:
                try:
                    item = next(pending_items)
                except StopIteration:
                    return False
                futures[executor.submit(_solve_work_item, item)] = item
                return True

            for _ in range(min(parallel, len(work_items))):
                submit_next()

            while futures:
                done, _ = wait(futures, return_when=FIRST_COMPLETED)
                for future in done:
                    item = futures.pop(future)
                    try:
                        result = future.result()
                    except Exception as exc:
                        result = WorkResult(
                            item=item,
                            status="error",
                            error_type=type(exc).__name__,
                            error_message=str(exc),
                        )
                    elapsed = _format_duration(result.elapsed_seconds)
                    if result.status == "error":
                        error_count += 1
                        typer.echo(f"error {result.item.index} in {elapsed}: {result.error_message}", err=True)
                        submit_next()
                        continue

                    if result.document is None:
                        skipped_count += 1
                        typer.echo(f"skip {result.item.index} in {elapsed}: {result.reason}")
                        submit_next()
                        continue

                    store_batch.append(StoredSolution(item=result.item, document=result.document, elapsed=elapsed))
                    if len(store_batch) >= 25:
                        solved_count += _flush_store_batch(server, name, store_batch)
                    submit_next()
            solved_count += _flush_store_batch(server, name, store_batch)
        typer.echo(f"run done in {_format_duration(time.perf_counter() - run_start)}")

    typer.echo(f"done: solved={solved_count} skipped={skipped_count} errors={error_count}")


class ManagedServer:
    def __init__(self, server_dir: Path) -> None:
        self._server_dir = server_dir
        self._process: subprocess.Popen[bytes] | None = None

    def start(self) -> None:
        package_json = self._server_dir / "package.json"
        if not package_json.exists():
            raise RuntimeError(f"Server directory does not contain package.json: {self._server_dir}")

        typer.echo(f"starting server in {self._server_dir}")
        self._process = subprocess.Popen(
            ["npm", "run", "dev"],
            cwd=self._server_dir,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            start_new_session=True,
        )

    def poll(self) -> int | None:
        if self._process is None:
            return None
        return self._process.poll()

    def stop(self) -> None:
        if self._process is None or self._process.poll() is not None:
            return

        typer.echo("stopping server")
        try:
            os.killpg(os.getpgid(self._process.pid), signal.SIGTERM)
        except OSError:
            self._process.terminate()

        try:
            self._process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            try:
                os.killpg(os.getpgid(self._process.pid), signal.SIGKILL)
            except OSError:
                self._process.kill()
            self._process.wait()


@dataclass(frozen=True)
class StoredSolution:
    item: WorkItem
    document: dict[str, Any]
    elapsed: str


class SolutionServerClient:
    def __init__(self, base_url: str) -> None:
        self._base_url = base_url.rstrip("/")

    @property
    def base_url(self) -> str:
        return self._base_url

    def check_health(self) -> None:
        self._request("GET", "/health")

    def is_healthy(self) -> bool:
        try:
            self.check_health()
        except RuntimeError:
            return False
        return True

    def existing_fens(self, collection: str, fens: list[str]) -> set[str]:
        existing: set[str] = set()
        for chunk in _chunks(fens, 1000):
            body = self._request(
                "POST",
                "/v1/solver/solutions/existing",
                {"collection": collection, "fens": chunk},
            )
            values = body.get("existing")
            if not isinstance(values, list) or not all(isinstance(value, str) for value in values):
                raise RuntimeError("Server returned an invalid existing-solutions response")
            existing.update(values)
        return existing

    def store(self, collection: str, solutions: list[dict[str, Any]]) -> int:
        body = self._request(
            "POST",
            "/v1/solver/solutions",
            {"collection": collection, "solutions": solutions},
        )
        stored = body.get("stored")
        if not isinstance(stored, int):
            raise RuntimeError("Server returned an invalid solution-store response")
        return stored

    def _request(self, method: str, path: str, data: dict[str, Any] | None = None) -> dict[str, Any]:
        payload = None if data is None else json.dumps(data, separators=(",", ":")).encode("utf-8")
        request = Request(
            f"{self._base_url}{path}",
            data=payload,
            method=method,
            headers={"Content-Type": "application/json"} if payload is not None else {},
        )
        try:
            with urlopen(request, timeout=30) as response:
                raw = response.read().decode("utf-8")
        except HTTPError as exc:
            details = exc.read().decode("utf-8", errors="replace")
            raise RuntimeError(f"Server request failed: HTTP {exc.code} {details}") from exc
        except URLError as exc:
            raise RuntimeError(f"Could not reach Woodpecker server at {self._base_url}: {exc.reason}") from exc

        if not raw:
            return {}
        parsed = json.loads(raw)
        if not isinstance(parsed, dict):
            raise RuntimeError("Server returned a non-object JSON response")
        return parsed


def _ensure_server(server: SolutionServerClient, server_dir: Path, no_start_server: bool) -> ManagedServer | None:
    if server.is_healthy():
        return None
    if no_start_server:
        server.check_health()

    managed_server = ManagedServer(server_dir)
    managed_server.start()

    try:
        deadline = time.monotonic() + 20
        while time.monotonic() < deadline:
            exit_code = managed_server.poll()
            if exit_code is not None:
                raise RuntimeError(f"Woodpecker server exited before becoming healthy: exit code {exit_code}")
            if server.is_healthy():
                return managed_server
            time.sleep(0.25)

        raise RuntimeError(f"Woodpecker server did not become healthy at {server.base_url} within 20s")
    except BaseException:
        managed_server.stop()
        raise


def _flush_store_batch(server: SolutionServerClient, collection: str, batch: list[StoredSolution]) -> int:
    if not batch:
        return 0

    stored = server.store(
        collection,
        [{"fen": item.item.fen, "tree": item.document} for item in batch],
    )
    for item in batch:
        typer.echo(f"solved {collection}/{item.item.index} in {item.elapsed}")
    batch.clear()
    return stored


def _init_worker(settings: AppSettings) -> None:
    global _worker_analyzer, _worker_settings
    _worker_settings = settings
    _worker_analyzer = StockfishAnalyzer(settings)
    atexit.register(_close_worker_analyzer)


def _close_worker_analyzer() -> None:
    global _worker_analyzer
    if _worker_analyzer is None:
        return
    analyzer = _worker_analyzer
    _worker_analyzer = None
    analyzer.close()


def _solve_work_item(item: WorkItem) -> WorkResult:
    print(f"solving {item.index}: {item.fen}", flush=True)
    start = time.perf_counter()
    try:
        _validate_fen(item.fen)
        if _worker_settings is None or _worker_analyzer is None:
            raise RuntimeError("Worker Stockfish analyzer is not initialized")
        result = FenSolver(_worker_settings, _worker_analyzer).solve(item.fen)
    except Exception as exc:
        return WorkResult(
            item=item,
            status="error",
            error_type=type(exc).__name__,
            error_message=str(exc),
            elapsed_seconds=time.perf_counter() - start,
        )

    return WorkResult(
        item=item,
        status=result.status,
        document=result.document,
        reason=result.reason,
        elapsed_seconds=time.perf_counter() - start,
    )


def _read_fens(path: Path) -> list[tuple[int, str]]:
    fens: list[tuple[int, str]] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        fen = line.strip()
        if fen:
            fens.append((len(fens) + 1, fen))
    return fens


def _format_duration(seconds: float | None) -> str:
    if seconds is None:
        return "unknown"
    return f"{seconds:.2f}s"


def _validate_fen(fen: str) -> None:
    board = chess.Board(fen)
    status = board.status()
    if status != chess.STATUS_VALID:
        raise ValueError(f"Invalid FEN status: {status}")


def _chunks[T](items: list[T], size: int) -> list[list[T]]:
    return [items[index : index + size] for index in range(0, len(items), size)]


if __name__ == "__main__":
    app()
