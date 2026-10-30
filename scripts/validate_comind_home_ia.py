#!/usr/bin/env python3
"""Validate the canonical CoMind Home information architecture contract."""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

DEFAULT_MANIFEST = Path("config/comind-home-information-architecture.v1.json")
REQUIRED_DOMAINS = {
    "now",
    "projects",
    "virtual_employees",
    "decisions",
    "approvals",
    "evidence",
    "runbook",
    "research",
    "learning",
    "watchtower",
    "reflection",
    "implementation_integrity",
}
REQUIRED_DOMAIN_FIELDS = {
    "id",
    "label",
    "source_mode",
    "creates_store",
    "projection_status",
    "authoritative_sources",
    "projection_policy",
    "freshness",
    "coverage_limit",
    "unavailable_semantics",
    "write_authority",
}
PROHIBITED_MARKERS = ("T" + "BD", "TO" + "DO", "PLACE" + "HOLDER")


class ContractError(ValueError):
    """Raised when the Home IA contract violates a governing invariant."""


def _fail(message: str) -> None:
    raise ContractError(message)


def _walk_strings(value: Any):
    if isinstance(value, str):
        yield value
    elif isinstance(value, dict):
        for key, item in value.items():
            yield str(key)
            yield from _walk_strings(item)
    elif isinstance(value, list):
        for item in value:
            yield from _walk_strings(item)


def _source_refs(domain: dict[str, Any]) -> set[str]:
    return {
        source.get("ref", "")
        for source in domain.get("authoritative_sources", [])
        if isinstance(source, dict)
    }


