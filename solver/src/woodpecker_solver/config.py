from __future__ import annotations

import json
import math
from dataclasses import dataclass
from pathlib import Path
from typing import Any, get_type_hints


@dataclass(frozen=True)
class EngineSettings:
    path: str = "stockfish"
    movetime_ms: int = 500
    root_movetime_ms: int = 5000
    verification_movetime_ms: int = 2000
    max_movetime_ms: int = 5000
    depth: int | None = None
    threads: int = 1
    hash_mb: int = 128
    limit_strength: bool = False
    uci_elo: int = 3000
    multipv: int = 4


@dataclass(frozen=True)
class SolverSettings:
    max_depth: int = 20
    max_nodes: int = 120
    max_seconds: float = 90
    best_move_margin_cp: int = 80
    defense_margin_cp: int = 180
    forcing_defense_margin_cp: int = 300
    max_candidates: int = 12
    mate_distance_slack: int = 2
    winning_eval_cp: int = 300
    decisive_eval_cp: int = 500
    material_gain_cp: int = 150
    stable_material_cp: int = 300
    min_solution_plies: int = 2
    sound_continuations: int = 3
    stability_plies: int = 6
    mate_score_cp: int = 100000
    include_evals: bool = True


@dataclass(frozen=True)
class AppSettings:
    engine: EngineSettings
    solver: SolverSettings


def _section(data: dict[str, Any], name: str, cls: type[EngineSettings] | type[SolverSettings]) -> dict[str, Any]:
    section = data.get(name)
    if not isinstance(section, dict):
        raise ValueError(f"Missing or invalid '{name}' section in config")
    types = get_type_hints(cls)
    for key, value in section.items():
        if key not in types:
            raise ValueError(f"Unknown config field '{name}.{key}'")
        expected = types[key]
        if expected is float:
            valid = type(value) is int or (type(value) is float and math.isfinite(value))
            requirement = "a finite number"
        elif expected == int | None:
            valid = value is None or type(value) is int
            requirement = "an integer or null"
        else:
            valid = type(value) is expected
            requirement = {int: "an integer", bool: "a boolean", str: "a string"}[expected]
        if not valid:
            raise ValueError(f"{name}.{key} must be {requirement}")
    return section


def load_settings(path: Path) -> AppSettings:
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise ValueError("Config must be a JSON object")
    for key in data:
        if key not in ("engine", "solver"):
            raise ValueError(f"Unknown config field '{key}'")
    settings = AppSettings(
        engine=EngineSettings(**_section(data, "engine", EngineSettings)),
        solver=SolverSettings(**_section(data, "solver", SolverSettings)),
    )
    for key in ("movetime_ms", "root_movetime_ms", "verification_movetime_ms", "max_movetime_ms", "threads", "hash_mb", "multipv"):
        if getattr(settings.engine, key) <= 0:
            raise ValueError(f"engine.{key} must be positive")
    if settings.engine.depth is not None and settings.engine.depth <= 0:
        raise ValueError("engine.depth must be positive or null")
    for key in ("max_depth", "max_nodes", "max_seconds", "max_candidates", "sound_continuations", "stability_plies", "mate_score_cp"):
        if getattr(settings.solver, key) <= 0:
            raise ValueError(f"solver.{key} must be positive")
    for key in ("best_move_margin_cp", "defense_margin_cp", "forcing_defense_margin_cp", "mate_distance_slack", "winning_eval_cp", "decisive_eval_cp", "material_gain_cp", "stable_material_cp", "min_solution_plies"):
        if getattr(settings.solver, key) < 0:
            raise ValueError(f"solver.{key} must be nonnegative")
    if settings.solver.max_candidates < settings.engine.multipv:
        raise ValueError("solver.max_candidates must be at least engine.multipv")
    if settings.solver.sound_continuations > settings.engine.multipv:
        raise ValueError("solver.sound_continuations must not exceed engine.multipv")
    return settings
