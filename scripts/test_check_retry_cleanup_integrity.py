#!/usr/bin/env python3
"""IIC-006 isolated, deterministic positive/negative/adversarial tests."""
from __future__ import annotations
import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location("check_retry_cleanup_integrity",
    Path(__file__).with_name("check_retry_cleanup_integrity.py"))
module = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = module
spec.loader.exec_module(module)

class RetryCleanupTests(unittest.TestCase):
    def test_unbounded_rerun_is_candidate(self):
        x = module.scan_command("ci.yml", 4, "gh run rerun 123", "workflow")
        self.assertEqual(["NRC-001"], [f.control_id for f in x])
        self.assertEqual("candidate", x[0].classification)
    def test_unbounded_curl_retry_is_candidate(self):
        self.assertEqual(1, len(module.scan_command("ci.yml", 4, "curl --retry 999 https://github.com", "workflow")))
    def test_finite_curl_retry_not_flagged(self):
        self.assertEqual([], module.scan_command("ci.yml", 1, "curl --retry 3 https://github.com", "workflow"))
    def test_dynamic_retry_count_is_reviewed(self):
        self.assertEqual(1, len(module.scan_command("ci.yml", 1, "curl --retry $COUNT https://github.com", "workflow")))
    def test_temp_without_cleanup_is_candidate(self):
        x = module.scan_command("ci.yml", 2, "tmp=$(mktemp -d)", "workflow")
        self.assertEqual(["NCI-001"], [f.control_id for f in x])
    def test_explicit_trap_defers_cleanup_candidate(self):
        self.assertEqual([], module.scan_command("ci.yml", 2, "tmp=$(mktemp -d)\ntrap 'rm -rf \"$tmp\"' EXIT", "workflow"))
    def test_detached_container_without_cleanup_candidate(self):
        self.assertEqual("NCI-001", module.scan_command("ci.yml", 2, "docker run -d image", "workflow")[0].control_id)
    def test_cleanup_in_other_step_not_inferred(self):
        x=module.scan_command("ci.yml", 2, "tmp=$(mktemp -d)", "workflow")
        self.assertEqual(1, len(x))
        self.assertIn("Static local signal", x[0].limitation)
    def test_comment_not_flagged(self):
        self.assertEqual([], module.scan_command("ci.yml", 3, "# gh run rerun 123\n# mktemp -d", "workflow"))
    def test_stable_fingerprint_when_lines_shift(self):
        a=module.scan_command("ci.yml", 3, "gh run rerun 123", "workflow")[0]
        b=module.scan_command("ci.yml", 33, "gh run rerun 123", "workflow")[0]
        self.assertEqual(a.fingerprint,b.fingerprint)
    def test_workflow_and_package_scan(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d)
            (root/".github"/"workflows").mkdir(parents=True)
            (root/".github"/"workflows"/"ci.yml").write_text("jobs:\n  x:\n    steps:\n      - run: gh run rerun 42\n", encoding="utf-8")
            (root/"package.json").write_text(json.dumps({"scripts":{"test":"tmp=$(mktemp -d)"}}),encoding="utf-8")
            got=module.scan(root)
            self.assertEqual({"NCI-001","NRC-001"}, set(x.control_id for x in got))
            self.assertEqual(0, json.loads(module.report(got))["blocking_count"])
    def test_invalid_root_fails_closed(self):
        self.assertEqual(2,module.main(["/definitely/nonexistent/iic/repository"]))
if __name__ == "__main__":
    unittest.main()
