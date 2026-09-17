"""Deterministic checks for the per-puzzle analysis deadline."""
from dataclasses import replace
import unittest
from unittest.mock import Mock, patch

import chess

from woodpecker_solver.config import AppSettings, EngineSettings, SolverSettings
from woodpecker_solver.engine import Candidate, StockfishAnalyzer
from woodpecker_solver.solver import FenSolver


class TimedAnalyzer:
    def __init__(self, duration, response=None):
        self.now = 0.0
        self.duration = duration
        self.response = response
        self.calls = []

    def candidates(self, board, side, multipv=4, **kwargs):
        self.calls.append((self.now, board.copy(stack=True), kwargs))
        self.now += min(self.duration, kwargs.get("time_limit", self.duration))
        if self.response is not None:
            return self.response(board, side, len(self.calls), kwargs)
        moves = kwargs.get("root_moves") or list(board.legal_moves)
        return [Candidate(move, 600 if board.turn == side else -600, 600, pv=(move,))
                for move in moves[:multipv]]


class DeadlineChecks(unittest.TestCase):
    def settings(self, **changes):
        return AppSettings(EngineSettings(), replace(SolverSettings(), max_seconds=1, **changes))

    def solve(self, analyzer, **changes):
        with patch("woodpecker_solver.solver.time.monotonic", side_effect=lambda: analyzer.now):
            return FenSolver(self.settings(**changes), analyzer).solve(chess.STARTING_FEN)

    def assert_deadline(self, analyzer, result):
        self.assertTrue(all(start < 1 for start, _, _ in analyzer.calls), analyzer.calls)
        self.assertLessEqual(analyzer.now, 1)
        for start, _, kwargs in analyzer.calls:
            self.assertGreater(kwargs["time_limit"], 0)
            self.assertLessEqual(kwargs["time_limit"], 1 - start)
        self.assertEqual(result.status, "needs_review")
        self.assertIn("max_seconds", result.document["quality"]["reviewReasons"])
        self.assertTrue(result.document["root"]["moves"])
        board = chess.Board(result.document["fen"])
        for edge in result.document["root"]["moves"]:
            self.assertIn(chess.Move.from_uci(edge["uci"]), board.legal_moves)

    def test_widening_stops_at_deadline_and_preserves_partial_root(self):
        analyzer = TimedAnalyzer(0.3)
        result = self.solve(analyzer, max_depth=1)
        self.assert_deadline(analyzer, result)
        self.assertEqual(len(analyzer.calls), 4)

    def test_expiry_before_any_analysis_does_not_produce_an_empty_tree(self):
        for clock in ((0, 1), (0, 0, 1)):
            with self.subTest(clock=clock):
                analyzer = TimedAnalyzer(1)
                with patch("woodpecker_solver.solver.time.monotonic", side_effect=clock):
                    result = FenSolver(self.settings(), analyzer).solve(chess.STARTING_FEN)
                self.assertEqual(analyzer.calls, [])
                self.assertIsNone(result.document)
                self.assertEqual((result.status, result.reason), ("needs_review", "max_seconds"))

    def test_expiry_without_engine_candidates_does_not_produce_an_empty_tree(self):
        analyzer = TimedAnalyzer(1, lambda *args: [])
        result = self.solve(analyzer)
        self.assertIsNone(result.document)
        self.assertEqual((result.status, result.reason), ("needs_review", "max_seconds"))

    def test_root_verification_stops_at_deadline(self):
        analyzer = TimedAnalyzer(0.6)
        result = self.solve(analyzer, max_candidates=2, max_depth=1)
        self.assert_deadline(analyzer, result)
        self.assertEqual(len(analyzer.calls), 2)

    def test_stronger_root_verification_does_not_start_after_deadline(self):
        def response(board, side, call, kwargs):
            move = next(iter(board.legal_moves))
            return [Candidate(move, 600 if call == 1 else 0, 600 if call == 1 else 0)]
        analyzer = TimedAnalyzer(0.5, response)
        result = self.solve(analyzer, max_depth=1)
        self.assert_deadline(analyzer, result)
        self.assertEqual(len(analyzer.calls), 2)

    def node(self, board, analyzer, depth=2, **changes):
        solver = FenSolver(self.settings(**changes), analyzer)
        solver._side, solver._initial_material, solver._root_eval = chess.WHITE, 0, 600
        solver._nodes, solver._issues, solver._verified_defenses = 0, set(), {}
        solver._started = 0
        with patch("woodpecker_solver.solver.time.monotonic", side_effect=lambda: analyzer.now):
            node = solver._build_node(board, depth)
        self.assertTrue(all(start < 1 for start, _, _ in analyzer.calls))
        self.assertLessEqual(analyzer.now, 1)
        self.assertEqual(node["terminal"], "max_seconds")
        self.assertIn("max_seconds", solver._issues)
        return node

    def test_resolution_confirmation_respects_deadline(self):
        analyzer = TimedAnalyzer(1)
        self.node(chess.Board(), analyzer, sound_continuations=1, min_solution_plies=0)
        self.assertEqual(len(analyzer.calls), 1)

    def test_repetition_retry_respects_deadline(self):
        board = chess.Board()
        board.push_uci("g1f3")
        board.push_uci("g8f6")
        def response(board, side, call, kwargs):
            pv = (chess.Move.from_uci("f3g1"), chess.Move.from_uci("f6g8"))
            return [Candidate(pv[0], 600, 600, pv=pv)]
        analyzer = TimedAnalyzer(1, response)
        self.node(board, analyzer)
        self.assertEqual(len(analyzer.calls), 1)

    def test_forcing_and_missing_required_probes_respect_deadline(self):
        board = chess.Board("7k/8/8/8/8/8/r7/1R4K1 b - - 0 1")
        def response(board, side, call, kwargs):
            return [] if kwargs.get("root_moves") else [Candidate(chess.Move.from_uci("h8g8"), -600, 600)]
        for duration, expected_calls in ((1, 1), (0.5, 2)):
            with self.subTest(duration=duration):
                analyzer = TimedAnalyzer(duration, response)
                self.node(board, analyzer, depth=1)
                self.assertEqual(len(analyzer.calls), expected_calls)

    def test_engine_limits_each_analysis_to_remaining_seconds(self):
        analyzer = StockfishAnalyzer.__new__(StockfishAnalyzer)
        analyzer._settings = self.settings()
        analyzer._engine = Mock()
        analyzer._engine.analyse.return_value = []
        for mode in ({}, {"root": True}, {"verify": True}):
            with self.subTest(mode=mode):
                analyzer.candidates(chess.Board(), chess.WHITE, time_limit=0.125, **mode)
                self.assertEqual(analyzer._engine.analyse.call_args.args[1].time, 0.125)
        analyzer._engine.analyse.reset_mock()
        self.assertEqual(analyzer.candidates(chess.Board(), chess.WHITE, time_limit=0), [])
        analyzer._engine.analyse.assert_not_called()
        analyzer.candidates(chess.Board(), chess.WHITE, time_limit=10)
        self.assertEqual(analyzer._engine.analyse.call_args.args[1].time, 0.5)


if __name__ == "__main__":
    unittest.main()
