#!/usr/bin/env python3
from __future__ import annotations

import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCOUT_DIR = ROOT / "docs" / "ve" / "scout"

PACKAGE_PATH = SCOUT_DIR / "SCOUT-002-C1-RESEARCH-PACKAGE.v0.1.json"
POLICY_PATH = SCOUT_DIR / "SCOUT-002-LEARNING-PATH-ACTIVATION-POLICY.v0.1.json"
EVIDENCE_PATH = SCOUT_DIR / "SCOUT-002-RESEARCH-EVIDENCE-CONTRACT.v0.1.json"
ASSIGNMENT_PATH = SCOUT_DIR / "SCOUT-R001-VE-STANDARDS-OPERATIONAL-READINESS.v0.1.json"

SHA256 = re.compile(r"^[0-9a-f]{64}$")
SHA1 = re.compile(r"^[0-9a-f]{40}$")


def load(path: Path) -> dict:
    with path.open("r", encoding="utf-8") as handle:
        value = json.load(handle)
    if not isinstance(value, dict):
        raise AssertionError(f"{path.name} must contain a JSON object")
    return value


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def parse_utc(value: str) -> datetime:
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    require(parsed.tzinfo is not None, f"Timestamp must be timezone aware: {value}")
    return parsed.astimezone(timezone.utc)


