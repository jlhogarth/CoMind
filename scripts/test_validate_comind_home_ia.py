#!/usr/bin/env python3
"""Regression tests for the CoMind Home IA contract validator."""

from __future__ import annotations

import importlib.util
import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MANIFEST_PATH = ROOT / "config" / "comind-home-information-architecture.v1.json"
VALIDATOR_PATH = ROOT / "scripts" / "validate_comind_home_ia.py"

spec = importlib.util.spec_from_file_location("validate_comind_home_ia", VALIDATOR_PATH)
assert spec and spec.loader
validator = importlib.util.module_from_spec(spec)
spec.loader.exec_module(validator)


def load_manifest():
    return json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))


def domain(contract, domain_id):
    return next(item for item in contract["domains"] if item["id"] == domain_id)


class HomeInformationArchitectureContractTests(unittest.TestCase):
    def test_canonical_manifest_passes(self):
        validator.validate_contract(load_manifest())

    def test_missing_domain_fails(self):
        contract = load_manifest()
        contract["domains"] = [item for item in contract["domains"] if item["id"] != "reflection"]
        with self.assertRaises(validator.ContractError):
            validator.validate_contract(contract)

    def test_home_owned_store_fails(self):
        contract = load_manifest()
        domain(contract, "now")["creates_store"] = True
        with self.assertRaises(validator.ContractError):
            validator.validate_contract(contract)

    def test_watchtower_canonical_store_fails(self):
        contract = load_manifest()
        watchtower = domain(contract, "watchtower")
        watchtower["authoritative_sources"].append(
            {"ref": "comind.cm_watchtower_state", "authority_role": "invented_truth"}
        )
        with self.assertRaises(validator.ContractError):
            validator.validate_contract(contract)

    def test_project_identity_inversion_fails(self):
        contract = load_manifest()
        projects = domain(contract, "projects")
        projects["authoritative_sources"] = [
            {"ref": "comind_pm.pm_projects", "authority_role": "canonical_identity", "join": "canonical_project_id"}
        ]
        with self.assertRaises(validator.ContractError):
            validator.validate_contract(contract)

    def test_decisions_cannot_use_authorization_as_decision_truth(self):
        contract = load_manifest()
        decisions = domain(contract, "decisions")
        decisions["authoritative_sources"].append(
            {"ref": "comind.cm_foundry_authorization_request", "authority_role": "decision_truth"}
        )
        with self.assertRaises(validator.ContractError):
            validator.validate_contract(contract)

    def test_approvals_require_authorization_request_and_decision(self):
        contract = load_manifest()
        approvals = domain(contract, "approvals")
        approvals["authoritative_sources"] = [
            source for source in approvals["authoritative_sources"]
            if source["ref"] != "comind.cm_foundry_authorization_decision"
        ]
        with self.assertRaises(validator.ContractError):
            validator.validate_contract(contract)

    def test_reflection_without_journal_fails(self):
        contract = load_manifest()
        reflection = domain(contract, "reflection")
        reflection["authoritative_sources"] = [
            {"ref": "comind.v_ce_current_continuity_capsule", "authority_role": "context_link_only"}
        ]
        with self.assertRaises(validator.ContractError):
            validator.validate_contract(contract)

    def test_integrity_without_registry_fails(self):
        contract = load_manifest()
        integrity = domain(contract, "implementation_integrity")
        integrity["authoritative_sources"] = [
            {"ref": "GitHub Actions exact-head checks", "authority_role": "current_execution_evidence"}
        ]
        with self.assertRaises(validator.ContractError):
            validator.validate_contract(contract)

    def test_learning_cannot_detach_from_research(self):
        contract = load_manifest()
        learning = domain(contract, "learning")
        learning["authoritative_sources"] = [
            source for source in learning["authoritative_sources"]
            if source["ref"] != "comind.cm_research_refs"
        ]
        with self.assertRaises(validator.ContractError):
            validator.validate_contract(contract)

    def test_incomplete_marker_fails(self):
        contract = load_manifest()
        contract["purpose"] = "future " + "T" + "BD"
        with self.assertRaises(validator.ContractError):
            validator.validate_contract(contract)

    def test_navigation_duplicate_fails(self):
        contract = load_manifest()
        contract["navigation"][0]["domains"].append("projects")
        with self.assertRaises(validator.ContractError):
            validator.validate_contract(contract)


if __name__ == "__main__":
    unittest.main()