def validate_contract(contract: dict[str, Any]) -> None:
    if contract.get("schema_version") != 1:
        _fail("schema_version must be 1")
    if contract.get("contract_id") != "COMIND-HOME-IA-V1":
        _fail("unexpected contract_id")

    global_rules = contract.get("global_rules")
    if not isinstance(global_rules, dict):
        _fail("global_rules must be an object")
    if global_rules.get("home_persistent_store_allowed") is not False:
        _fail("Home must not own a persistent source-of-truth store")
    if global_rules.get("browser_privileged_credentials") is not False:
        _fail("Home must not expose privileged browser credentials")
    if global_rules.get("write_policy") != "route_to_owner_system":
        _fail("Home writes must route to the authoritative owner system")
    if global_rules.get("requested_authorized_executed_verified_distinct") is not True:
        _fail("requested, authorized, executed, and verified states must remain distinct")

    domains = contract.get("domains")
    if not isinstance(domains, list) or not domains:
        _fail("domains must be a non-empty array")

    domain_by_id: dict[str, dict[str, Any]] = {}
    for domain in domains:
        if not isinstance(domain, dict):
            _fail("every domain must be an object")
        missing = REQUIRED_DOMAIN_FIELDS - set(domain)
        if missing:
            _fail(f"domain {domain.get('id', '<unknown>')} missing fields: {sorted(missing)}")
        domain_id = domain["id"]
        if not isinstance(domain_id, str) or not domain_id:
            _fail("domain id must be non-empty text")
        if domain_id in domain_by_id:
            _fail(f"duplicate domain id: {domain_id}")
        domain_by_id[domain_id] = domain
        if domain["creates_store"] is not False:
            _fail(f"domain {domain_id} attempts to create a Home-owned store")
        if not isinstance(domain["authoritative_sources"], list) or not domain["authoritative_sources"]:
            _fail(f"domain {domain_id} requires authoritative_sources")
        for source in domain["authoritative_sources"]:
            if not isinstance(source, dict) or not source.get("ref") or not source.get("authority_role"):
                _fail(f"domain {domain_id} has an incomplete authoritative source")
        for field in ("projection_policy", "freshness", "coverage_limit", "unavailable_semantics", "write_authority"):
            if not isinstance(domain[field], str) or not domain[field].strip():
                _fail(f"domain {domain_id} has an empty {field}")

    actual_domains = set(domain_by_id)
    if actual_domains != REQUIRED_DOMAINS:
        missing = sorted(REQUIRED_DOMAINS - actual_domains)
        extra = sorted(actual_domains - REQUIRED_DOMAINS)
        _fail(f"domain inventory mismatch; missing={missing}, extra={extra}")

    navigation = contract.get("navigation")
    if not isinstance(navigation, list) or not navigation:
        _fail("navigation must be a non-empty array")
    nav_domains: list[str] = []
    group_ids: set[str] = set()
    for group in navigation:
        if not isinstance(group, dict) or not group.get("group_id") or not group.get("label"):
            _fail("navigation group is incomplete")
        if group["group_id"] in group_ids:
            _fail(f"duplicate navigation group: {group['group_id']}")
        group_ids.add(group["group_id"])
        group_domains = group.get("domains")
        if not isinstance(group_domains, list) or not group_domains:
            _fail(f"navigation group {group['group_id']} has no domains")
        nav_domains.extend(group_domains)
    if set(nav_domains) != REQUIRED_DOMAINS or len(nav_domains) != len(REQUIRED_DOMAINS):
        _fail("navigation must contain every Home domain exactly once")

    now = domain_by_id["now"]
    if now["source_mode"] != "composed":
        _fail("Now must be a composed attention projection")
    if "comind_pm.v_operator_console_activity" not in _source_refs(now):
        _fail("Now must reuse the accepted operational Activity projection")

    projects = domain_by_id["projects"]
    if "comind.cm_project" not in _source_refs(projects):
        _fail("Projects must use comind.cm_project as canonical identity")
    pm_project_sources = [
        source for source in projects["authoritative_sources"]
        if source.get("ref") == "comind_pm.pm_projects"
    ]
    if len(pm_project_sources) != 1 or pm_project_sources[0].get("join") != "canonical_project_id":
        _fail("Projects must treat pm_projects as an operational projection linked by canonical_project_id")

    decision_refs = _source_refs(domain_by_id["decisions"])
    approval_refs = _source_refs(domain_by_id["approvals"])
    authorization_refs = {
        "comind.cm_foundry_authorization_request",
        "comind.cm_foundry_authorization_decision",
    }
    if "comind_pm.pm_decision_records" not in decision_refs:
        _fail("Decisions must preserve the canonical operational decision record substrate")
    if decision_refs & authorization_refs:
        _fail("Decisions must not use Foundry authorization records as decision truth")
    if not authorization_refs.issubset(approval_refs):
        _fail("Approvals must include Foundry authorization request and decision truth")

    if "comind.cm_evidence" not in _source_refs(domain_by_id["evidence"]):
        _fail("Evidence must preserve comind.cm_evidence as canonical evidence identity")

    if "comind_pm.v_runbook_lane_state" not in _source_refs(domain_by_id["runbook"]):
        _fail("RunBook must reuse the canonical lane-state projection")

    if "comind.cm_research_refs" not in _source_refs(domain_by_id["research"]):
        _fail("Research must reuse the governed Research Library")
    learning_refs = _source_refs(domain_by_id["learning"])
    if not {"comind.cm_learning_path", "comind.cm_learning_path_item", "comind.cm_research_refs"}.issubset(learning_refs):
        _fail("Learning must compose learning paths from governed research references")

    watchtower = domain_by_id["watchtower"]
    if watchtower["source_mode"] != "federated":
        _fail("Watchtower must be federated, not a new canonical monitoring store")
    if any("cm_watchtower" in ref.lower() for ref in _source_refs(watchtower)):
        _fail("Watchtower must not invent a canonical cm_watchtower relation")

    if "comind.cm_journal_entry" not in _source_refs(domain_by_id["reflection"]):
        _fail("Reflection must be backed by the canonical journal substrate")

    if "config/integrity-registry.v1.json" not in _source_refs(domain_by_id["implementation_integrity"]):
        _fail("Implementation Integrity must reuse the canonical repository registry")

    for text in _walk_strings(contract):
        upper = text.upper()
        for marker in PROHIBITED_MARKERS:
            if marker in upper:
                _fail(f"prohibited incomplete marker found: {marker}")


def load_contract(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as handle:
        value = json.load(handle)
    if not isinstance(value, dict):
        _fail("manifest root must be an object")
    return value


def main(argv: list[str]) -> int:
    path = Path(argv[1]) if len(argv) > 1 else DEFAULT_MANIFEST
    try:
        contract = load_contract(path)
        validate_contract(contract)
    except (OSError, json.JSONDecodeError, ContractError) as exc:
        print(f"HOME-001 IA validation failed: {exc}", file=sys.stderr)
        return 1
    print(f"HOME-001 IA validation passed: {path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
