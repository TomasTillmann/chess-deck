from __future__ import annotations

import json
import os
import re
import signal
import subprocess
import time
from concurrent.futures import FIRST_COMPLETED, Future, ProcessPoolExecutor, wait
from dataclasses import asdict, dataclass
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
    input_dir: Annotated[Path | None, typer.Option("--input", file_okay=False, dir_okay=True, help="Base FEN input directory (requires --name).")] = None,
    name: Annotated[str | None, typer.Option("--name", help="Collection slug; defaults to the deck filename.")] = None,
    deck: Annotated[Path | None, typer.Option("--deck", exists=True, help="FEN file or folder containing one FEN file.")] = None,
    server_url: Annotated[str, typer.Option("--server-url", help="Base URL for the Woodpecker server.")] = "http://127.0.0.1:3001",
    server_dir: Annotated[Path, typer.Option("--server-dir", file_okay=False, dir_okay=True, help="Woodpecker server project directory.")] = Path("../app/server"),
    no_start_server: Annotated[bool, typer.Option("--no-start-server", help="Require an already-running server instead of starting one.")] = False,
    config: Annotated[Path, typer.Option("--config", exists=True, dir_okay=False, help="Path to appsettings.json.")] = Path("appsettings.json"),
    limit: Annotated[int | None, typer.Option("--limit", min=1, help="Maximum number of FEN lines to process.")] = None,
    overwrite: Annotated[bool, typer.Option("--overwrite", help="Regenerate and replace existing solutions, including manual edits.")] = False,
    parallel: Annotated[int, typer.Option("--parallel", min=1, help="Number of FENs to solve concurrently.")] = 4,
    positions: Annotated[str | None, typer.Option("--positions", help="Comma-separated 1-based puzzle numbers, selected before --limit.")] = None,
    report: Annotated[Path | None, typer.Option("--report", dir_okay=False, help="Append generated documents and storage/error events to JSONL; reruns skip stored FENs.")] = None,
) -> None:
    settings = load_settings(config)
    fen_file, name = _resolve_deck(deck, input_dir, name)
    selected = _select_fens(_read_fens(fen_file), positions, limit)

    server = SolutionServerClient(server_url)
    managed_server = _ensure_server(server, server_dir, no_start_server)
    try:
        errors = _solve_fens_with_server(server, settings, fen_file, name, limit, overwrite, parallel, selected, report)
    finally:
        if managed_server is not None:
            managed_server.stop()
    if errors:
        raise typer.Exit(code=1)


def _resolve_deck(deck: Path | None, input_dir: Path | None, name: str | None) -> tuple[Path, str]:
    if deck is not None:
        if input_dir is not None:
            raise typer.BadParameter("Use either --deck or --input, not both")
        if deck.is_dir():
            files = sorted(deck.glob("*.fen"))
            preferred = deck / f"{deck.name}.fen"
            if preferred in files:
                deck = preferred
            elif len(files) == 1:
                deck = files[0]
            else:
                raise typer.BadParameter(f"Expected one .fen file in {deck}; pass a file explicitly")
        if name is None:
            name = re.sub(r"[^a-z0-9_-]+", "-", deck.stem.lower()).strip("-")
            if name and not "a" <= name[0] <= "z":
                name = f"deck-{name}"
        fen_file = deck
    else:
        if input_dir is None or name is None:
            raise typer.BadParameter("Provide --deck PATH or both --input DIR and --name COLLECTION")
        fen_file = input_dir / name / f"{name}.fen"
    if not name or re.fullmatch(r"[a-z][a-z0-9_-]{0,63}", name) is None:
        raise typer.BadParameter("Collection slug must start with a lowercase letter and contain only "
                                 "lowercase letters, digits, underscores or hyphens (max 64); provide --name")
    if not fen_file.is_file() or fen_file.suffix.lower() != ".fen":
        raise typer.BadParameter(f"FEN file does not exist or is not a .fen file: {fen_file}")
    return fen_file, name


def _select_fens(lines: list[tuple[int, str]], positions: str | None, limit: int | None) -> list[tuple[int, str]]:
    if positions is not None:
        try:
            selected = {int(value.strip()) for value in positions.split(",")}
        except ValueError as exc:
            raise typer.BadParameter("--positions requires comma-separated positive integers") from exc
        if not selected or min(selected) < 1 or max(selected) > len(lines):
            raise typer.BadParameter(f"--positions must be between 1 and {len(lines)}")
        lines = [(index, fen) for index, fen in lines if index in selected]
    return lines[:limit] if limit is not None else lines


