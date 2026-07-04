from __future__ import annotations

import json
from pathlib import Path
from typing import Annotated, Any

import chess
import typer

from woodpecker_solver.config import load_settings
from woodpecker_solver.engine import StockfishAnalyzer
from woodpecker_solver.solver import FenSolver

app = typer.Typer(add_completion=False, no_args_is_help=True)


@app.command()
def solve_fens(
    input_dir: Annotated[Path, typer.Option("--input", file_okay=False, dir_okay=True, help="Base FEN input directory.")],
    name: Annotated[str, typer.Option("--name", help="Collection name.")],
    output_dir: Annotated[Path, typer.Option("--output", file_okay=False, dir_okay=True, help="Base solved output directory.")],
    config: Annotated[Path, typer.Option("--config", exists=True, dir_okay=False, help="Path to appsettings.json.")] = Path("appsettings.json"),
    limit: Annotated[int | None, typer.Option("--limit", min=1, help="Maximum number of FEN lines to process.")] = None,
    overwrite: Annotated[bool, typer.Option("--overwrite", help="Regenerate existing output files.")] = False,
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

    with StockfishAnalyzer(settings) as analyzer:
        solver = FenSolver(settings, analyzer)
        for index, fen in lines:
            target = collection_output / f"{index}.json"
            if target.exists() and not overwrite:
                skipped_count += 1
                typer.echo(f"skip existing {target}")
                continue

            try:
                _validate_fen(fen)
                result = solver.solve(fen)
            except Exception as exc:
                error_count += 1
                if overwrite and target.exists():
                    target.unlink()
                _append_error(error_log, {"index": index, "fen": fen, "error": type(exc).__name__, "message": str(exc)})
                typer.echo(f"error {index}: {exc}", err=True)
                continue

            if result.document is None:
                skipped_count += 1
                if overwrite and target.exists():
                    target.unlink()
                _append_error(error_log, {"index": index, "fen": fen, "status": result.status, "reason": result.reason})
                typer.echo(f"skip {index}: {result.reason}")
                continue

            _write_json(target, result.document, pretty=settings.output.pretty_json)
            solved_count += 1
            typer.echo(f"solved {target}")

    typer.echo(f"done: solved={solved_count} skipped={skipped_count} errors={error_count}")


def _read_fens(path: Path) -> list[tuple[int, str]]:
    fens: list[tuple[int, str]] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        fen = line.strip()
        if fen:
            fens.append((len(fens) + 1, fen))
    return fens


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
