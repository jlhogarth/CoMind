#!/usr/bin/env python3
"""Verify the Issue #116 Stage 1 manifest reconciled by Issue #123."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
MANIFEST_PATH = ROOT / "config/live_foundry_stage1_budget_authority_manifest.json"

EXPECTED_PRE_STAGE1_MIGRATIONS = [
    ("20261005213616", "comind_base_v2_initial_build"),
    ("20261006051527", "comind_pm_ledger_maintenance_package_v0_1"),
    ("20261006051627", "comind_pm_ledger_hardening_v0_1_1"),
    ("20261015211851", "operator_console_live_activation_v0_2"),
    ("20261015212201", "operator_console_service_role_least_privilege_v0_2_1"),
    ("20261015212719", "operator_console_explicit_deny_policies_v0_2_2"),
]


def git_blob_sha(path: Path) -> str:
    data = path.read_bytes()
    header = f"blob {len(data)}\0".encode("ascii")
    return hashlib.sha1(header + data).hexdigest()


def require(condition: bool, message: str) -> None:
    if not condition:
        raise RuntimeError(message)


def main() -> int:
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    require(manifest.get("issue") == 116, "Stage 1 manifest must remain bound to original Issue #116")
    require(manifest.get("reconciliation_issue") == 123, "Stage 1 manifest must record Issue #123 reconciliation")
    require(manifest.get("engineering_tier") == "T3", "Stage 1 manifest engineering tier changed")
    require(
        manifest.get("live_mutation_authority") == "C4 explicit human approval required",
        "Stage 1 live authority boundary changed",
    )
    require(
        manifest.get("reconciled_authoritative_main_sha") == "4d625c340f8864791d373640affec4aa99204a07",
        "Issue #123 reconciled main baseline changed without review",
    )

    baseline = manifest["reviewed_live_baseline"]
    observed_baseline = [
        (entry["version"], entry["name"])
        for entry in baseline["expected_migrations_pre_stage1"]
    ]
    require(
        observed_baseline == EXPECTED_PRE_STAGE1_MIGRATIONS,
        "Reviewed pre-Stage 1 live migration baseline changed",
    )
    require(
        baseline.get("unknown_migration_drift_must_fail_closed") is True,
        "Unknown live migration drift must fail closed",
    )
    require(
        baseline.get("operator_console_live_schema_authority_active_at_reconciliation") is True,
        "Issue #123 must preserve the observed Operator Console live authority boundary",
    )

    projection = manifest["finops_projection"]
    source_path = ROOT / projection["source_path"]
    builder_path = ROOT / projection["builder_path"]
    require(source_path.is_file(), f"Missing FinOps projection source: {source_path}")
    require(builder_path.is_file(), f"Missing FinOps projection builder: {builder_path}")
    require(
        git_blob_sha(source_path) == projection["source_git_blob_sha"],
        "FinOps legacy source blob differs from reviewed Issue #116 manifest",
    )
    require(
        git_blob_sha(builder_path) == projection["builder_git_blob_sha"],
        "FinOps projection builder differs from reviewed Issue #116 manifest",
    )
    require(
        projection.get("raw_source_must_not_be_applied_live") is True,
        "Raw legacy FinOps migration became live-applicable",
    )

    ordered = manifest["ordered_migrations"]
    require(
        [entry["ordinal"] for entry in ordered] == list(range(1, len(ordered) + 1)),
        "Stage 1 migration ordinals are not contiguous",
    )
    require(len(ordered) == 6, "Stage 1 migration count changed without reconciliation")

    live_names: set[str] = set()
    ordered_paths: set[str] = set()
    for entry in ordered:
        live_name = entry["live_migration_name"]
        require(live_name not in live_names, f"Duplicate live migration name: {live_name}")
        live_names.add(live_name)

        if entry["kind"] == "generated_projection":
            require(entry["source"] == projection["source_path"], "Projection source mismatch")
            require(
                entry["source_git_blob_sha"] == projection["source_git_blob_sha"],
                "Projection source hash mismatch",
            )
            ordered_paths.add(entry["source"])
            continue

        require(entry["kind"] == "repository_sql", f"Unsupported Stage 1 migration kind: {entry['kind']}")
        relative = entry["path"]
        path = ROOT / relative
        require(path.is_file(), f"Missing Stage 1 migration: {relative}")
        require(
            git_blob_sha(path) == entry["git_blob_sha"],
            f"Stage 1 migration blob drifted: {relative}",
        )
        ordered_paths.add(relative)

    excluded = set(manifest["excluded_from_stage1"])
    overlap = ordered_paths.intersection(excluded)
    require(not overlap, f"Excluded migration entered Stage 1 manifest: {sorted(overlap)}")

    require(
        manifest["expected_live_seed_delta"]["legacy_public_agent_rows"] == 0,
        "Stage 1 must not seed legacy public agent identity",
    )
    require(
        manifest["expected_live_seed_delta"]["legacy_governance_decision_rows"] == 0,
        "Stage 1 must not seed legacy governance identity",
    )
    require(
        manifest["expected_live_seed_delta"]["foundry_agent_rows"] == 0,
        "Stage 1 must not populate Foundry agents",
    )

    compatibility = manifest["future_compatibility_gates"]
    require(
        compatibility.get("foundry_agent_substrate_before_security_sweep") is True,
        "Future Foundry deployment must preserve 006 before 007 ordering",
    )
    require(
        compatibility.get("operator_console_service_role_and_forced_rls_compatibility_required") is True,
        "Operator Console privilege and RLS compatibility gate was removed",
    )
    require(
        compatibility.get("foundry_runtime_write_paths_must_not_depend_on_raw_service_role_dml") is True,
        "Foundry runtime write-path least-privilege invariant was removed",
    )

    parallel = manifest["parallel_lane_boundaries"]
    require(parallel.get("operator_console_issue") == 118, "Operator Console issue boundary changed")
    require(parallel.get("operator_console_pr") == 119, "Operator Console PR boundary changed")
    require(
        parallel.get("operator_console_holds_live_schema_mutation_authority") is True,
        "Issue #123 must not silently release Operator Console live mutation authority",
    )
    require(
        parallel.get("live_foundry_may_mutate_live_schema") is False,
        "Issue #123 repository lane must not authorize live Foundry schema mutation",
    )
    require(
        parallel.get("single_live_schema_mutation_lane") is True,
        "Single live schema mutation lane invariant changed",
    )

    print(
        "Issue #116 Stage 1 manifest reconciled by Issue #123: "
        f"migrations={len(ordered)} pre_stage1_live_migrations={len(observed_baseline)} "
        f"reconciled_main={manifest['reconciled_authoritative_main_sha']}"
    )
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"Stage 1 manifest verification failed: {exc}", file=sys.stderr)
        raise
