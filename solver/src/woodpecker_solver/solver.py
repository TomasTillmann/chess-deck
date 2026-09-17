from __future__ import annotations

from dataclasses import asdict, dataclass, replace
from datetime import datetime, timezone
import time
from typing import Any

import chess

from woodpecker_solver.config import AppSettings
from woodpecker_solver.engine import Candidate, StockfishAnalyzer


@dataclass(frozen=True)
class SolveResult:
    status: str
    document: dict[str, Any] | None
    reason: str | None = None


class _DeadlineReached(Exception):
    pass


class FenSolver:
    def __init__(self, settings: AppSettings, analyzer: StockfishAnalyzer) -> None:
        self._settings = settings
        self._analyzer = analyzer

    def solve(self, fen: str) -> SolveResult:
        board = chess.Board(fen)
        if not board.is_valid():
            raise ValueError(f"Invalid chess position (status {board.status()}): {fen}")
        self._side = board.turn
        self._initial_material = _material(board, self._side)
        self._root_eval = None
        self._root_candidate: Candidate | None = None
        self._nodes = 0
        self._issues: set[str] = set()
        self._verified_defenses: dict[str, Candidate] = {}
        self._started = time.monotonic()
        root = self._build_node(board, depth=0)
        if not root["moves"]:
            reason = ", ".join(sorted(self._issues or {root["terminal"] or "empty_root"}))
            return SolveResult(status="needs_review", document=None, reason=reason)
        status = "needs_review" if self._issues else "solved"
        return SolveResult(status=status, document={
            "fen": fen,
            "sideToSolve": "w" if self._side else "b",
            "status": status,
            "source": "engine",
            "generator": {
                "name": "critical-tree",
                "version": 5,
                "engine": getattr(self._analyzer, "name", "Stockfish"),
                "generatedAt": datetime.now(timezone.utc).isoformat(),
                "settings": asdict(self._settings),
            },
            "quality": {
                "reviewReasons": sorted(self._issues),
                "nodes": self._nodes,
                "elapsedSeconds": round(time.monotonic() - self._started, 3),
            },
            "root": root,
        })

    def _build_node(self, board: chess.Board, depth: int) -> dict[str, Any]:
        node: dict[str, Any] = {
            "fen": board.fen(),
            "turn": "w" if board.turn else "b",
            "choice": "any" if board.turn == self._side else "all",
            "terminal": None,
            "moves": [],
        }
        self._nodes += 1
        try:
            return self._populate_node(board, depth, node)
        except _DeadlineReached:
            node["terminal"] = "max_seconds"
            self._review(node, "max_seconds")
            if depth == 0 and self._root_candidate is not None:
                candidate = self._root_candidate
                child = board.copy(stack=True)
                child.push(candidate.move)
                edge = {"uci": candidate.move.uci(), "children": [self._build_node(child, depth + 1)]}
                self._set_eval(node, candidate)
                self._set_eval(edge, candidate)
                node.update(terminal=None, moves=[edge])
            return node

    def _populate_node(self, board: chess.Board, depth: int, node: dict[str, Any]) -> dict[str, Any]:
        analysis_moves = None
        if board.is_checkmate():
            node["terminal"] = "checkmate"
            if board.turn == self._side:
                self._review(node, "solver_mated")
            return node
        if board.outcome(claim_draw=True) is not None:
            node["terminal"] = "draw"
            if self._root_eval is not None and self._root_eval >= self._settings.solver.winning_eval_cp:
                self._review(node, "winning_line_drawn")
            return node
        if board.turn == self._side:
            mates = _mates_in_one(board)
            if mates:
                for move in mates:
                    child = board.copy(stack=True)
                    child.push(move)
                    node["moves"].append({"uci": move.uci(), "children": [self._build_node(child, depth + 1)]})
                if self._settings.solver.include_evals:
                    node.update(eval=self._settings.solver.mate_score_cp - 1, mate=1)
                return node
        elif not board.is_check():
            mated_replies = _mate_in_one_responses(board)
            if mated_replies:
                node["immediateMateReplies"] = {move.uci(): [mate.uci() for mate in mates] for move, mates in mated_replies.items()}
                passed = board.copy(stack=True)
                passed.push(chess.Move.null())
                mate_threats = _mates_in_one(passed)
                if mate_threats:
                    node["matingThreats"] = [move.uci() for move in mate_threats]
                analysis_moves = [move for move in board.legal_moves if move not in mated_replies]
                if not analysis_moves:
                    node["terminal"] = "unavoidable_mate"
                    return node
        budget = self._budget(depth)
        if budget:
            node["terminal"] = budget
            self._review(node, budget)
            return node

        count = 2 if depth == 0 else self._settings.engine.multipv
        candidates = self._candidates(board, multipv=count, root=depth == 0,
                                               verify=depth == 1, root_moves=analysis_moves)
        verified_defense = self._verified_defenses.pop(board.fen(), None)
        if verified_defense is not None and analysis_moves is not None and verified_defense.move not in analysis_moves:
            verified_defense = None
        if verified_defense is not None and verified_defense.move not in {candidate.move for candidate in candidates}:
            candidates = sorted(candidates + [verified_defense], key=lambda candidate: candidate.mover_eval, reverse=True)
        if not candidates:
            node["terminal"] = "analysis_unavailable"
            self._review(node, "analysis_unavailable")
            return node
        if depth == 0:
            self._root_eval = candidates[0].solver_eval
        self._set_eval(node, candidates[0])
        if self._resolved(board, candidates, depth):
            candidates = self._candidates(board, verify=True, root_moves=analysis_moves)
            if not candidates:
                node["terminal"] = "analysis_unavailable"
                self._review(node, "analysis_unavailable")
                return node
            self._set_eval(node, candidates[0])
            if self._resolved(board, candidates, depth):
                node["terminal"] = self._resolved(board, candidates, depth)
                return node

        settings = self._settings.solver
        margin = settings.best_move_margin_cp if board.turn == self._side else settings.defense_margin_cp
        mate_slack = 0 if board.turn == self._side else settings.mate_distance_slack
        legal_count = len(analysis_moves) if analysis_moves is not None else board.legal_moves.count()
        while True:
            if board.turn == self._side and self._root_eval is not None and self._root_eval >= settings.winning_eval_cp:
                repeating = {candidate.move for candidate in candidates if _repeats_in_pv(board, candidate, settings.stability_plies)}
                if repeating:
                    nonrepeating = [candidate for candidate in candidates if candidate.move not in repeating and candidate.solver_eval >= settings.winning_eval_cp]
                    if not nonrepeating:
                        available = analysis_moves if analysis_moves is not None else list(board.legal_moves)
                        analysis_moves = [move for move in available if move not in repeating]
                        retried = self._candidates(board, multipv=count, verify=True, root_moves=analysis_moves)
                        nonrepeating = [candidate for candidate in retried if candidate.solver_eval >= settings.winning_eval_cp and not _repeats_in_pv(board, candidate, settings.stability_plies)]
                        legal_count = len(analysis_moves)
                    if not nonrepeating:
                        node["terminal"] = "repetition_unresolved"
                        self._review(node, "repetition_unresolved")
                        return node
                    candidates = nonrepeating
            if not (len(candidates) >= count and count < legal_count and _competitive(candidates[0], candidates[-1], margin, mate_slack)):
                break
            if count >= settings.max_candidates:
                self._review(node, "candidate_limit")
                break
            count = min(count * 2, settings.max_candidates, legal_count)
            candidates = self._candidates(board, multipv=count, root=depth == 0, root_moves=analysis_moves)
            if not candidates:
                node["terminal"] = "analysis_unavailable"
                self._review(node, "analysis_unavailable")
                return node
        self._set_eval(node, candidates[0])
        selected = [candidate for candidate in candidates if _competitive(candidates[0], candidate, margin, mate_slack)]

        if depth == 0:
            if len(selected) > 1 and candidates[0].solver_eval <= settings.best_move_margin_cp:
                self._review(node, "ambiguous_root")
                forcing = [candidate for candidate in selected if board.is_capture(candidate.move) or board.gives_check(candidate.move) or candidate.move.promotion]
                selected = (forcing or selected)[:1]
            # Root MultiPV alternatives can contain horizon artifacts: probe each
            # resulting position independently before treating it as acceptable.
            verified = []
            for candidate in selected:
                child = board.copy(stack=True)
                child.push(candidate.move)
                replies = self._candidates(child, multipv=1, verify=True)
                if replies:
                    score = replies[0]
                    if (candidate.solver_mate is not None and candidate.solver_mate > 0 and score.solver_mate is None) or (candidate.solver_eval >= settings.winning_eval_cp > score.solver_eval):
                        stronger = self._candidates(child, multipv=1, root=True)
                        if stronger:
                            score = stronger[0]
                    if candidate.solver_mate is not None and candidate.solver_mate > 0 and score.solver_mate is None:
                        self._review(node, "root_mate_unconfirmed")
                    self._verified_defenses[child.fen()] = score
                    mate = score.solver_mate + 1 if score.solver_mate is not None and score.solver_mate > 0 else score.solver_mate
                    eval_cp = score.solver_eval - 1 if mate is not None and mate > 0 else score.solver_eval
                    candidate = replace(candidate, mover_eval=eval_cp, solver_eval=eval_cp,
                                        mover_mate=mate, solver_mate=mate,
                                        depth=score.depth, pv=(candidate.move,) + score.pv)
                verified.append(candidate)
                self._root_candidate = max(verified, key=lambda candidate: candidate.mover_eval)
            verified.sort(key=lambda candidate: candidate.mover_eval, reverse=True)
            selected = [candidate for candidate in verified if _competitive(verified[0], candidate, margin, mate_slack)]
            self._root_eval = selected[0].solver_eval
            self._set_eval(node, selected[0])

        if board.turn != self._side:
            # A forcing defense can demand a different answer despite a worse eval.
            available = analysis_moves if analysis_moves is not None else list(board.legal_moves)
            # Every move preventing an exact mate-in-one threat is a resource,
            # even when its evaluation is worse than the longest resistance.
            required = set(analysis_moves) if node.get("matingThreats") else {move for move in available if board.gives_check(move)}
            if board.move_stack:
                offered_square = board.peek().to_square
                for move in available:
                    captured_square = move.to_square
                    if board.is_en_passant(move):
                        captured_square += -8 if board.turn == chess.WHITE else 8
                    if board.is_capture(move) and captured_square == offered_square:
                        required.add(move)
            analyzed = {candidate.move for candidate in candidates}
            forcing = [move for move in available if move not in analyzed
                       and (board.is_capture(move) or board.gives_check(move) or move.promotion)]
            extras = self._candidates(board, multipv=settings.max_candidates, root_moves=forcing) if forcing else []
            forcing_limited = len(extras) == settings.max_candidates < len(forcing) and _competitive(candidates[0], extras[-1], settings.forcing_defense_margin_cp, settings.mate_distance_slack)
            analyzed.update(candidate.move for candidate in extras)
            missing_required = [move for move in available if move in required and move not in analyzed]
            if missing_required:
                extras += self._candidates(board, multipv=len(missing_required), root_moves=missing_required)
            if required - {candidate.move for candidate in candidates + extras}:
                self._review(node, "critical_defense_analysis_unavailable")
            selected += [candidate for candidate in candidates[len(selected):] + extras
                         if candidate.move in required or (
                             (board.is_capture(candidate.move) or candidate.move.promotion)
                             and _competitive(candidates[0], candidate, settings.forcing_defense_margin_cp, settings.mate_distance_slack))]
            if verified_defense is not None and verified_defense.move not in {candidate.move for candidate in selected}:
                selected.append(verified_defense)
            if forcing_limited:
                self._review(node, "forcing_candidate_limit")
        if depth == 0 and self._root_eval is not None and self._root_eval < -settings.best_move_margin_cp:
            self._review(node, "losing_root")

        for candidate in selected:
            child_board = board.copy(stack=True)
            child_board.push(candidate.move)
            if board.turn == self._side and self._root_eval is not None and self._root_eval >= settings.winning_eval_cp and child_board.is_repetition(2):
                continue
            edge: dict[str, Any] = {"uci": candidate.move.uci()}
            self._set_eval(edge, candidate)
            edge["children"] = [self._build_node(child_board, depth + 1)]
            node["moves"].append(edge)
        if not node["moves"]:
            node["terminal"] = "repetition_unresolved"
            self._review(node, "repetition_unresolved")
        return node

    def _candidates(self, board: chess.Board, **kwargs: Any) -> list[Candidate]:
        remaining = self._settings.solver.max_seconds - (time.monotonic() - self._started)
        if remaining <= 0:
            raise _DeadlineReached
        candidates = self._analyzer.candidates(board, self._side, time_limit=remaining, **kwargs)
        if not board.move_stack and candidates:
            self._root_candidate = candidates[0]
        if not candidates and time.monotonic() - self._started >= self._settings.solver.max_seconds:
            raise _DeadlineReached
        return candidates

    def _budget(self, depth: int) -> str | None:
        settings = self._settings.solver
        if time.monotonic() - self._started >= settings.max_seconds:
            return "max_seconds"
        if depth >= settings.max_depth:
            return "max_depth"
        if self._nodes > settings.max_nodes:
            return "max_nodes"
        return None

    def _review(self, node: dict[str, Any], reason: str) -> None:
        self._issues.add(reason)
        node.setdefault("reviewReasons", []).append(reason)

    def _set_eval(self, node: dict[str, Any], candidate: Candidate) -> None:
        if self._settings.solver.include_evals:
            node["eval"] = candidate.solver_eval
            if candidate.solver_mate is not None:
                node["mate"] = candidate.solver_mate
            else:
                node.pop("mate", None)
            node["analysisDepth"] = candidate.depth

    def _resolved(self, board: chess.Board, candidates: list[Candidate], depth: int) -> str | None:
        settings = self._settings.solver
        if depth < settings.min_solution_plies or board.is_check():
            return None
        sample = candidates[:settings.sound_continuations]
        if board.turn == self._side and self._root_eval is not None and self._root_eval >= settings.winning_eval_cp:
            sample = [candidate for candidate in candidates if not _repeats_in_pv(board, candidate, settings.stability_plies)][:settings.sound_continuations]
        if len(sample) < min(settings.sound_continuations, board.legal_moves.count()) or candidates[0].solver_mate == 1:
            return None
        close = all(_competitive(sample[0], candidate, settings.best_move_margin_cp, settings.mate_distance_slack) for candidate in sample)
        quiet = all(not (board.is_capture(candidate.move) or board.gives_check(candidate.move) or candidate.move.promotion) for candidate in sample)
        if board.turn == self._side and depth >= settings.min_solution_plies + 2 and close and quiet and self._root_eval is not None:
            floor = min(settings.winning_eval_cp, self._root_eval - settings.best_move_margin_cp)
            if all(candidate.solver_eval >= floor for candidate in sample):
                return "equality_resolved" if abs(self._root_eval) <= settings.best_move_margin_cp else "advantage_resolved"
        if any(candidate.solver_eval < settings.winning_eval_cp for candidate in sample):
            return None
        # Once several independently searched continuations win equally, there
        # is no remaining critical choice to test, even after a material sacrifice.
        # ponytail: this is an engine-verified tactical stopping heuristic, not a
        # game-theoretic proof; increase verification time for difficult attacks.
        if board.turn == self._side and depth >= settings.min_solution_plies + 2 and (close or all(candidate.solver_eval >= settings.decisive_eval_cp for candidate in sample)):
            return "advantage_resolved"
        # The engine's normalized centipawns are not material values; count pieces.
        def converted(position: chess.Board) -> bool:
            balance = _material(position, self._side)
            return balance >= settings.stable_material_cp or balance - self._initial_material >= settings.material_gain_cp
        if not converted(board):
            return None
        if board.turn != self._side:
            # A won piece ends the exercise only if every immediate reply keeps
            # it won and there is no check demanding a tactical answer.
            for move in list(board.legal_moves):
                if board.gives_check(move):
                    return None
                board.push(move)
                safe = converted(board)
                board.pop()
                if not safe:
                    return None
        for candidate in sample:
            line = board.copy(stack=True)
            for move in candidate.pv[:settings.stability_plies]:
                line.push(move)
                # Check after the opponent's replies, never a transient capture.
                if line.turn == self._side and not converted(line):
                    return None
            if len(candidate.pv) < settings.stability_plies and line.outcome(claim_draw=True) is None:
                return None
        return "material_resolved"


