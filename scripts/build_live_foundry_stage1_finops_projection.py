#!/usr/bin/env python3
"""Build the Issue #116 production projection of the legacy FinOps v1 migration.

The original 2026-09-10 FinOps migration was verified with synthetic legacy
public identity tables that do not exist in the live CoMind v2 schema. This
builder preserves the monetary and provider-governance implementation while
removing obsolete legacy identity foreign keys and legacy identity/governance
seed writes.

The transformation fails closed if the reviewed source Git blob or any expected
source anchor changes. The generated SQL is a deployment artifact. It must be
reviewed and applied only through the separately authorized C4 live deployment
procedure.
"""

from __future__ import annotations

import argparse
import hashlib
from pathlib import Path
import sys

EXPECTED_SOURCE_GIT_BLOB_SHA = "c5922026aa27b0656a10fe76d29bb17a0e87ca0d"
DEFAULT_SOURCE = Path("db/migrations/20260910_001_comind_finops_resource_governor.sql")


def git_blob_sha(data: bytes) -> str:
    header = f"blob {len(data)}\0".encode("ascii")
    return hashlib.sha1(header + data).hexdigest()


def replace_exact(text: str, old: str, new: str, expected_count: int, label: str) -> str:
    actual = text.count(old)
    if actual != expected_count:
        raise RuntimeError(
            f"{label}: expected {expected_count} source anchors, found {actual}; refusing projection"
        )
    return text.replace(old, new)


def remove_between(text: str, start: str, end: str, label: str) -> str:
    start_count = text.count(start)
    end_count = text.count(end)
    if start_count != 1 or end_count != 1:
        raise RuntimeError(
            f"{label}: expected exactly one start and end anchor, found {start_count} and {end_count}"
        )
    start_index = text.index(start)
    end_index = text.index(end, start_index)
    if end_index <= start_index:
        raise RuntimeError(f"{label}: invalid source anchor ordering")
    return text[:start_index] + text[end_index:]


