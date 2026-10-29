#!/usr/bin/env python3
from __future__ import annotations

import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path


MODULE_PATH = Path(__file__).with_name("check_implementation_integrity.py")
SPEC = importlib.util.spec_from_file_location(
    "check_implementation_integrity", MODULE_PATH
)
MODULE = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = MODULE
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class IntegrityEngineTests(unittest.TestCase):
    def make_root(self) -> tuple[tempfile.TemporaryDirectory[str], Path]:
        temp = tempfile.TemporaryDirectory()
        root = Path(temp.name)
        (root / ".github" / "workflows").mkdir(parents=True)
        return temp, root

    def test_missing_local_action_is_reported(self) -> None:
        temp, root = self.make_root()
        self.addCleanup(temp.cleanup)
        (root / ".github" / "workflows" / "ci.yml").write_text(
            "jobs:\n  check:\n    steps:\n      - uses: ./actions/missing\n",
            encoding="utf-8",
        )
        findings = MODULE.scan(root)
        self.assertEqual(1, len(findings))
        self.assertEqual("workflow-local-use", findings[0].detector)

    def test_existing_local_action_is_accepted(self) -> None:
        temp, root = self.make_root()
        self.addCleanup(temp.cleanup)
        action = root / "actions" / "check"
        action.mkdir(parents=True)
        (action / "action.yml").write_text(
            "name: check\nruns:\n  using: composite\n  steps: []\n",
            encoding="utf-8",
        )
        (root / ".github" / "workflows" / "ci.yml").write_text(
            "jobs:\n  check:\n    steps:\n      - uses: ./actions/check\n",
            encoding="utf-8",
        )
        self.assertEqual([], MODULE.scan(root))

    def test_missing_workflow_script_is_reported(self) -> None:
        temp, root = self.make_root()
        self.addCleanup(temp.cleanup)
        (root / ".github" / "workflows" / "ci.yml").write_text(
            "jobs:\n  check:\n    steps:\n      - run: python scripts/missing.py\n",
            encoding="utf-8",
        )
        findings = MODULE.scan(root)
        self.assertEqual(1, len(findings))
        self.assertEqual("workflow-run-path", findings[0].detector)

    def test_existing_workflow_script_is_accepted(self) -> None:
        temp, root = self.make_root()
        self.addCleanup(temp.cleanup)
        (root / "scripts").mkdir()
        (root / "scripts" / "present.py").write_text(
            "print('ok')\n", encoding="utf-8"
        )
        (root / ".github" / "workflows" / "ci.yml").write_text(
            "jobs:\n  check:\n    steps:\n      - run: python scripts/present.py\n",
            encoding="utf-8",
        )
        self.assertEqual([], MODULE.scan(root))

    def test_working_directory_skips_ambiguous_workflow_run_paths(self) -> None:
        temp, root = self.make_root()
        self.addCleanup(temp.cleanup)
        (root / ".github" / "workflows" / "ci.yml").write_text(
            "jobs:\n  check:\n    steps:\n      - working-directory: server\n"
            "        run: python scripts/local.py\n",
            encoding="utf-8",
        )
        self.assertEqual([], MODULE.scan(root))

    def test_missing_package_script_is_reported_relative_to_package(self) -> None:
        temp, root = self.make_root()
        self.addCleanup(temp.cleanup)
        package = root / "apps" / "console"
        package.mkdir(parents=True)
        (package / "package.json").write_text(
            json.dumps({"scripts": {"verify": "node scripts/missing.js"}}),
            encoding="utf-8",
        )
        findings = MODULE.scan(root)
        self.assertEqual(1, len(findings))
        self.assertEqual("package-script-path", findings[0].detector)

    def test_dynamic_command_path_is_not_guessed(self) -> None:
        temp, root = self.make_root()
        self.addCleanup(temp.cleanup)
        (root / ".github" / "workflows" / "ci.yml").write_text(
            "jobs:\n  check:\n    steps:\n      - run: python $SCRIPT_PATH\n",
            encoding="utf-8",
        )
        self.assertEqual([], MODULE.scan(root))

    def test_fingerprint_does_not_change_when_line_number_changes(self) -> None:
        first = MODULE.finding(
            detector="workflow-run-path",
            path=Path(".github/workflows/ci.yml"),
            line=3,
            target="scripts/missing.py",
            message="missing",
        )
        second = MODULE.finding(
            detector="workflow-run-path",
            path=Path(".github/workflows/ci.yml"),
            line=30,
            target="scripts/missing.py",
            message="missing",
        )
        self.assertEqual(first.fingerprint, second.fingerprint)

    def test_shadow_mode_reports_without_failing(self) -> None:
        temp, root = self.make_root()
        self.addCleanup(temp.cleanup)
        (root / ".github" / "workflows" / "ci.yml").write_text(
            "jobs:\n  check:\n    steps:\n      - run: python scripts/missing.py\n",
            encoding="utf-8",
        )
        self.assertEqual(0, MODULE.main([str(root), "--mode", "shadow"]))
        self.assertEqual(1, MODULE.main([str(root), "--mode", "enforce"]))


if __name__ == "__main__":
    unittest.main()
