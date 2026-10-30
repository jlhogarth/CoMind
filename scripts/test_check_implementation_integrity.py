#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path

MODULE_PATH = Path(__file__).with_name("check_implementation_integrity.py")
SPEC = importlib.util.spec_from_file_location("check_implementation_integrity", MODULE_PATH)
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

    def workflow(self, root: Path, content: str) -> None:
        (root / ".github" / "workflows" / "ci.yml").write_text(content, encoding="utf-8")

    def test_missing_local_action_is_reported(self) -> None:
        temp, root = self.make_root(); self.addCleanup(temp.cleanup)
        self.workflow(root, "jobs:\n  check:\n    steps:\n      - uses: ./actions/missing\n")
        findings = [f for f in MODULE.scan(root) if f.control_id == "NDT-001"]
        self.assertEqual(1, len(findings)); self.assertEqual("workflow-local-use", findings[0].detector)
        self.assertEqual("verified-risk", findings[0].classification)

    def test_existing_local_action_is_accepted(self) -> None:
        temp, root = self.make_root(); self.addCleanup(temp.cleanup)
        action = root / "actions" / "check"; action.mkdir(parents=True)
        (action / "action.yml").write_text("name: check\nruns:\n  using: composite\n  steps: []\n", encoding="utf-8")
        self.workflow(root, "jobs:\n  check:\n    steps:\n      - uses: ./actions/check\n")
        self.assertEqual([], [f for f in MODULE.scan(root) if f.control_id == "NDT-001"])

    def test_missing_workflow_script_is_reported(self) -> None:
        temp, root = self.make_root(); self.addCleanup(temp.cleanup)
        self.workflow(root, "jobs:\n  check:\n    steps:\n      - run: python scripts/missing.py\n")
        findings = [f for f in MODULE.scan(root) if f.control_id == "NDT-001"]
        self.assertEqual(1, len(findings)); self.assertEqual("workflow-run-path", findings[0].detector)

    def test_existing_workflow_script_is_accepted(self) -> None:
        temp, root = self.make_root(); self.addCleanup(temp.cleanup)
        (root / "scripts").mkdir(); (root / "scripts" / "present.py").write_text("print('ok')\n", encoding="utf-8")
        self.workflow(root, "jobs:\n  check:\n    steps:\n      - run: python scripts/present.py\n")
        self.assertEqual([], [f for f in MODULE.scan(root) if f.control_id == "NDT-001"])

    def test_working_directory_skips_ambiguous_ndt_run_paths(self) -> None:
        temp, root = self.make_root(); self.addCleanup(temp.cleanup)
        self.workflow(root, "jobs:\n  check:\n    steps:\n      - working-directory: server\n        run: python scripts/local.py\n")
        self.assertEqual([], [f for f in MODULE.scan(root) if f.control_id == "NDT-001"])

    def test_missing_package_script_is_reported_relative_to_package(self) -> None:
        temp, root = self.make_root(); self.addCleanup(temp.cleanup)
        package = root / "apps" / "console"; package.mkdir(parents=True)
        (package / "package.json").write_text(json.dumps({"scripts": {"verify": "node scripts/missing.js"}}), encoding="utf-8")
        findings = [f for f in MODULE.scan(root) if f.control_id == "NDT-001"]
        self.assertEqual(1, len(findings)); self.assertEqual("package-script-path", findings[0].detector)

    def test_typescript_generated_package_target_is_accepted(self) -> None:
        temp, root = self.make_root(); self.addCleanup(temp.cleanup)
        package = root / "server"; source = package / "src" / "maintenance-control"; source.mkdir(parents=True)
        (source / "cli.ts").write_text("export {};\n", encoding="utf-8")
        (package / "tsconfig.json").write_text(json.dumps({"compilerOptions": {"outDir": "dist", "rootDir": "src"}}), encoding="utf-8")
        (package / "package.json").write_text(json.dumps({"scripts": {"audit": "node dist/maintenance-control/cli.js"}}), encoding="utf-8")
        self.assertEqual([], [f for f in MODULE.scan(root) if f.control_id == "NDT-001"])

    def test_generated_target_without_source_is_reported(self) -> None:
        temp, root = self.make_root(); self.addCleanup(temp.cleanup)
        package = root / "server"; package.mkdir(parents=True)
        (package / "tsconfig.json").write_text(json.dumps({"compilerOptions": {"outDir": "dist", "rootDir": "src"}}), encoding="utf-8")
        (package / "package.json").write_text(json.dumps({"scripts": {"start": "node dist/missing.js"}}), encoding="utf-8")
        findings = [f for f in MODULE.scan(root) if f.control_id == "NDT-001"]
        self.assertEqual(1, len(findings))

    def test_dynamic_command_path_is_not_guessed(self) -> None:
        temp, root = self.make_root(); self.addCleanup(temp.cleanup)
        self.workflow(root, "jobs:\n  check:\n    steps:\n      - run: python $SCRIPT_PATH\n")
        self.assertEqual([], [f for f in MODULE.scan(root) if f.control_id == "NDT-001"])

    def test_ndt_fingerprint_contract_is_unchanged(self) -> None:
        item = MODULE.ndt_finding(detector="workflow-run-path", path=Path(".github/workflows/ci.yml"), line=3, target="scripts/missing.py", message="missing")
        expected = hashlib.sha256(b"NDT-001|workflow-run-path|.github/workflows/ci.yml|scripts/missing.py").hexdigest()[:24]
        self.assertEqual(expected, item.fingerprint)
        moved = MODULE.ndt_finding(detector="workflow-run-path", path=Path(".github/workflows/ci.yml"), line=30, target="scripts/missing.py", message="missing")
        self.assertEqual(item.fingerprint, moved.fingerprint)

    def test_continue_on_error_true_is_nfs_candidate(self) -> None:
        temp, root = self.make_root(); self.addCleanup(temp.cleanup)
        self.workflow(root, "jobs:\n  check:\n    steps:\n      - name: Optional probe\n        continue-on-error: true\n        run: echo hi\n")
        findings = [f for f in MODULE.scan(root) if f.control_id == "NFS-001"]
        self.assertEqual(1, len(findings)); self.assertEqual("candidate", findings[0].classification)
        self.assertEqual("workflow-continue-on-error", findings[0].detector)

    def test_continue_on_error_false_is_not_nfs_candidate(self) -> None:
        temp, root = self.make_root(); self.addCleanup(temp.cleanup)
        self.workflow(root, "jobs:\n  check:\n    steps:\n      - continue-on-error: false\n        run: echo hi\n")
        self.assertEqual([], [f for f in MODULE.scan(root) if f.control_id == "NFS-001"])

    def test_shell_or_true_is_nfs_candidate(self) -> None:
        temp, root = self.make_root(); self.addCleanup(temp.cleanup)
        self.workflow(root, "jobs:\n  check:\n    steps:\n      - name: Build\n        run: npm run build || true\n")
        findings = [f for f in MODULE.scan(root) if f.control_id == "NFS-001"]
        self.assertEqual(1, len(findings)); self.assertIn("|| true", findings[0].target)

    def test_shell_or_colon_is_nfs_candidate(self) -> None:
        temp, root = self.make_root(); self.addCleanup(temp.cleanup)
        self.workflow(root, "jobs:\n  check:\n    steps:\n      - name: Probe\n        run: ./probe.sh || :\n")
        findings = [f for f in MODULE.scan(root) if f.control_id == "NFS-001"]
        self.assertEqual(1, len(findings)); self.assertIn("|| :", findings[0].target)

    def test_set_plus_e_is_nfs_candidate(self) -> None:
        temp, root = self.make_root(); self.addCleanup(temp.cleanup)
        self.workflow(root, "jobs:\n  check:\n    steps:\n      - name: Legacy check\n        run: |\n          set +e\n          ./probe.sh\n          echo done\n")
        findings = [f for f in MODULE.scan(root) if f.control_id == "NFS-001"]
        self.assertEqual(1, len(findings)); self.assertIn("set +e", findings[0].target)

    def test_intentional_cleanup_without_masking_is_not_flagged(self) -> None:
        temp, root = self.make_root(); self.addCleanup(temp.cleanup)
        self.workflow(root, "jobs:\n  check:\n    steps:\n      - name: Cleanup\n        if: always()\n        run: rm -f temp.txt\n")
        self.assertEqual([], [f for f in MODULE.scan(root) if f.control_id == "NFS-001"])

    def test_package_script_failure_mask_is_candidate(self) -> None:
        temp, root = self.make_root(); self.addCleanup(temp.cleanup)
        package = root / "apps" / "console"; package.mkdir(parents=True)
        (package / "package.json").write_text(json.dumps({"scripts": {"audit": "node audit.js || true"}}), encoding="utf-8")
        findings = [f for f in MODULE.scan(root) if f.control_id == "NFS-001"]
        self.assertEqual(1, len(findings)); self.assertEqual("package-shell-failure-mask", findings[0].detector)

    def test_nfs_candidate_does_not_block_enforce_mode(self) -> None:
        temp, root = self.make_root(); self.addCleanup(temp.cleanup)
        self.workflow(root, "jobs:\n  check:\n    steps:\n      - name: Probe\n        continue-on-error: true\n        run: echo hi\n")
        self.assertEqual(0, MODULE.main([str(root), "--mode", "enforce"]))

    def test_ndt_verified_risk_blocks_enforce_mode(self) -> None:
        temp, root = self.make_root(); self.addCleanup(temp.cleanup)
        self.workflow(root, "jobs:\n  check:\n    steps:\n      - run: python scripts/missing.py\n")
        self.assertEqual(0, MODULE.main([str(root), "--mode", "shadow"]))
        self.assertEqual(1, MODULE.main([str(root), "--mode", "enforce"]))

    def test_json_output_is_multi_control_schema_v2(self) -> None:
        temp, root = self.make_root(); self.addCleanup(temp.cleanup)
        self.workflow(root, "jobs:\n  check:\n    steps:\n      - name: Probe\n        continue-on-error: true\n        run: echo hi\n")
        output = root / "findings.json"
        self.assertEqual(0, MODULE.main([str(root), "--mode", "shadow", "--format", "json", "--output", str(output)]))
        payload = json.loads(output.read_text(encoding="utf-8"))
        self.assertEqual(2, payload["schema_version"])
        self.assertEqual("IIC", payload["lane"])
        self.assertEqual("implementation-integrity", payload["component"])
        self.assertEqual(["NDT-001", "NFS-001"], payload["controls"])
        self.assertEqual(1, payload["candidate_count"])
        self.assertEqual(0, payload["blocking_count"])


if __name__ == "__main__":
    unittest.main()