def build_projection(source_bytes: bytes) -> str:
    source_sha = git_blob_sha(source_bytes)
    if source_sha != EXPECTED_SOURCE_GIT_BLOB_SHA:
        raise RuntimeError(
            "Legacy FinOps source changed from the reviewed Git blob "
            f"{EXPECTED_SOURCE_GIT_BLOB_SHA}; observed {source_sha}. Reconcile before deployment."
        )

    text = source_bytes.decode("utf-8")

    text = replace_exact(
        text,
        "-- Dependency: CoMind base schema, including projects(id), agents(id), and\n"
        "--             comind_governance_decisions(id).",
        "-- Live projection dependency: CoMind v2 base schema plus Supabase platform roles.\n"
        "-- Current runtime identity and execution provenance remain authoritative in comind.cm_*.",
        1,
        "legacy dependency header",
    )

    text = replace_exact(
        text,
        "project_id UUID REFERENCES projects(id) ON DELETE CASCADE,",
        "project_id UUID,",
        2,
        "legacy project foreign keys",
    )
    text = replace_exact(
        text,
        "agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,",
        "agent_id UUID,",
        5,
        "legacy agent foreign keys",
    )
    text = replace_exact(
        text,
        "owner_agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,",
        "owner_agent_id UUID,",
        1,
        "legacy owner-agent foreign key",
    )
    text = replace_exact(
        text,
        "requested_by_agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,",
        "requested_by_agent_id UUID,",
        1,
        "legacy budget-exception agent foreign key",
    )
    text = replace_exact(
        text,
        "governance_decision_id BIGINT REFERENCES comind_governance_decisions(id) ON DELETE SET NULL,",
        "governance_decision_id BIGINT,",
        1,
        "legacy governance-decision foreign key",
    )

    text = remove_between(
        text,
        "INSERT INTO agents (id, name, type)\n",
        "INSERT INTO comind_service_providers (\n",
        "legacy FinOps agent seed",
    )
    text = remove_between(
        text,
        "INSERT INTO comind_governance_decisions (\n",
        "COMMIT;\n",
        "legacy governance-decision seed",
    )

    projection_banner = (
        "-- Issue #116 governed live projection.\n"
        f"-- Source Git blob: {EXPECTED_SOURCE_GIT_BLOB_SHA}\n"
        "-- The raw legacy migration must not be applied to the live CoMind v2 database.\n"
        "-- This projection preserves the FinOps monetary ledger and provider registry while\n"
        "-- preventing creation or seeding of a competing legacy identity/governance authority.\n\n"
    )
    text = replace_exact(text, "BEGIN;\n", projection_banner + "BEGIN;\n", 1, "transaction start")

    annotation_comments = """
-- Legacy annotation columns are intentionally not foreign keys in the live projection.
-- Current runtime project, actor, agent, run, conversation, and authorization provenance
-- is bound authoritatively by comind.cm_budget_authority_binding in the next migration stage.
COMMENT ON COLUMN public.comind_budget_policies.project_id IS
    'Legacy optional annotation only. Current runtime provenance is authoritative through comind.cm_budget_authority_binding.';
COMMENT ON COLUMN public.comind_budget_policies.agent_id IS
    'Legacy optional annotation only. Current runtime provenance is authoritative through comind.cm_budget_authority_binding.';
COMMENT ON COLUMN public.comind_workflow_cost_envelopes.project_id IS
    'Legacy optional annotation only. Current runtime provenance is authoritative through comind.cm_budget_authority_binding.';
COMMENT ON COLUMN public.comind_workflow_cost_envelopes.owner_agent_id IS
    'Legacy optional annotation only. Current runtime provenance is authoritative through comind.cm_budget_authority_binding.';
COMMENT ON COLUMN public.comind_cost_reservations.agent_id IS
    'Legacy optional annotation only. Current runtime reservation provenance is authoritative through comind.cm_budget_authority_reservation.';
COMMENT ON COLUMN public.comind_routing_decisions.agent_id IS
    'Legacy optional annotation only. Do not use as current runtime identity authority.';
COMMENT ON COLUMN public.comind_usage_events.agent_id IS
    'Legacy optional annotation only. Current runtime telemetry provenance is authoritative through comind.cm_budget_authority_telemetry.';
COMMENT ON COLUMN public.comind_execution_checkpoints.agent_id IS
    'Legacy optional annotation only. Do not use as current runtime identity authority.';
COMMENT ON COLUMN public.comind_budget_exceptions.requested_by_agent_id IS
    'Legacy optional annotation only. Do not use as current runtime identity authority.';
COMMENT ON COLUMN public.comind_budget_exceptions.governance_decision_id IS
    'Legacy optional annotation only. No legacy governance table is created by the live projection.';

"""
    text = replace_exact(
        text,
        "INSERT INTO comind_service_providers (\n",
        annotation_comments + "INSERT INTO comind_service_providers (\n",
        1,
        "provider seed anchor",
    )

    forbidden = (
        "REFERENCES projects(id)",
        "REFERENCES agents(id)",
        "REFERENCES comind_governance_decisions(id)",
        "INSERT INTO agents (id, name, type)",
        "INSERT INTO comind_governance_decisions (",
    )
    for token in forbidden:
        if token in text:
            raise RuntimeError(f"forbidden legacy authority token remains in projection: {token}")

    required = (
        "INSERT INTO comind_service_providers (",
        "CREATE TABLE IF NOT EXISTS comind_workflow_cost_envelopes (",
        "CREATE TABLE IF NOT EXISTS comind_cost_reservations (",
        "CREATE OR REPLACE FUNCTION comind_reserve_cost(",
        "GRANT EXECUTE ON FUNCTION comind_reserve_cost",
        "COMMIT;",
    )
    for token in required:
        if token not in text:
            raise RuntimeError(f"required FinOps contract token missing from projection: {token}")

    return text


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--check", action="store_true", help="Validate and build without writing SQL")
    args = parser.parse_args()

    source_bytes = args.source.read_bytes()
    projection = build_projection(source_bytes)

    if args.check:
        print(
            "Issue #116 FinOps projection validation passed: "
            f"source_blob={git_blob_sha(source_bytes)} bytes={len(projection.encode('utf-8'))}"
        )
        return 0

    if args.output is None:
        sys.stdout.write(projection)
        return 0

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(projection, encoding="utf-8")
    print(f"Wrote governed FinOps live projection to {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