def validate() -> None:
    package = load(PACKAGE_PATH)
    policy = load(POLICY_PATH)
    evidence = load(EVIDENCE_PATH)
    assignment = load(ASSIGNMENT_PATH)

    require(package["package_id"] == "SCOUT-002", "Unexpected package id")
    require(package["issue"] == 409, "SCOUT-002 must bind to issue 409")
    predecessor = package["authoritative_predecessor"]
    require(predecessor["control_id"] == "SCOUT-001", "SCOUT-001 must remain authoritative predecessor")
    require(predecessor["issue"] == 395 and predecessor["merged_pr"] == 398, "Canonical Scout predecessor drift")
    require(predecessor["actor_handle"] == "agent.scout", "Scout actor handle drift")
    require(predecessor["required_lifecycle_before_activation"] == "draft", "Scout must remain draft in SCOUT-002")
    require(predecessor["authority_floor"] == "C0" and predecessor["authority_ceiling"] == "C1", "Scout authority drift")

    capabilities = package["capabilities"]
    require(isinstance(capabilities, list) and len(capabilities) == 1, "SCOUT-002 must define exactly one capability")
    capability = capabilities[0]
    require(capability["capability_code"] == "research.evidence.synthesize", "Unexpected capability code")
    require(capability["action"] == "synthesize_evidence", "Unexpected capability action")
    require(capability["target_kind"] == "research_assignment", "Unexpected target kind")
    require(capability["max_authority"] == "C1", "Capability must be C1")
    require(capability["risk_class"] == "low", "Capability must remain low risk")
    require(capability["cost_bearing"] is False, "Capability must remain non-cost-bearing")
    require(capability["adapter"] == "ollama_local", "Initial adapter must remain ollama_local")
    runtime = capability["runtime_policy"]
    require(runtime["provider"] == "ollama_local" and runtime["model"] == "qwen3:0.6b", "Provider/model drift")
    require(runtime["local_http_only"] is True, "Ollama runtime must remain local-only")
    for key in ("paid_provider_allowed", "network_discovery_allowed", "production_target_allowed", "external_provider_mutation_allowed"):
        require(runtime[key] is False, f"Runtime boundary {key} must remain false")
    grant = capability["initial_grant_policy"]
    require(grant["environment"] == "isolated" and grant["authority_ceiling"] == "C1", "Initial grant boundary drift")
    require(grant["target_refs"] == ["scout-r001:ve-standards-operational-readiness"], "Initial target scope drift")
    require(grant["max_tasks"] == 1, "Initial grant must remain one task")
    require(grant["delegation_allowed"] is False and grant["expiry_required"] is True and grant["revocable"] is True, "Grant governance drift")
    require(grant["live_grant_created_by_sc002"] is False, "SCOUT-002 must not create a live Scout grant")

    boundaries = package["activation_boundaries"]
    require(boundaries["ve_activation_requires_fresh_lifecycle_authorization"] is True, "Fresh VE activation authorization must remain required")
    require(boundaries["sc002_activates_scout"] is False, "SCOUT-002 cannot activate Scout")
    require(boundaries["sc002_creates_live_capability_grant"] is False, "SCOUT-002 cannot grant live authority")

    require(policy["policy_id"] == "SCOUT-002-LP-ACTIVATION", "Unexpected learning policy id")
    require(policy["learner_actor_handle"] == "agent.scout", "Learning policy learner drift")
    learning_path = policy["learning_path"]
    require(learning_path["slug"] == "virtual-employee-standards-v0-1", "Learning path slug drift")
    require(learning_path["expected_pre_activation_status"] == "draft", "Learning path must remain draft before activation")
    require(learning_path["governing_standard"] == "VE-STD-001", "Governing standard drift")
    require(learning_path["governing_standard_commit"] == "ef1f4ebf6b37addc1ce7c1c1ea06839ba67ecfc8", "Accepted VE standard commit drift")
    require(learning_path["production_activation"] is False, "Learning path cannot authorize Production")

    sources = policy["source_expectations"]
    require(len(sources) == 5, "RLIB-003 source packet must contain exactly five sources")
    require([s["sequence_no"] for s in sources] == [1, 2, 3, 4, 5], "Source sequence drift")
    required_sources = [s for s in sources if s["required"]]
    require(len(required_sources) == 3, "Exactly three curriculum sources must be required")
    now = datetime.now(timezone.utc)
    for source in required_sources:
        require(source["authority_level"] == "primary_authoritative", f"Required source {source['sequence_no']} must be primary authoritative")
        require(source["lifecycle_status"] == "current", f"Required source {source['sequence_no']} must be current")
        require(SHA256.fullmatch(source["content_sha256"]) is not None, f"Required source {source['sequence_no']} requires SHA-256")
        due = parse_utc(source["freshness_due_at"])
        require(due > now, f"Required source {source['sequence_no']} freshness is overdue")

    secondary = sources[3]
    require(secondary["authority_level"] == "secondary_guidance", "Sequence 4 must remain secondary guidance")
    require(secondary["normative"] is False, "Sequence 4 must remain explicitly non-normative")
    require(SHA256.fullmatch(secondary["content_sha256"]) is not None, "Secondary guidance requires a SHA-256 fingerprint")

    withdrawn = sources[4]
    final_genai = sources[2]
    require(withdrawn["lifecycle_status"] == "withdrawn", "Sequence 5 must remain withdrawn")
    require(withdrawn["superseded_by_drive_file_id"] == final_genai["drive_file_id"], "Withdrawn source supersession drift")
    require(SHA256.fullmatch(withdrawn["content_sha256"]) is not None, "Withdrawn source requires a SHA-256 fingerprint")

    decision = policy["activation_decision"]
    require(decision["automatic_activation_allowed"] is False, "Curriculum activation cannot be automatic")
    require(decision["accountable_human_attestation_required"] is True, "Human attestation must remain required")
    require(decision["attestation_actor_handle"] == "joseph.hogarth", "Accountable attestation actor drift")
    require(decision["separate_from_ve_lifecycle_activation"] is True, "Learning and VE lifecycle activation must remain separate")
    require(decision["separate_from_capability_grant"] is True, "Learning and capability grants must remain separate")
    require(decision["completion_claim_requires_separate_evidence"] is True, "Completion requires separate evidence")

    require(evidence["contract_id"] == "SCOUT-002-EVIDENCE", "Unexpected evidence contract id")
    require(evidence["applies_to_actor_handle"] == "agent.scout", "Evidence actor drift")
    require(evidence["applies_to_capability"] == capability["capability_code"], "Evidence capability drift")
    required_fields = set(evidence["required_fields"])
    minimum_fields = {
        "assignment_id", "research_objective", "source_provenance", "source_authority", "source_lifecycle",
        "retrieval_or_observation_time", "material_sources_consulted", "findings", "uncertainty",
        "contradictory_or_negative_evidence", "source_currentness_caveats", "material_tool_use",
        "provider_model_provenance", "capability_code", "capability_grant_id", "authorization_decision_id",
        "authority_used", "environment", "target_kind", "target_ref", "cost", "work_product_ref",
        "work_product_sha256", "review_status", "failures_blocks_and_escalations", "material_developmental_change",
    }
    require(minimum_fields.issubset(required_fields), "Evidence contract is missing mandatory fields")
    epistemic = evidence["epistemic_requirements"]
    for key in (
        "observation_inference_hypothesis_separation",
        "material_uncertainty_must_be_explicit",
        "contradictory_evidence_must_not_be_suppressed",
        "missing_evidence_must_not_be_fabricated",
        "secondary_guidance_must_not_be_presented_as_normative",
        "withdrawn_sources_must_be_identified_as_withdrawn",
        "superseding_source_must_be_identified_when_known",
        "source_freshness_caveats_must_be_preserved",
    ):
        require(epistemic[key] is True, f"Epistemic obligation {key} must remain true")
    for key in ("research_output_may_expand_authority", "research_output_may_activate_lifecycle", "research_output_may_mutate_developmental_identity"):
        require(epistemic[key] is False, f"Evidence contract boundary {key} must remain false")

    require(assignment["assignment_id"] == "SCOUT-R001", "Unexpected first assignment id")
    require(assignment["status"] == "defined_not_authorized", "First assignment cannot be represented as authorized")
    require(assignment["assigned_actor_handle"] == "agent.scout", "Assignment actor drift")
    require(assignment["capability_code"] == capability["capability_code"], "Assignment capability drift")
    require(assignment["authority_level"] == "C1" and assignment["environment"] == "isolated", "Assignment authority/environment drift")
    require(assignment["target_kind"] == "research_assignment", "Assignment target kind drift")
    require(assignment["target_ref"] == grant["target_refs"][0], "Assignment target must equal the only initial grant target")
    require(assignment["max_tasks"] == 1, "First assignment must remain one task")
    assignment_scope = assignment["scope"]
    for key in (
        "open_web_discovery_allowed", "external_resource_mutation_allowed", "repository_write_allowed",
        "database_operational_write_allowed", "email_send_allowed", "delegation_allowed", "paid_provider_allowed",
        "production_allowed", "authority_expansion_recommendation_allowed",
    ):
        require(assignment_scope[key] is False, f"Assignment boundary {key} must remain false")
    require(assignment_scope["supplied_evidence_only"] is True, "First assignment must remain supplied-evidence-only")

    governing = assignment["source_packet"]["governing_standard"]
    require(governing["accepted_commit"] == learning_path["governing_standard_commit"], "Assignment standard commit drift")
    require(SHA1.fullmatch(governing["current_blob_sha1_at_definition"]) is not None, "Assignment must pin the observed standard blob SHA-1")
    assignment_sources = assignment["source_packet"]["rlib_sources"]
    require(len(assignment_sources) == len(sources), "Assignment source count must match activation policy")
    policy_by_drive = {s["drive_file_id"]: s for s in sources}
    for source in assignment_sources:
        canonical = policy_by_drive.get(source["drive_file_id"])
        require(canonical is not None, f"Assignment source {source['drive_file_id']} is not in activation policy")
        for field in ("sequence_no", "title", "authority_level", "lifecycle_status", "content_sha256", "freshness_due_at", "required"):
            require(source[field] == canonical[field], f"Assignment source field drift for {source['drive_file_id']}:{field}")
        require(SHA256.fullmatch(source["content_sha256"]) is not None, f"Assignment source {source['drive_file_id']} requires SHA-256")
    require(assignment_sources[4]["superseded_by_drive_file_id"] == assignment_sources[2]["drive_file_id"], "Assignment withdrawn-source supersession drift")

    assignment_runtime = assignment["runtime"]
    require(assignment_runtime["adapter"] == capability["adapter"], "Assignment adapter drift")
    require(assignment_runtime["provider"] == runtime["provider"] and assignment_runtime["model"] == runtime["model"], "Assignment provider/model drift")
    require(assignment_runtime["cost_usd_max"] == 0, "First assignment must remain zero cost")
    require(assignment_runtime["human_review_required"] is True, "Human review must remain required")

    execution_gate = assignment["execution_gate"]
    require(execution_gate["assignment_definition_is_authorization"] is False, "Assignment definition cannot authorize execution")
    require(execution_gate["requires_learning_path_activation_attestation"] is True, "Learning attestation must precede execution")
    require(execution_gate["requires_scout_lifecycle_activation"] is True, "Scout lifecycle activation must precede execution")
    require(execution_gate["requires_exact_scoped_capability_grant"] is True, "Exact scoped grant must precede execution")
    require(execution_gate["requires_fresh_execution_authorization"] is True, "Fresh execution authorization must precede execution")
    require(execution_gate["not_authorized_by_sc002_definition_alone"] is True, "SCOUT-002 definition alone must not authorize execution")

    print(
        "pass|scout-002|capabilities=1|required_sources=3|total_sources=5|"
        "assignment=SCOUT-R001|authority=C1|environment=isolated|max_tasks=1|cost_usd_max=0|live_grant=false"
    )


if __name__ == "__main__":
    try:
        validate()
    except (AssertionError, KeyError, TypeError, ValueError, json.JSONDecodeError) as exc:
        print(f"SCOUT-002 validation failed: {exc}", file=sys.stderr)
        raise SystemExit(1)
