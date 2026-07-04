from __future__ import annotations

from dataclasses import dataclass

import chess
import chess.engine

from woodpecker_solver.config import AppSettings


@dataclass(frozen=True)
class Candidate:
    move: chess.Move
    mover_eval: int
    solver_eval: int


class StockfishAnalyzer:
    def __init__(self, settings: AppSettings) -> None:
        self._settings = settings
        self._engine = chess.engine.SimpleEngine.popen_uci(settings.engine.path)
        options: dict[str, object] = {
            "Threads": settings.engine.threads,
            "Hash": settings.engine.hash_mb,
            "UCI_LimitStrength": settings.engine.limit_strength,
        }
        if settings.engine.limit_strength:
            options["UCI_Elo"] = settings.engine.uci_elo
        self._engine.configure(options)

    def close(self) -> None:
        self._engine.quit()

    def __enter__(self) -> StockfishAnalyzer:
        return self

    def __exit__(self, exc_type: object, exc: object, tb: object) -> None:
        self.close()

    def candidates(
        self,
        board: chess.Board,
        side_to_solve: chess.Color,
        multipv: int | None = None,
    ) -> list[Candidate]:
        legal_count = board.legal_moves.count()
        if legal_count == 0:
            return []

        infos = self._engine.analyse(
            board,
            self._limit(),
            multipv=min(multipv or self._settings.engine.multipv, legal_count),
        )
        if isinstance(infos, dict):
            infos = [infos]

        candidates: list[Candidate] = []
        for info in infos:
            pv = info.get("pv")
            score = info.get("score")
            if not pv or score is None:
                continue
            move = pv[0]
            candidates.append(
                Candidate(
                    move=move,
                    mover_eval=_score_cp(score, board.turn, self._settings.solver.mate_score_cp),
                    solver_eval=_score_cp(score, side_to_solve, self._settings.solver.mate_score_cp),
                )
            )
        candidates.sort(key=lambda candidate: candidate.mover_eval, reverse=True)
        return candidates

    def static_eval(self, board: chess.Board, side_to_solve: chess.Color) -> int | None:
        infos = self._engine.analyse(board, self._limit(), multipv=1)
        if isinstance(infos, list):
            infos = infos[0] if infos else {}
        score = infos.get("score")
        if score is None:
            return None
        return _score_cp(score, side_to_solve, self._settings.solver.mate_score_cp)

    def _limit(self) -> chess.engine.Limit:
        depth = self._settings.engine.depth
        time_ms = min(self._settings.engine.movetime_ms, self._settings.engine.max_movetime_ms)
        if depth is not None:
            return chess.engine.Limit(depth=depth, time=time_ms / 1000)
        return chess.engine.Limit(time=time_ms / 1000)


def _score_cp(score: chess.engine.PovScore, pov: chess.Color, mate_score_cp: int) -> int:
    value = score.pov(pov).score(mate_score=mate_score_cp)
    if value is None:
        return 0
    return int(value)
