from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import chess

from woodpecker_solver.config import AppSettings
from woodpecker_solver.engine import Candidate, StockfishAnalyzer


@dataclass(frozen=True)
class SolveResult:
    status: str
    document: dict[str, Any] | None
    reason: str | None = None


class FenSolver:
    def __init__(self, settings: AppSettings, analyzer: StockfishAnalyzer) -> None:
        self._settings = settings
        self._analyzer = analyzer

    def solve(self, fen: str) -> SolveResult:
        board = chess.Board(fen)
        side_to_solve = board.turn
        root = self._build_node(board, side_to_solve, depth=0, is_root=True)
        if root is None:
            return SolveResult(status="skipped", document=None, reason="no_clear_root_cluster")
        return SolveResult(
            status="solved",
            document={
                "fen": fen,
                "sideToSolve": "w" if side_to_solve == chess.WHITE else "b",
                "status": "solved",
                "root": root,
            },
        )

    def _build_node(
        self,
        board: chess.Board,
        side_to_solve: chess.Color,
        depth: int,
        is_root: bool = False,
    ) -> dict[str, Any] | None:
        candidates = self._analyzer.candidates(board, side_to_solve)
        eval_cp = candidates[0].solver_eval if candidates else self._analyzer.static_eval(board, side_to_solve)
        node = self._node(board, eval_cp)

        if board.is_checkmate():
            node["terminal"] = "checkmate"
            return node
        if board.is_stalemate() or board.is_insufficient_material() or board.is_seventyfive_moves():
            node["terminal"] = "draw"
            return node
        if depth >= self._settings.solver.max_depth:
            node["terminal"] = "max_depth"
            return node
        if self._is_robust_win(board, side_to_solve, eval_cp, candidates):
            node["terminal"] = "robust_win"
            return node

        cluster = _clear_cluster(candidates, self._settings)
        if cluster is None:
            if board.turn == side_to_solve:
                if is_root and self._settings.solver.skip_if_no_clear_gap:
                    return None
                node["terminal"] = "no_clear_gap"
                return node
            cluster = candidates[:1]

        for candidate in cluster[: self._settings.solver.max_best_moves]:
            child_board = board.copy(stack=False)
            child_board.push(candidate.move)
            move_node: dict[str, Any] = {"uci": candidate.move.uci()}
            if self._settings.solver.include_evals:
                move_node["eval"] = candidate.solver_eval
            move_node["children"] = []
            child = self._build_node(child_board, side_to_solve, depth + 1)
            if child is not None:
                move_node["children"].append(child)
            node["moves"].append(move_node)

        return node

    def _node(self, board: chess.Board, eval_cp: int | None) -> dict[str, Any]:
        node: dict[str, Any] = {
            "fen": board.fen(),
            "turn": "w" if board.turn == chess.WHITE else "b",
        }
        if self._settings.solver.include_evals:
            node["eval"] = eval_cp
        node["terminal"] = None
        node["moves"] = []
        return node

    def _is_robust_win(
        self,
        board: chess.Board,
        side_to_solve: chess.Color,
        eval_cp: int | None,
        candidates: list[Candidate],
    ) -> bool:
        settings = self._settings.solver
        if board.turn != side_to_solve:
            return False
        if eval_cp is None or eval_cp < settings.winning_eval_cp:
            return False
        if board.legal_moves.count() < settings.min_moves_for_robust_stop:
            return False

        sample = candidates
        if len(sample) < min(settings.robust_sample_multipv, board.legal_moves.count()):
            sample = self._analyzer.candidates(
                board,
                side_to_solve,
                multipv=max(settings.robust_sample_multipv, self._settings.engine.multipv),
            )
        sample = sample[: settings.robust_sample_multipv]
        if len(sample) < settings.min_moves_for_robust_stop:
            return False

        winning = sum(1 for candidate in sample if candidate.solver_eval >= settings.winning_eval_cp)
        return winning / len(sample) >= settings.robust_win_ratio


def _clear_cluster(candidates: list[Candidate], settings: AppSettings) -> list[Candidate] | None:
    if not candidates:
        return []
    if len(candidates) == 1:
        return candidates

    solver_settings = settings.solver
    best = candidates[0].mover_eval
    cluster: list[Candidate] = []
    for candidate in candidates:
        if best - candidate.mover_eval <= solver_settings.best_move_margin_cp:
            cluster.append(candidate)
            continue
        break

    next_index = len(cluster)
    if next_index >= len(candidates):
        return None

    gap = cluster[-1].mover_eval - candidates[next_index].mover_eval
    if gap < solver_settings.clear_gap_cp:
        return None
    return cluster
