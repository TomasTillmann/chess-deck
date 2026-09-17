from __future__ import annotations

from contextlib import suppress
from dataclasses import dataclass

import chess
import chess.engine

from woodpecker_solver.config import AppSettings


@dataclass(frozen=True)
class Candidate:
    move: chess.Move
    mover_eval: int
    solver_eval: int
    mover_mate: int | None = None
    solver_mate: int | None = None
    pv: tuple[chess.Move, ...] = ()
    depth: int = 0


class StockfishAnalyzer:
    def __init__(self, settings: AppSettings) -> None:
        self._settings = settings
        options: dict[str, object] = {
            "Threads": settings.engine.threads,
            "Hash": settings.engine.hash_mb,
            "UCI_LimitStrength": settings.engine.limit_strength,
        }
        if settings.engine.limit_strength:
            options["UCI_Elo"] = settings.engine.uci_elo
        self._engine = chess.engine.SimpleEngine.popen_uci(settings.engine.path)
        self._closed = False
        try:
            self.name = self._engine.id.get("name", settings.engine.path)
            self._engine.configure(options)
        except BaseException:
            with suppress(Exception):
                self._engine.close()
            raise

    def close(self) -> None:
        if self._closed:
            return
        self._closed = True
        try:
            self._engine.quit()
        except BaseException:
            with suppress(Exception):
                self._engine.close()
            raise
        else:
            self._engine.close()

    def __enter__(self) -> StockfishAnalyzer:
        return self

    def __exit__(self, exc_type: object, exc: object, tb: object) -> None:
        if exc is None:
            self.close()
        else:
            with suppress(Exception):
                self.close()

    def candidates(
        self,
        board: chess.Board,
        side_to_solve: chess.Color,
        multipv: int | None = None,
        *,
        verify: bool = False,
        root: bool = False,
        root_moves: list[chess.Move] | None = None,
        time_limit: float | None = None,
    ) -> list[Candidate]:
        legal_count = len(root_moves) if root_moves is not None else board.legal_moves.count()
        if legal_count == 0:
            return []
        settings = self._settings.engine
        time_ms = settings.root_movetime_ms if root else settings.verification_movetime_ms if verify else settings.movetime_ms
        seconds = min(time_ms, settings.max_movetime_ms) / 1000
        if time_limit is not None:
            seconds = min(seconds, time_limit)
        if seconds <= 0:
            return []
        infos = self._engine.analyse(
            board,
            chess.engine.Limit(depth=settings.depth, time=seconds),
            multipv=min(multipv or settings.multipv, legal_count),
            root_moves=root_moves,
            info=chess.engine.INFO_SCORE | chess.engine.INFO_PV | chess.engine.INFO_BASIC,
        )
        if isinstance(infos, dict):
            infos = [infos]
        candidates = []
        for info in infos:
            pv, score = info.get("pv"), info.get("score")
            if not pv or score is None:
                continue
            mover, solver = score.pov(board.turn), score.pov(side_to_solve)
            candidates.append(Candidate(
                move=pv[0],
                mover_eval=int(mover.score(mate_score=self._settings.solver.mate_score_cp) or 0),
                solver_eval=int(solver.score(mate_score=self._settings.solver.mate_score_cp) or 0),
                mover_mate=mover.mate(),
                solver_mate=solver.mate(),
                pv=tuple(pv),
                depth=info.get("depth", 0),
            ))
        return sorted(candidates, key=lambda candidate: candidate.mover_eval, reverse=True)
