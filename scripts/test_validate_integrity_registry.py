#!/usr/bin/env python3
from __future__ import annotations

import copy
import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path

MODULE_PATH = Path(__file__).with_name("validate_integrity_registry.py")
SPEC = importlib.util.spec_from_file_location("validate_integrity_registry", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = MODULE
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)

SOURCE_ROOT = Path(__file__).resolve().parents[1]


class RegistryTests(unittest.TestCase):
    def make_root(self) -> tuple[tempfile.TemporaryDirectory[str], Path, dict]:
        temp = tempfile.TemporaryDirectory()
        root = Path(temp.name)
        registry = json.loads((SOURCE_ROOT / MODULE.REGISTRY_PATH).read_text(encoding="utf-8"))
        destination = root / MODULE.REGISTRY_PATH
        destination.parent.mkdir(parents=True)
        destination.write_text(json.dumps(registry, indent=2) + "\n", encoding="utf-8")
        for control in registry["implemented_controls"]:
            for repo_path in control["detector"]["paths"]:
                target = root / repo_path
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_text("# fixture\n", encoding="utf-8")
        return temp, root, registry

    def write_registry(self, root: Path, registry: dict) -> None:
        (root / MODULE.REGISTRY_PATH).write_text(json.dumps(registry, indent=2) + "\n", encoding="utf-8")

    def test_canonical_registry_is_valid(self) -> None:
        self.assertEqual([], MODULE.validate(SOURCE_ROOT))

    def test_duplicate_control_id_fails(self) -> None:
        temp, root, registry = self.make_root(); self.addCleanup(temp.cleanup)
        registry["defined_controls"].append(copy.deepcopy(registry["implemented_controls"][0]))
        self.write_registry(root, registry)
        self.assertTrue(any("duplicate control_id" in item for item in MODULE.validate(root)))

    def test_defined_control_cannot_claim_detector(self) -> None:
        temp, root, registry = self.make_root(); self.addCleanup(temp.cleanup)
        item = next(c for c in registry["defined_controls"] if c["control_id"] == "NHC-001")
        item["detector"] = {"kind": "iic-engine", "paths": ["scripts/check_implementation_integrity.py"]}
        self.write_registry(root, registry)
        self.assertTrue(any("DEFINED-only control" in item for item in MODULE.validate(root)))

    def test_enforced_control_must_be_blocking(self) -> None:
        temp, root, registry = self.make_root(); self.addCleanup(temp.cleanup)
        item = next(c for c in registry["implemented_controls"] if c["control_id"] == "NDT-001")
        item["enforcement"]["blocking"] = False
        self.write_registry(root, registry)
        self.assertTrue(any("ENFORCED control must be blocking" in item for item in MODULE.validate(root)))

    def test_promotion_history_cannot_move_backward(self) -> None:
        temp, root, registry = self.make_root(); self.addCleanup(temp.cleanup)
        item = next(c for c in registry["implemented_controls"] if c["control_id"] == "NFS-001")
        item["promotion_history"].append({"state": "SHADOW", "evidence": "regression"})
        item["maturity_state"] = "SHADOW"
        self.write_registry(root, registry)
        self.assertTrue(any("cannot move backward" in item for item in MODULE.validate(root)))

    def test_accepted_pattern_requires_reconsideration_trigger(self) -> None:
        temp, root, registry = self.make_root(); self.addCleanup(temp.cleanup)
        registry["reviewed_findings"][0]["reconsideration_trigger"] = ""
        self.write_registry(root, registry)
        self.assertTrue(any("reconsideration_trigger" in item for item in MODULE.validate(root)))

    def test_reviewed_finding_requires_known_control(self) -> None:
        temp, root, registry = self.make_root(); self.addCleanup(temp.cleanup)
        registry["reviewed_findings"][0]["control_id"] = "BAD-999"
        self.write_registry(root, registry)
        self.assertTrue(any("unknown control_id" in item for item in MODULE.validate(root)))

    def test_missing_detector_path_fails(self) -> None:
        temp, root, registry = self.make_root(); self.addCleanup(temp.cleanup)
        (root / "scripts/check_integrity_enforcement_contract.py").unlink()
        self.assertTrue(any("detector path does not exist" in item for item in MODULE.validate(root)))

    def test_current_foundation_states_cannot_be_downgraded_silently(self) -> None:
        temp, root, registry = self.make_root(); self.addCleanup(temp.cleanup)
        ndt = next(c for c in registry["implemented_controls"] if c["control_id"] == "NDT-001")
        ndt["maturity_state"] = "PROVEN"
        ndt["promotion_history"] = ndt["promotion_history"][:-1]
        ndt["enforcement"]["blocking"] = False
        self.write_registry(root, registry)
        self.assertTrue(any("registry must reflect current state ENFORCED" in item for item in MODULE.validate(root)))

    def test_registry_requires_complete_catalog(self) -> None:
        temp, root, registry = self.make_root(); self.addCleanup(temp.cleanup)
        registry["defined_controls"].pop()
        self.write_registry(root, registry)
        self.assertTrue(any("24 unique cataloged controls" in item for item in MODULE.validate(root)))


if __name__ == "__main__":
    unittest.main()
