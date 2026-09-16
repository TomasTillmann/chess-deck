"""Run with: PYTHONPATH=src uv run python -m unittest test_solver."""
from dataclasses import replace
import time
import unittest

import chess

from woodpecker_solver.config import AppSettings, EngineSettings, SolverSettings
from woodpecker_solver.engine import Candidate
from woodpecker_solver.solver import FenSolver, _competitive, _mates_in_one, _mate_in_one_responses, _repeats_in_pv


def candidate(board, move, side, score=500, mate=None, pv_length=6):
    move = chess.Move.from_uci(move) if isinstance(move, str) else move
    line = board.copy(stack=True)
    pv = [move]
    line.push(move)
    while len(pv) < pv_length and not line.is_game_over():
        reply = next(iter(line.legal_moves))
        pv.append(reply)
        line.push(reply)
    return Candidate(move, score if board.turn == side else -score, score,
                     mate if board.turn == side else -mate if mate else None,
                     mate, tuple(pv), 20)


class FakeAnalyzer:
    name = "deterministic test engine"

    def __init__(self, alternatives=False):
        self.alternatives = alternatives
        self.histories = []

    def candidates(self, board, side, multipv=4, **kwargs):
        self.histories.append(len(board.move_stack))
        if not board.move_stack:
            moves = [chess.Move.from_uci("e2e4"), chess.Move.from_uci("d2d4")]
            return [candidate(board, moves[0], side, 600), candidate(board, moves[1], side, 590 if self.alternatives else -500)]
        if self.alternatives and board.move_stack[0].uci() == "d2d4":
            return [candidate(board, next(iter(board.legal_moves)), side, 0)]
        moves = kwargs.get("root_moves") or list(board.legal_moves)
        return [candidate(board, move, side, 600 + index * (1000 if board.turn != side else -1000))
                for index, move in enumerate(moves[:multipv])]


