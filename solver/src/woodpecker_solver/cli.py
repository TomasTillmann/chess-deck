from __future__ import annotations

import atexit
import json
import time
from concurrent.futures import FIRST_COMPLETED, Future, ProcessPoolExecutor, wait
from dataclasses import dataclass
from pathlib import Path
from typing import Annotated, Any

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
    target: Path


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
    output_dir: Annotated[Path, typer.Option("--output", file_okay=False, dir_okay=True, help="Base solved output directory.")],
    config: Annotated[Path, typer.Option("--config", exists=True, dir_okay=False, help="Path to appsettings.json.")] = Path("appsettings.json"),
    limit: Annotated[int | None, typer.Option("--limit", min=1, help="Maximum number of FEN lines to process.")] = None,
    overwrite: Annotated[bool, typer.Option("--overwrite", help="Regenerate existing output files.")] = False,
    parallel: Annotated[int, typer.Option("--parallel", min=1, help="Number of FENs to solve concurrently.")] = 4,
) -> None:
    settings = load_settings(config)
    fen_file = input_dir / name / f"{name}.fen"
    collection_output = output_dir / name
    collection_output.mkdir(parents=True, exist_ok=True)
    error_log = collection_output / settings.logging.error_log
    if overwrite and error_log.exists():
        error_log.unlink()

    if not fen_file.exists():
        raise typer.BadParameter(f"FEN file does not exist: {fen_file}")

    lines = _read_fens(fen_file)
    if limit is not None:
        lines = lines[:limit]

    solved_count = 0
    skipped_count = 0
    error_count = 0

    work_items: list[WorkItem] = []
    for index, fen in lines:
        target = collection_output / f"{index}.json"
        if target.exists() and not overwrite:
            skipped_count += 1
            typer.echo(f"skip existing {target}")
            continue
        work_items.append(WorkItem(index=index, fen=fen, target=target))

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
                    if result.status == "error":
                        error_count += 1
                        if overwrite and result.item.target.exists():
                            result.item.target.unlink()
                        _append_error(
                            error_log,
                            {
                                "index": result.item.index,
                                "fen": result.item.fen,
                                "error": result.error_type,
                                "message": result.error_message,
                            },
                        )
                        typer.echo(f"error {result.item.index} in {elapsed}: {result.error_message}", err=True)
                        submit_next()
                        continue

                    if result.document is None:
                        skipped_count += 1
                        if overwrite and result.item.target.exists():
                            result.item.target.unlink()
                        _append_error(
                            error_log,
                            {
                                "index": result.item.index,
                                "fen": result.item.fen,
                                "status": result.status,
                                "reason": result.reason,
                            },
                        )
                        typer.echo(f"skip {result.item.index} in {elapsed}: {result.reason}")
                        submit_next()
                        continue

                    _write_json(result.item.target, result.document, pretty=settings.output.pretty_json)
                    solved_count += 1
                    typer.echo(f"solved {result.item.target} in {elapsed}")
                    submit_next()
        typer.echo(f"run done in {_format_duration(time.perf_counter() - run_start)}")

    typer.echo(f"done: solved={solved_count} skipped={skipped_count} errors={error_count}")


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


def _write_json(path: Path, data: dict[str, Any], pretty: bool) -> None:
    if pretty:
        path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
    else:
        path.write_text(json.dumps(data, separators=(",", ":")) + "\n", encoding="utf-8")


def _append_error(path: Path, data: dict[str, Any]) -> None:
    with path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(data, separators=(",", ":")) + "\n")


if __name__ == "__main__":
    app()