def _competitive(best: Candidate, candidate: Candidate, margin: int, mate_slack: int) -> bool:
    if best.mover_mate is not None or candidate.mover_mate is not None:
        if best.mover_mate is None or candidate.mover_mate is None:
            return False
        if best.mover_mate > 0 and candidate.mover_mate > 0:
            return candidate.mover_mate <= best.mover_mate + mate_slack
        if best.mover_mate < 0 and candidate.mover_mate < 0:
            return abs(candidate.mover_mate) >= abs(best.mover_mate) - mate_slack
        return best.move == candidate.move
    return best.mover_eval - candidate.mover_eval <= margin


def _material(board: chess.Board, side: chess.Color) -> int:
    return sum(value * (len(board.pieces(piece, side)) - len(board.pieces(piece, not side)))
               for piece, value in ((chess.PAWN, 100), (chess.KNIGHT, 320), (chess.BISHOP, 330), (chess.ROOK, 500), (chess.QUEEN, 900)))


def _mates_in_one(board: chess.Board) -> list[chess.Move]:
    mates = []
    for move in list(board.legal_moves):
        board.push(move)
        if board.is_checkmate():
            mates.append(move)
        board.pop()
    return mates


def _mate_in_one_responses(board: chess.Board) -> dict[chess.Move, list[chess.Move]]:
    responses = {}
    for move in list(board.legal_moves):
        board.push(move)
        replies = _mates_in_one(board) if board.outcome(claim_draw=True) is None else []
        board.pop()
        if replies:
            responses[move] = replies
    return responses


def _repeats_in_pv(board: chess.Board, candidate: Candidate, plies: int) -> bool:
    line = board.copy(stack=True)
    for move in candidate.pv[:plies]:
        line.push(move)
        if line.is_repetition(2):
            return True
    return False