class SolverChecks(unittest.TestCase):
    def settings(self, **changes):
        return AppSettings(EngineSettings(), replace(SolverSettings(), **changes))

    def test_fastest_mate_and_defensive_mate_distances_are_separate(self):
        a, b = chess.Move.from_uci("e2e4"), chess.Move.from_uci("d2d4")
        best = Candidate(a, 99999, 99999, 1, 1)
        slower = Candidate(b, 99998, 99998, 2, 2)
        self.assertFalse(_competitive(best, slower, 80, 0))
        defense = Candidate(a, -99997, 99997, -3, 3)
        shorter = Candidate(b, -99998, 99998, -2, 2)
        self.assertTrue(_competitive(defense, shorter, 180, 2))
        self.assertFalse(_competitive(best, Candidate(b, 9000, 9000), 100000, 2))

    def test_exact_mate_does_not_need_engine_or_continue_with_quiet_moves(self):
        class NoEngine:
            def candidates(self, *args, **kwargs):
                raise AssertionError("mate in one should be checked exactly")
        board = chess.Board("7k/8/5KQ1/8/8/8/8/8 w - - 0 1")
        result = FenSolver(self.settings(), NoEngine()).solve(board.fen())
        self.assertEqual(result.status, "solved")
        self.assertEqual({edge["uci"] for edge in result.document["root"]["moves"]},
                         {move.uci() for move in _mates_in_one(board)})
        self.assertTrue(all(edge["children"][0]["terminal"] == "checkmate"
                            for edge in result.document["root"]["moves"]))

    def test_budget_is_review_not_solved_and_history_is_preserved(self):
        analyzer = FakeAnalyzer()
        result = FenSolver(self.settings(max_depth=3), analyzer).solve(chess.STARTING_FEN)
        self.assertEqual(result.status, "needs_review")
        self.assertIn("max_depth", result.document["quality"]["reviewReasons"])
        root = result.document["root"]
        self.assertTrue(root["moves"])
        self.assertEqual(root["choice"], "any")
        self.assertEqual(root["moves"][0]["children"][0]["choice"], "all")
        self.assertGreaterEqual(max(analyzer.histories), 2)

    def test_mate_threat_is_common_to_every_legal_defense(self):
        board = chess.Board("4r1k1/p2r1p2/2p2Q2/1p6/3P4/3B1P2/PP3PKR/8 b - - 0 5")
        responses = _mate_in_one_responses(board)
        self.assertEqual(set(responses), set(board.legal_moves))
        self.assertTrue(all(chess.Move.from_uci("h2h8") in mates for mates in responses.values()))
        original = board.fen()
        for defense in list(board.legal_moves):
            board.push(defense)
            self.assertIn(chess.Move.from_uci("h2h8"), _mates_in_one(board))
            board.pop()
        self.assertEqual(board.fen(), original)

    def test_repeating_pv_is_not_a_second_sound_continuation(self):
        board = chess.Board()
        for uci in ("g1f3", "g8f6"):
            board.push_uci(uci)
        repeating = replace(candidate(board, "f3g1", board.turn),
                            pv=(chess.Move.from_uci("f3g1"), chess.Move.from_uci("f6g8")))
        self.assertFalse(_repeats_in_pv(board, repeating, 1))
        self.assertTrue(_repeats_in_pv(board, repeating, 6))

    def test_child_verification_rejects_a_false_root_alternative(self):
        result = FenSolver(self.settings(max_depth=1), FakeAnalyzer(alternatives=True)).solve(chess.STARTING_FEN)
        self.assertEqual([edge["uci"] for edge in result.document["root"]["moves"]], ["e2e4"])

    def test_clean_win_survives_a_repeating_mate_cluster(self):
        board = chess.Board()
        board.push_uci("g1f3")
        board.push_uci("g8f6")
        loop = replace(candidate(board, "f3g1", chess.WHITE, 99997, 3),
                       pv=(chess.Move.from_uci("f3g1"), chess.Move.from_uci("f6g8")))
        clean = candidate(board, "e2e4", chess.WHITE, 400)
        for include_clean in (True, False):
            with self.subTest(clean_returned_initially=include_clean):
                class LoopAnalyzer:
                    def candidates(self, position, side, **kwargs):
                        if kwargs.get("root_moves") is not None:
                            assert loop.move not in kwargs["root_moves"]
                            return [clean]
                        return [loop, clean] if include_clean else [loop]
                solver = FenSolver(self.settings(max_depth=3), LoopAnalyzer())
                solver._side, solver._initial_material, solver._root_eval = chess.WHITE, 0, 600
                solver._nodes, solver._issues, solver._verified_defenses = 0, set(), {}
                solver._started = time.monotonic()
                node = solver._build_node(board, 2)
                self.assertEqual([move["uci"] for move in node["moves"]], ["e2e4"])
                self.assertNotIn("repetition_unresolved", solver._issues)

    def test_checking_resources_survive_large_eval_differences(self):
        class CheckAnalyzer:
            def candidates(self, board, side, multipv=4, **kwargs):
                if not board.move_stack:
                    return [candidate(board, "b6b7", side, 1000)]
                moves = kwargs.get("root_moves") or list(board.legal_moves)
                scored = [candidate(board, move, side, 20000 if board.gives_check(move) else 1000 + index * 500)
                          for index, move in enumerate(moves)]
                return sorted(scored, key=lambda move: move.mover_eval, reverse=True)[:multipv]
        board = chess.Board("3r3k/P5p1/1P2Q3/2B1R1K1/2p3p1/3r4/8/7q w - - 0 1")
        result = FenSolver(self.settings(max_depth=2), CheckAnalyzer()).solve(board.fen())
        defense = result.document["root"]["moves"][0]["children"][0]
        board.push_uci("b6b7")
        expected = {move.uci() for move in board.legal_moves if board.gives_check(move)}
        actual = {move["uci"] for move in defense["moves"]}
        self.assertTrue({"h1h6", "h1c1"} <= expected <= actual)

    def test_short_pv_does_not_prove_material_stability(self):
        board = chess.Board("7k/8/8/8/8/8/8/KR6 w - - 0 1")
        solver = FenSolver(self.settings(), FakeAnalyzer())
        solver._side, solver._initial_material, solver._root_eval = chess.WHITE, 500, 500
        sample = [candidate(board, move, chess.WHITE, pv_length=2) for move in ("b1b2", "b1b3", "a1a2")]
        self.assertIsNone(solver._resolved(board, sample, 2))
        self.assertIsNone(solver._resolved(board, sample, 0))

    def test_all_moves_preventing_immediate_mate_are_required(self):
        class ThreatAnalyzer:
            def candidates(self, board, side, multipv=4, **kwargs):
                if not board.move_stack:
                    return [candidate(board, "c6f3", side, 2800)]
                moves = kwargs.get("root_moves") or list(board.legal_moves)
                scored = [candidate(board, move, side, 2800 if move.uci() == "c3e4" else 99990,
                                    None if move.uci() == "c3e4" else 10)
                          for move in moves]
                return sorted(scored, key=lambda move: move.mover_eval, reverse=True)[:multipv]
        board = chess.Board("2kr3r/pb1n1p2/2q1pP2/1pb5/2p2B2/2N2B2/PPQ2PPP/R4RK1 b - - 0 1")
        result = FenSolver(self.settings(max_depth=2), ThreatAnalyzer()).solve(board.fen())
        defense = result.document["root"]["moves"][0]["children"][0]
        actual = {move["uci"] for move in defense["moves"]}
        self.assertEqual(actual, {"c3d5", "c3e4", "c2g6", "c2e4", "g2f3"})
        self.assertEqual(len(defense["immediateMateReplies"]), 42)
        self.assertEqual(defense["matingThreats"], ["f3g2"])

    def test_sacrifice_acceptance_survives_mate_vs_centipawn_ordering(self):
        class SacrificeAnalyzer:
            def candidates(self, board, side, multipv=4, **kwargs):
                if not board.move_stack:
                    return [candidate(board, "c1f4", side, 700)]
                moves = kwargs.get("root_moves") or list(board.legal_moves)
                scored = [candidate(board, move, side, 700 if move.uci() == "d6e7" else 99995,
                                    None if move.uci() == "d6e7" else 5)
                          for move in moves]
                return sorted(scored, key=lambda move: move.mover_eval, reverse=True)[:multipv]
        board = chess.Board("4r1k1/p1qr1p2/2pb1Bp1/1p5p/3P1n1R/3B1P2/PP3PK1/2Q4R w - - 0 1")
        result = FenSolver(self.settings(max_depth=2), SacrificeAnalyzer()).solve(board.fen())
        defense = result.document["root"]["moves"][0]["children"][0]
        self.assertIn("d6f4", {move["uci"] for move in defense["moves"]})

    def test_en_passant_is_capture_of_the_last_moved_pawn(self):
        class PawnAnalyzer:
            def candidates(self, board, side, multipv=4, **kwargs):
                moves = kwargs.get("root_moves") or list(board.legal_moves)
                scored = [candidate(board, move, side, 500 if move.uci() == "h8g8" else 10000)
                          for move in moves]
                return sorted(scored, key=lambda move: move.mover_eval, reverse=True)[:multipv]
        board = chess.Board("7k/8/8/8/4p3/8/3P4/K7 w - - 0 1")
        board.push_uci("d2d4")
        solver = FenSolver(self.settings(max_depth=2), PawnAnalyzer())
        solver._side, solver._initial_material, solver._root_eval = chess.WHITE, 0, 500
        solver._nodes, solver._issues, solver._verified_defenses = 0, set(), {}
        solver._started = time.monotonic()
        node = solver._build_node(board, 1)
        self.assertIn("e4d3", {move["uci"] for move in node["moves"]})

    def test_incidental_mating_blunder_does_not_make_all_moves_required(self):
        class BlunderAnalyzer:
            def candidates(self, board, side, multipv=4, **kwargs):
                moves = kwargs.get("root_moves") or list(board.legal_moves)
                scored = [candidate(board, move, side, 500 if move.uci() == "g8f8" else 10000 + index * 200)
                          for index, move in enumerate(moves)]
                return sorted(scored, key=lambda move: move.mover_eval, reverse=True)[:multipv]
        board = chess.Board("1rr3k1/4ppb1/2q1bnpQ/1p2B3/6P1/2p2P2/P1P1B2R/2K4R b - - 1 1")
        solver = FenSolver(self.settings(max_depth=2), BlunderAnalyzer())
        solver._side, solver._initial_material, solver._root_eval = chess.WHITE, 0, 500
        solver._nodes, solver._issues, solver._verified_defenses = 0, set(), {}
        solver._started = time.monotonic()
        node = solver._build_node(board, 1)
        self.assertTrue(node["immediateMateReplies"])
        self.assertNotIn("matingThreats", node)
        self.assertLess(len(node["moves"]), board.legal_moves.count() - len(node["immediateMateReplies"]))

    def test_invalid_position_rejected(self):
        with self.assertRaisesRegex(ValueError, "Invalid chess position"):
            FenSolver(self.settings(), FakeAnalyzer()).solve("8/8/8/8/8/8/8/8 w - - 0 1")


if __name__ == "__main__":
    unittest.main()
