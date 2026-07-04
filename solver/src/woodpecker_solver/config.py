from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class EngineSettings:
    path: str
    movetime_ms: int
    max_movetime_ms: int
    depth: int | None
    threads: int
    hash_mb: int
    limit_strength: bool
    uci_elo: int
    multipv: int


@dataclass(frozen=True)
class SolverSettings:
    max_depth: int
    best_move_margin_cp: int
    clear_gap_cp: int
    winning_eval_cp: int
    robust_win_ratio: float
    robust_sample_multipv: int
    min_moves_for_robust_stop: int
    mate_score_cp: int
    max_best_moves: int
    skip_if_no_clear_gap: bool
    include_evals: bool


@dataclass(frozen=True)
class OutputSettings:
    pretty_json: bool


@dataclass(frozen=True)
class LoggingSettings:
    error_log: str


@dataclass(frozen=True)
class AppSettings:
    engine: EngineSettings
    solver: SolverSettings
    output: OutputSettings
    logging: LoggingSettings


def _section(data: dict[str, Any], name: str) -> dict[str, Any]:
    value = data.get(name)
    if not isinstance(value, dict):
        raise ValueError(f"Missing or invalid '{name}' section in config")
    return value


def load_settings(path: Path) -> AppSettings:
    data = json.loads(path.read_text(encoding="utf-8"))
    engine = _section(data, "engine")
    solver = _section(data, "solver")
    output = _section(data, "output")
    logging = _section(data, "logging")

    return AppSettings(
        engine=EngineSettings(
            path=str(engine["path"]),
            movetime_ms=int(engine["movetime_ms"]),
            max_movetime_ms=int(engine["max_movetime_ms"]),
            depth=None if engine.get("depth") is None else int(engine["depth"]),
            threads=int(engine["threads"]),
            hash_mb=int(engine["hash_mb"]),
            limit_strength=bool(engine["limit_strength"]),
            uci_elo=int(engine["uci_elo"]),
            multipv=int(engine["multipv"]),
        ),
        solver=SolverSettings(
            max_depth=int(solver["max_depth"]),
            best_move_margin_cp=int(solver["best_move_margin_cp"]),
            clear_gap_cp=int(solver["clear_gap_cp"]),
            winning_eval_cp=int(solver["winning_eval_cp"]),
            robust_win_ratio=float(solver["robust_win_ratio"]),
            robust_sample_multipv=int(solver["robust_sample_multipv"]),
            min_moves_for_robust_stop=int(solver["min_moves_for_robust_stop"]),
            mate_score_cp=int(solver["mate_score_cp"]),
            max_best_moves=int(solver["max_best_moves"]),
            skip_if_no_clear_gap=bool(solver["skip_if_no_clear_gap"]),
            include_evals=bool(solver["include_evals"]),
        ),
        output=OutputSettings(pretty_json=bool(output["pretty_json"])),
        logging=LoggingSettings(error_log=str(logging["error_log"])),
    )
