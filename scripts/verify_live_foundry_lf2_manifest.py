#!/usr/bin/env python3
from __future__ import annotations

import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MANIFEST_PATH = ROOT / "config/live_foundry_lf2_agent_substrate_manifest.json"
EXPECTED_SOURCE = "db/migrations/20261008_006_foundry_agent_substrate.sql"
EXPECTED_LIVE_NAME = "live_foundry_lf2_agent_substrate_v1"
EXPECTED_RELATIONS = {
    "comind.cm_foundry_agent_profile",
    "comind.cm_foundry_capability",
    "comind.cm_foundry_capability_grant",
    "comind.cm_foundry_authorization_request",
    "comind.cm_foundry_authorization_decision",
    "comind.cm_foundry_execution_context",
    "comind.cm_foundry_deliberation",
    "comind.cm_foundry_deliberation_participant",
    "comind.cm_foundry_deliberation_event",
    "comind.cm_foundry_deliberation_outcome",
    "comind.cm_foundry_recovery_checkpoint",
    "comind.cm_foundry_adapter_operation",
}


def fail(message: str) -> None:
    raise SystemExit(message)


manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))

if manifest.get("milestone") != "LF-2":
    fail("LF-2 manifest milestone is not LF-2")
if manifest.get("source_path") != EXPECTED_SOURCE:
    fail("LF-2 manifest source path drifted")
if manifest.get("live_migration_name") != EXPECTED_LIVE_NAME:
    fail("LF-2 live migration name drifted")
if manifest.get("live_migration_version") is not None:
    fail("LF-2 live migration version must remain null before live deployment")
if set(manifest.get("creates_relations", [])) != EXPECTED_RELATIONS:
    fail("LF-2 created-relation manifest drifted")

source_path = ROOT / EXPECTED_SOURCE
actual_blob = subprocess.check_output(
    ["git", "hash-object", str(source_path)],
    cwd=ROOT,
    text=True,
).strip()
if actual_blob != manifest.get("source_git_blob_sha"):
    fail(
        "LF-2 source migration blob does not match the reviewed manifest: "
        f"expected {manifest.get('source_git_blob_sha')}, got {actual_blob}"
    )

excluded = set(manifest.get("explicitly_excluded", []))
if "db/migrations/20261008_007_foundry_security_prerequisites.sql" not in excluded:
    fail("LF-3 migration 007 must be explicitly excluded from LF-2")
if manifest.get("data_contract", {}).get("seeds_agent_rows") is not False:
    fail("LF-2 must not seed Agent rows")
if manifest.get("data_contract", {}).get("executes_provider") is not False:
    fail("LF-2 must not execute providers")

security = manifest.get("security_contract", {})
if security.get("service_role_table_privileges") != ["SELECT", "INSERT"]:
    fail("LF-2 service_role privileges must remain SELECT and INSERT only")
if security.get("service_role_update_delegated") is not False:
    fail("LF-2 must not delegate service_role UPDATE")
if security.get("service_role_delete_delegated") is not False:
    fail("LF-2 must not delegate service_role DELETE")

print(f"LF-2 manifest verified at source blob {actual_blob}")
