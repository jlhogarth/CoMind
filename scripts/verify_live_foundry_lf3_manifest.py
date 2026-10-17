#!/usr/bin/env python3
from __future__ import annotations

import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MANIFEST_PATH = ROOT / "config/live_foundry_lf3_security_prerequisites_manifest.json"
EXPECTED_SOURCE = "db/migrations/20261008_007_foundry_security_prerequisites.sql"
EXPECTED_BLOB = "461a43037301d121ab46ebda083b740baa04212f"
EXPECTED_LIVE_NAME = "live_foundry_lf3_security_prerequisites_v1"
EXPECTED_FUNCTIONS = {
    "comind.set_updated_at()",
    "comind.fn_belief_update_beta(uuid, boolean, jsonb)",
    "comind.fn_create_causal_node_from_memory(uuid, text, text)",
    "comind.set_current_actor(uuid)",
    "comind.current_actor()",
    "comind.set_updated_at_checklist()",
    "comind.set_updated_at_research_refs()",
}


def fail(message: str) -> None:
    raise SystemExit(message)


manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))

if manifest.get("schema_version") != "1.1.0":
    fail("LF-3 manifest schema version drifted")
if manifest.get("milestone") != "LF-3":
    fail("LF-3 manifest milestone drifted")
if manifest.get("source_path") != EXPECTED_SOURCE:
    fail("LF-3 manifest source path drifted")
if manifest.get("source_git_blob_sha") != EXPECTED_BLOB:
    fail("LF-3 reviewed source blob drifted in manifest")
if manifest.get("live_migration_name") != EXPECTED_LIVE_NAME:
    fail("LF-3 live migration name drifted")
if manifest.get("live_migration_version") is not None:
    fail("LF-3 live migration version must remain null before deployment")
if set(manifest.get("target_functions", [])) != EXPECTED_FUNCTIONS:
    fail("LF-3 target function set drifted")

actual_blob = subprocess.check_output(
    ["git", "hash-object", str(ROOT / EXPECTED_SOURCE)], cwd=ROOT, text=True
).strip()
if actual_blob != EXPECTED_BLOB:
    fail(f"Migration 007 source drifted: expected {EXPECTED_BLOB}, got {actual_blob}")

pre = manifest.get("predeployment_contract", {})
post = manifest.get("postdeployment_contract", {})
if (pre.get("comind_table_count"), pre.get("comind_rls_enabled"), pre.get("comind_rls_disabled")) != (94, 19, 75):
    fail("LF-3 predeployment RLS baseline drifted")
if (pre.get("comind_policy_count"), pre.get("comind_unconditional_true_policy_count")) != (12, 12):
    fail("LF-3 predeployment policy baseline drifted")
if (pre.get("mutable_search_path_function_count")) != 7:
    fail("LF-3 predeployment mutable function baseline drifted")
if (post.get("comind_table_count"), post.get("comind_rls_enabled"), post.get("comind_rls_disabled")) != (94, 94, 0):
    fail("LF-3 postdeployment RLS contract drifted")
if (post.get("comind_policy_count"), post.get("comind_unconditional_true_policy_count")) != (0, 0):
    fail("LF-3 postdeployment policy contract drifted")
if post.get("mutable_search_path_function_count") != 0:
    fail("LF-3 postdeployment mutable function contract drifted")

advisor = post.get("expected_security_advisor", {})
if advisor.get("function_search_path_mutable_warn") != 0 or advisor.get("function_search_path_mutable_warn_delta") != -7:
    fail("LF-3 expected function search-path Advisor delta drifted")
if advisor.get("rls_enabled_no_policy_info") != 106 or advisor.get("rls_enabled_no_policy_info_delta") != 79:
    fail("LF-3 expected RLS/no-policy Advisor delta drifted")

security = manifest.get("security_contract", {})
for key in (
    "changes_service_role_grants",
    "changes_function_execute_grants",
    "changes_schema_usage_grants",
    "changes_default_privileges",
    "auto_hardens_future_tables",
    "creates_client_access_policies",
    "expands_agent_authority",
):
    if security.get(key) is not False:
        fail(f"LF-3 manifest must explicitly keep {key}=false")

drift = manifest.get("known_canonical_live_drift", {})
if drift.get("cm_assistant_generation_repository_defined") is not True:
    fail("LF-3 manifest must record repository-defined cm_assistant_generation")
if drift.get("cm_assistant_generation_live_present") is not False:
    fail("LF-3 manifest must record cm_assistant_generation as absent from accepted live state")
if drift.get("current_canonical_broad_conversation_document_policies_present") is not False:
    fail("LF-3 manifest must distinguish current canonical policy hardening from live state")
if drift.get("live_broad_conversation_document_policy_count") != 12:
    fail("LF-3 manifest live broad-policy drift count changed")
if drift.get("current_canonical_target_function_search_paths_fixed") is not True:
    fail("LF-3 manifest must record canonical target function hardening")
if drift.get("live_mutable_target_function_count") != 7:
    fail("LF-3 manifest live mutable function drift count changed")
if drift.get("migration_007_creates_cm_assistant_generation") is not False:
    fail("LF-3 must not imply migration 007 reconciles missing canonical tables")

runtime = manifest.get("runtime_compatibility_contract", {})
if runtime.get("core_application_runtime_compatibility_status") != "unresolved":
    fail("LF-3 must not claim core runtime compatibility without evidence")
if runtime.get("missing_cm_assistant_generation_must_be_reconciled_or_proven_irrelevant_before_core_runtime_compatibility_claim") is not True:
    fail("LF-3 missing canonical table compatibility gate drifted")
if runtime.get("migration_007_does_not_reconcile_all_canonical_live_schema_drift") is not True:
    fail("LF-3 must preserve partial-reconciliation boundary")

approval = manifest.get("approval_boundary", {})
if approval.get("live_migration_007") != "requires fresh Joseph C4 approval":
    fail("LF-3 live approval boundary drifted")
if "unresolved" not in approval.get("live_compatibility_gate", ""):
    fail("LF-3 unresolved live compatibility gate must remain explicit")

excluded = set(manifest.get("explicitly_excluded", []))
if "db/migrations/20261008_008_foundry_runtime_orchestration.sql" not in excluded:
    fail("Migration 008 must remain excluded from LF-3")
if "Agent execution" not in excluded or "Virtual Employee activation" not in excluded:
    fail("Agent and Virtual Employee activation must remain excluded")

print(f"LF-3 manifest verified at migration 007 blob {actual_blob}")