def _solve_fens_with_server(
    server: SolutionServerClient,
    settings: AppSettings,
    fen_file: Path,
    name: str,
    limit: int | None,
    overwrite: bool,
    parallel: int,
    selected: list[tuple[int, str]] | None = None,
    report: Path | None = None,
) -> int:
    server.check_health()
    lines = selected if selected is not None else _select_fens(_read_fens(fen_file), None, limit)
    indices: dict[str, list[int]] = {}
    for index, fen in lines:
        indices.setdefault(fen, []).append(index)
    if report is not None:
        if report.resolve() == fen_file.resolve():
            raise typer.BadParameter("--report cannot overwrite the input FEN file")
        report.parent.mkdir(parents=True, exist_ok=True)
    _write_report(report, {"event": "run", "collection": name, "source": str(fen_file.resolve()),
                           "positions": len(lines), "unique": len(indices), "overwrite": overwrite,
                           "settings": asdict(settings)})

    solved_count = 0
    review_count = 0
    skipped_count = 0
    error_count = 0

    existing_fens: set[str] = set()
    if not overwrite and lines:
        existing_fens = server.existing_fens(name, list(indices))

    work_items: list[WorkItem] = []
    for fen, position_ids in indices.items():
        index = position_ids[0]
        if fen in existing_fens:
            skipped_count += 1
            typer.echo(f"skip existing {name}/{index}")
            _write_report(report, {"event": "existing", "collection": name, "fen": fen, "positions": position_ids})
            continue
        work_items.append(WorkItem(index=index, fen=fen))

    if work_items:
        run_start = time.perf_counter()
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
                    record = {"collection": name, "fen": item.fen, "positions": indices[item.fen],
                              "status": result.status, "elapsed_seconds": result.elapsed_seconds}
                    if result.status == "error":
                        error_count += 1
                        typer.echo(f"error {result.item.index} in {elapsed}: {result.error_message}", err=True)
                        _write_report(report, {**record, "event": "error", "error_type": result.error_type,
                                               "error": result.error_message})
                        submit_next()
                        continue

                    if result.document is None:
                        review_count += 1
                        typer.echo(f"needs_review {result.item.index} in {elapsed}: {result.reason}")
                        _write_report(report, {**record, "event": "needs_review", "reason": result.reason})
                        submit_next()
                        continue

                    # Save the generated tree before storage so a server failure cannot discard it.
                    _write_report(report, {**record, "event": "generated", "document": result.document})
                    try:
                        status = result.document.get("status")
                        if status not in ("solved", "needs_review"):
                            raise RuntimeError(f"Unexpected solution status: {status!r}")
                        stored = server.store(name, [{"fen": item.fen, "tree": result.document}], overwrite=overwrite)
                        if stored == 0 and not overwrite:
                            skipped_count += 1
                            typer.echo(f"skip existing {name}/{item.index}")
                            _write_report(report, {**record, "event": "existing"})
                        else:
                            if stored != 1:
                                raise RuntimeError(f"Expected one stored solution, server reported {stored}")
                            solved_count += status == "solved"
                            review_count += status == "needs_review"
                            typer.echo(f"{status} {name}/{item.index} in {elapsed}")
                            _write_report(report, {**record, "event": "stored"})
                    except Exception as exc:
                        error_count += 1
                        typer.echo(f"store error {name}/{item.index}: {exc}", err=True)
                        _write_report(report, {**record, "event": "error", "stage": "storage",
                                               "error_type": type(exc).__name__, "error": str(exc)})
                    submit_next()
        typer.echo(f"run done in {_format_duration(time.perf_counter() - run_start)}")

    summary = {"positions": len(lines), "unique": len(indices), "solved": solved_count,
               "needs_review": review_count, "existing": skipped_count,
               "duplicates": len(lines) - len(indices), "errors": error_count}
    _write_report(report, {"event": "summary", "collection": name, **summary})
    typer.echo("done: " + " ".join(f"{key}={value}" for key, value in summary.items()))
    return error_count


def _write_report(path: Path | None, record: dict[str, Any]) -> None:
    if path is not None:
        with path.open("a", encoding="utf-8") as stream:
            stream.write(json.dumps(record, separators=(",", ":")) + "\n")


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

    def store(self, collection: str, solutions: list[dict[str, Any]], overwrite: bool = True) -> int:
        body = self._request(
            "POST",
            "/v1/solver/solutions",
            {"collection": collection, "solutions": solutions, "overwrite": overwrite},
        )
        stored = body.get("stored")
        if type(stored) is not int or stored < 0 or stored > len(solutions):
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


def _init_worker(settings: AppSettings) -> None:
    global _worker_settings
    _worker_settings = settings


def _solve_work_item(item: WorkItem) -> WorkResult:
    print(f"solving {item.index}: {item.fen}", flush=True)
    start = time.perf_counter()
    try:
        _validate_fen(item.fen)
        if _worker_settings is None:
            raise RuntimeError("Worker settings are not initialized")
        # Close python-chess's event loop before worker shutdown joins its threads.
        with StockfishAnalyzer(_worker_settings) as analyzer:
            result = FenSolver(_worker_settings, analyzer).solve(item.fen)
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
