"""Run with: solver/.venv/bin/python -m unittest discover -s solver -p test_config.py"""

import json
import tempfile
import unittest
from dataclasses import asdict
from pathlib import Path

from woodpecker_solver.config import AppSettings, EngineSettings, SolverSettings, load_settings


class ConfigTests(unittest.TestCase):
    def load(self, data):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "settings.json"
            path.write_text(json.dumps(data), encoding="utf-8")
            return load_settings(path)

    def test_defaults_and_valid_settings_are_preserved(self):
        self.assertEqual(self.load({"engine": {}, "solver": {}}),
                         AppSettings(EngineSettings(), SolverSettings()))
        for name in ("appsettings.json", "appsettings.deep.json"):
            path = Path(__file__).with_name(name)
            self.assertEqual(asdict(load_settings(path)), json.loads(path.read_text()))
        settings = self.load({"engine": {"depth": None, "limit_strength": True},
                              "solver": {"max_seconds": 0.5, "include_evals": False}})
        self.assertEqual(settings.solver.max_seconds, 0.5)
        self.assertIs(settings.solver.include_evals, False)
        self.assertIs(settings.engine.limit_strength, True)

    def test_invalid_field_types_fail_at_load_with_field_name(self):
        for section, defaults in (("engine", EngineSettings()), ("solver", SolverSettings())):
            for key, default in asdict(defaults).items():
                invalid = (None, [], {})
                if type(default) is bool:
                    invalid += ("false", 0, 1)
                elif key == "max_seconds":
                    invalid += ("90", True, float("nan"), float("inf"), -float("inf"))
                elif key == "path":
                    invalid += (False, 123)
                else:
                    invalid += (2.5, True, "2")
                if key == "depth":
                    invalid = tuple(value for value in invalid if value is not None)
                for value in invalid:
                    with self.subTest(field=f"{section}.{key}", value=value):
                        data = {"engine": {}, "solver": {}}
                        data[section][key] = value
                        with self.assertRaisesRegex(ValueError, rf"{section}\.{key}"):
                            self.load(data)

    def test_invalid_shape_and_unknown_fields_fail_clearly(self):
        for data, message in (
            ([], "object"), (None, "object"), (True, "object"), ("config", "object"),
            ({"engine": [], "solver": {}}, "engine"),
            ({"engine": {}, "solver": {}, "surprise": 1}, "surprise"),
            ({"engine": {"surprise": 1}, "solver": {}}, r"engine\.surprise"),
            ({"engine": {}, "solver": {"surprise": 1}}, r"solver\.surprise"),
        ):
            with self.subTest(data=data):
                with self.assertRaisesRegex(ValueError, message):
                    self.load(data)

    def test_range_and_cross_field_checks_are_preserved(self):
        for section, key, value in (
            ("engine", "threads", 0), ("engine", "depth", 0),
            ("solver", "max_seconds", 0), ("solver", "best_move_margin_cp", -1),
            ("solver", "max_candidates", 3), ("solver", "sound_continuations", 5),
        ):
            with self.subTest(field=f"{section}.{key}", value=value):
                data = {"engine": {}, "solver": {}}
                data[section][key] = value
                with self.assertRaisesRegex(ValueError, rf"{section}\.{key}"):
                    self.load(data)


if __name__ == "__main__":
    unittest.main()
