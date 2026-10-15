#!/usr/bin/env python3
"""Verify the Issue #116 live Foundry Stage 1 deployment manifest."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
MANIFEST_PATH = ROOT / "config/live_foundry_stage1_budget_authority_manifest.json"


def git_blob_sha(path: Path) -> str:
    data = path.read_bytes()
    header = f"blob {len(data)}\0".encode("ascii")
    return hashlib.sha1(header + data).hexdigest()


def require(condition: bool, message: str) -> None:
    if not condition:
        raise RuntimeError(message)


def main() -> int:
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    require(manifest.get("issue") == 116, "Stage 1 manifest must remain bound to Issue #116")
    require(manifest.get("engineering_tier") == "T3", "Stage 1 manifest engineering tier changed")
    require(
        manifest.get("live_mutation_authority") == "C4 explicit human approval required",
        "Stage 1 live authority boundary changed",
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
    require(projection.get("raw_source_must_not_be_applied_live") is True, "Raw legacy FinOps migration became live-applicable")

    ordered = manifest["ordered_migrations"]
    require([entry["ordinal"] for entry in ordered] == list(range(1, len(ordered) + 1)), "Stage 1 migration ordinals are not contiguous")
    require(len(ordered) == 6, "Stage 1 migration count changed without reconciliation")

    live_names: set[str] = set()
    ordered_paths: set[str] = set()
    for entry in ordered:
        live_name = entry["live_migration_name"]
        require(live_name not in live_names, f"Duplicate live migration name: {live_name}")
        live_names.add(live_name)

        if entry["kind"] == "generated_projection":
            require(entry["source"] == projection["source_path"], "Projection source mismatch")
            require(entry["source_git_blob_sha"] == projection["source_git_blob_sha"], "Projection source hash mismatch")
            ordered_paths.add(entry["source"])
            continue

        require(entry["kind"] == "repository_sql", f"Unsupported Stage 1 migration kind: {entry['kind']}")
        relative = entry["path"]
        path = ROOT / relative
        require(path.is_file(), f"Missing Stage 1 migration: {relative}")
        require(git_blob_sha(path) == entry["git_blob_sha"], f"Stage 1 migration blob drifted: {relative}")
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

    print(
        "Issue #116 Stage 1 manifest verification passed: "
        f"migrations={len(ordered)} source_main={manifest['authoritative_source_main_sha']}"
    )
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"Stage 1 manifest verification failed: {exc}", file=sys.stderr)
        raise
