"""Run with: solver/.venv/bin/python -m unittest discover -s solver -p test_engine_cleanup.py"""

import unittest
from unittest.mock import Mock, patch

from woodpecker_solver.config import AppSettings, EngineSettings, SolverSettings
from woodpecker_solver.engine import StockfishAnalyzer


class EngineCleanupTests(unittest.TestCase):
    def test_configuration_failure_closes_engine_and_preserves_error(self):
        for cleanup_error in (None, RuntimeError("close failed")):
            with self.subTest(cleanup_error=cleanup_error):
                original = ValueError("unsupported option")
                engine = Mock(id={})
                engine.configure.side_effect = original
                engine.close.side_effect = cleanup_error
                with patch("woodpecker_solver.engine.chess.engine.SimpleEngine.popen_uci", return_value=engine):
                    with self.assertRaises(ValueError) as raised:
                        StockfishAnalyzer(AppSettings(EngineSettings(), SolverSettings()))
                self.assertIs(raised.exception, original)
                engine.close.assert_called_once_with()

    def test_close_forces_cleanup_after_quit_failure_and_is_idempotent(self):
        for cleanup_error in (None, RuntimeError("close failed")):
            with self.subTest(cleanup_error=cleanup_error):
                original = TimeoutError("quit timed out")
                engine = Mock(id={})
                engine.quit.side_effect = original
                engine.close.side_effect = cleanup_error
                with patch("woodpecker_solver.engine.chess.engine.SimpleEngine.popen_uci", return_value=engine):
                    analyzer = StockfishAnalyzer(AppSettings(EngineSettings(), SolverSettings()))
                with self.assertRaises(TimeoutError) as raised:
                    analyzer.close()
                self.assertIs(raised.exception, original)
                engine.close.assert_called_once_with()
                analyzer.close()
                engine.quit.assert_called_once_with()
                engine.close.assert_called_once_with()

    def test_context_manager_cleans_up_and_preserves_body_error(self):
        for body_error in (None, ValueError("solve failed")):
            for quit_error in (None, TimeoutError("quit timed out")):
                with self.subTest(body_error=body_error, quit_error=quit_error):
                    engine = Mock(id={"name": "test engine"})
                    engine.quit.side_effect = quit_error
                    caught = None
                    with patch("woodpecker_solver.engine.chess.engine.SimpleEngine.popen_uci", return_value=engine):
                        try:
                            with StockfishAnalyzer(AppSettings(EngineSettings(), SolverSettings())) as analyzer:
                                self.assertEqual(analyzer.name, "test engine")
                                if body_error is not None:
                                    raise body_error
                        except Exception as error:
                            caught = error
                    self.assertIs(caught, body_error or quit_error)
                    engine.close.assert_called_once_with()
                    analyzer.close()
                    engine.quit.assert_called_once_with()
                    engine.close.assert_called_once_with()


if __name__ == "__main__":
    unittest.main()
