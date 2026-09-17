"""Run with: uv run python -m unittest test_cli.py"""

import json
import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from pathlib import Path
from unittest.mock import patch

import typer
from typer.testing import CliRunner

from woodpecker_solver import cli


@dataclass
class Settings:
    test: bool = True


class Server:
    def __init__(self, existing=(), fail=(), concurrent=()):
        self.existing = set(existing)
        self.fail = set(fail)
        self.concurrent = set(concurrent)
        self.stored = []

    def check_health(self):
        pass

    def existing_fens(self, collection, fens):
        return self.existing.intersection(fens)

    def store(self, collection, solutions, overwrite=True):
        assert len(solutions) == 1, "Persist each completed result immediately"
        solution = solutions[0]
        if solution["fen"] in self.fail:
            raise RuntimeError("storage unavailable")
        if solution["fen"] in self.concurrent and not overwrite:
            return 0
        self.stored.append((solution, overwrite))
        self.existing.add(solution["fen"])
        return 1


class CliTests(unittest.TestCase):
    def test_worker_closes_engine_on_success_and_failure(self):
        item = cli.WorkItem(1, "7k/8/5KQ1/8/8/8/8/8 w - - 0 1")
        with (patch.object(cli, "_worker_settings", Settings()),
              patch.object(cli, "StockfishAnalyzer") as analyzer,
              patch.object(cli, "FenSolver") as solver):
            solver.return_value.solve.return_value = cli.WorkResult(item, "solved", {"status": "solved"})
            self.assertEqual(cli._solve_work_item(item).status, "solved")
            analyzer.return_value.__exit__.assert_called_once_with(None, None, None)
            analyzer.return_value.__exit__.reset_mock()
            solver.return_value.solve.side_effect = RuntimeError("engine failed")
            self.assertEqual(cli._solve_work_item(item).status, "error")
            self.assertIs(analyzer.return_value.__exit__.call_args.args[0], RuntimeError)

    def test_deck_resolution_and_selection(self):
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory)
            folder = base / "deck"
            folder.mkdir()
            fen = folder / "deck.fen"
            fen.write_text("first\n\nsecond\nthird\n", encoding="utf-8")
            for args in ((fen, None, None), (folder, None, None), (None, base, "deck")):
                self.assertEqual(cli._resolve_deck(*args), (fen, "deck"))
            self.assertEqual(cli._resolve_deck(fen, None, "custom"), (fen, "custom"))
            for name in ("9deck", "Uppercase", "with spaces", "../deck", "a" * 65, ""):
                with self.assertRaises(typer.BadParameter):
                    cli._resolve_deck(fen, None, name)
            numeric = base / "123 puzzles.fen"
            numeric.touch()
            self.assertEqual(cli._resolve_deck(numeric, None, None), (numeric, "deck-123-puzzles"))
            self.assertEqual(cli._select_fens(cli._read_fens(fen), "3,1,3", 1), [(1, "first")])
            for selection in ("0", "4", "", "1,", "abc"):
                with self.assertRaises(typer.BadParameter):
                    cli._select_fens(cli._read_fens(fen), selection, None)
            with self.assertRaises(typer.BadParameter):
                cli._resolve_deck(fen, base, "deck")
            fen.rename(folder / "first.fen")
            (folder / "second.fen").touch()
            with self.assertRaises(typer.BadParameter):
                cli._resolve_deck(folder, None, None)

    def test_resume_dedup_statuses_storage_failures_and_overwrite(self):
        with tempfile.TemporaryDirectory() as directory:
            deck = Path(directory) / "deck.fen"
            deck.write_text("first\nreview\nfirst\nfail\nracing\ncrash\nempty\n", encoding="utf-8")
            config = Path(directory) / "config.json"
            config.write_text("{}", encoding="utf-8")
            report = Path(directory) / "report.jsonl"
            server = Server(existing=["first"], fail=["fail"], concurrent=["racing"])
            generated = []

            def solve(item):
                generated.append(item.fen)
                if item.fen == "crash":
                    raise RuntimeError("worker crashed")
                if item.fen == "empty":
                    return cli.WorkResult(item, "needs_review", reason="analysis_unavailable")
                status = "needs_review" if item.fen == "review" else "solved"
                return cli.WorkResult(item, status, {"fen": item.fen, "status": status, "root": {"moves": []}})

            def executor(**kwargs):
                return ThreadPoolExecutor(max_workers=1)

            args = ["--deck", str(deck), "--config", str(config), "--report", str(report)]
            with (patch.object(cli, "load_settings", return_value=Settings()),
                  patch.object(cli, "SolutionServerClient", return_value=server),
                  patch.object(cli, "_ensure_server", return_value=None),
                  patch.object(cli, "ProcessPoolExecutor", side_effect=executor),
                  patch.object(cli, "_solve_work_item", side_effect=solve)):
                result = CliRunner().invoke(cli.app, args)
                self.assertEqual(result.exit_code, 1, result.output)
                self.assertIn("unique=6 solved=0 needs_review=2 existing=2 duplicates=1 errors=2", result.output)
                self.assertEqual([value[0]["fen"] for value in server.stored], ["review"])
                self.assertFalse(server.stored[0][1])
                self.assertNotIn("first", generated)
                events = [json.loads(line) for line in report.read_text().splitlines()]
                self.assertTrue(any(event.get("event") == "generated" and event.get("fen") == "fail" for event in events))
                self.assertTrue(any(event.get("stage") == "storage" and event.get("fen") == "fail" for event in events))
                self.assertTrue(any(event.get("event") == "error" and event.get("fen") == "crash" for event in events))
                self.assertEqual([(event["event"], event.get("reason")) for event in events if event.get("fen") == "empty"],
                                 [("needs_review", "analysis_unavailable")])

                generated.clear()
                resumed = CliRunner().invoke(cli.app, args + ["--positions", "1,2,3"])
                self.assertEqual(resumed.exit_code, 0, resumed.output)
                self.assertEqual(generated, [])
                overwritten = CliRunner().invoke(cli.app, args + ["--positions", "1,2,3", "--overwrite"])
                self.assertEqual(overwritten.exit_code, 0, overwritten.output)
                self.assertEqual(generated, ["first", "review"])
                self.assertIn("solved=1 needs_review=1", overwritten.output)
                self.assertTrue(all(overwrite for _, overwrite in server.stored[-2:]))


if __name__ == "__main__":
    unittest.main()
