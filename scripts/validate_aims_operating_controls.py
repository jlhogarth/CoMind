#!/usr/bin/env python3
"""Deterministic validation for GOV-004 AIMS operating-control artifacts."""

from __future__ import annotations

import csv
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ISO = ROOT / "docs" / "governance" / "iso"

ROLE_FILE = ISO / "aims-role-competence-register.csv"
INCIDENT_FILE = ISO / "aims-incident-escalation-matrix.csv"
RETENTION_FILE = ISO / "aims-evidence-retention-schedule.csv"
SUPPLIER_SOURCE_FILE = ISO / "aims-supplier-inventory.csv"
SUPPLIER_GOV_FILE = ISO / "aims-supplier-governance-register.csv"
MANAGEMENT_REVIEW_FILE = ISO / "AIMS-MANAGEMENT-REVIEW-PACKAGE.md"

REQUIRED_INCIDENT_FAMILIES = {
    "SECURITY_PRIVACY",
    "PROVIDER_MODEL",
    "RELIABILITY_CONTINUITY",
    "FINANCIAL_FINOPS",
    "DATA_MEMORY",
    "AUTONOMY_AUTHORITY",
    "SUPPLIER",
    "GOVERNANCE_EVIDENCE",
}

REQUIRED_SUPPLIERS = {
    "SUP-OPENAI-001",
    "SUP-SUPABASE-001",
    "SUP-GITHUB-001",
    "SUP-NPM-001",
}

ALLOWED_SEVERITY = {"LOW", "MEDIUM", "HIGH", "CRITICAL"}
ALLOWED_ASSIGNMENT_STATES = {"ASSIGNED_FOUNDER_CEO", "ROLE_DEFINED_ASSIGNMENT_PENDING"}
ALLOWED_COMPETENCE_STATES = {
    "ASSIGNMENT_APPROVED_COMPETENCE_EVIDENCE_NOT_INDEPENDENTLY_ASSESSED",
    "REQUIREMENTS_DEFINED_PERSON_EVIDENCE_PENDING",
}


def read_csv(path: Path) -> list[dict[str, str]]:
    if not path.is_file():
        raise AssertionError(f"missing required artifact: {path.relative_to(ROOT)}")
    with path.open(newline="", encoding="utf-8") as handle:
        rows = list(csv.DictReader(handle))
    if not rows:
        raise AssertionError(f"artifact has no records: {path.relative_to(ROOT)}")
    return rows


def required(row: dict[str, str], fields: list[str], context: str) -> None:
    for field in fields:
        if field not in row or not row[field].strip():
            raise AssertionError(f"{context}: missing required field {field}")


def validate_repo_refs(value: str, context: str) -> None:
    for raw in value.split(";"):
        ref = raw.strip()
        if not ref:
            continue
        # GOV-004 records intentionally use repository paths only for evidence_refs.
        path = ROOT / ref
        if not path.exists():
            raise AssertionError(f"{context}: evidence path does not exist: {ref}")


def validate_roles() -> set[str]:
    rows = read_csv(ROLE_FILE)
    ids: set[str] = set()
    for row in rows:
        context = f"role {row.get('role_id', '<missing>')}"
        required(
            row,
            [
                "role_id",
                "role_name",
                "accountability_scope",
                "mandatory_competencies",
                "prohibited_conflicts",
                "assignment_state",
                "competence_evidence_state",
                "evidence_required",
                "evidence_refs",
                "review_trigger",
            ],
            context,
        )
        role_id = row["role_id"].strip()
        if role_id in ids:
            raise AssertionError(f"duplicate role_id: {role_id}")
        ids.add(role_id)
        if row["assignment_state"] not in ALLOWED_ASSIGNMENT_STATES:
            raise AssertionError(f"{context}: invalid assignment_state")
        if row["competence_evidence_state"] not in ALLOWED_COMPETENCE_STATES:
            raise AssertionError(f"{context}: invalid competence_evidence_state")
        validate_repo_refs(row["evidence_refs"], context)
    if "ROLE-AIMS-OWNER" not in ids or "ROLE-INCIDENT-OWNER" not in ids or "ROLE-SUPPLIER-OWNER" not in ids:
        raise AssertionError("role register lacks required accountable role families")
    return ids


def validate_incidents(role_ids: set[str]) -> None:
    rows = read_csv(INCIDENT_FILE)
    families: set[str] = set()
    for row in rows:
        context = f"incident {row.get('incident_family', '<missing>')}"
        required(
            row,
            [
                "incident_family",
                "severity_floor",
                "examples",
                "immediate_internal_action",
                "human_escalation_required",
                "accountable_role_id",
                "supporting_role_ids",
                "evidence_preservation",
                "external_notification_status",
                "external_notification_timing",
                "closure_requirements",
                "review_trigger",
            ],
            context,
        )
        family = row["incident_family"].strip()
        if family in families:
            raise AssertionError(f"duplicate incident family: {family}")
        families.add(family)
        severity = row["severity_floor"].strip()
        if severity not in ALLOWED_SEVERITY:
            raise AssertionError(f"{context}: invalid severity {severity}")
        if severity in {"HIGH", "CRITICAL"} and row["human_escalation_required"].strip() != "YES":
            raise AssertionError(f"{context}: high/critical incident must require human escalation")
        if row["accountable_role_id"].strip() not in role_ids:
            raise AssertionError(f"{context}: unknown accountable role")
        for supporting in row["supporting_role_ids"].split(";"):
            if supporting.strip() and supporting.strip() not in role_ids:
                raise AssertionError(f"{context}: unknown supporting role {supporting.strip()}")
        if row["external_notification_status"].strip() != "LEGAL_OR_CONTRACT_REVIEW_REQUIRED":
            raise AssertionError(f"{context}: external notification applicability must remain unresolved")
        if row["external_notification_timing"].strip() != "LEGAL_OR_CONTRACT_REVIEW_REQUIRED":
            raise AssertionError(f"{context}: invented external notification deadline is prohibited")
    if families != REQUIRED_INCIDENT_FAMILIES:
        raise AssertionError(
            f"incident-family mismatch: missing={sorted(REQUIRED_INCIDENT_FAMILIES - families)} "
            f"extra={sorted(families - REQUIRED_INCIDENT_FAMILIES)}"
        )


def validate_retention(role_ids: set[str]) -> None:
    rows = read_csv(RETENTION_FILE)
    classes: set[str] = set()
    for row in rows:
        context = f"retention {row.get('evidence_class', '<missing>')}"
        required(
            row,
            [
                "evidence_class",
                "description",
                "sensitivity",
                "authoritative_source",
                "retention_basis",
                "legal_or_contract_dependency",
                "hold_rule",
                "disposition_rule",
                "owner_role_id",
                "integrity_requirement",
                "review_trigger",
            ],
            context,
        )
        evidence_class = row["evidence_class"].strip()
        if evidence_class in classes:
            raise AssertionError(f"duplicate evidence_class: {evidence_class}")
        classes.add(evidence_class)
        if row["owner_role_id"].strip() not in role_ids:
            raise AssertionError(f"{context}: unknown owner role")
        if row["legal_or_contract_dependency"].strip() != "LEGAL_OR_CONTRACT_REVIEW_REQUIRED":
            raise AssertionError(f"{context}: legal/contract retention dependency must remain unresolved")
        retention = row["retention_basis"].strip()
        if any(char.isdigit() for char in retention):
            raise AssertionError(f"{context}: fixed numeric retention period is prohibited in GOV-004")
        if "hold" not in row["hold_rule"].lower() and "preserve" not in row["hold_rule"].lower():
            raise AssertionError(f"{context}: hold behavior is not explicit")
    required_classes = {
        "GOVERNANCE_DECISION",
        "TECHNICAL_VERIFICATION",
        "INCIDENT_CORRECTIVE_ACTION",
        "RISK_ASSESSMENT",
        "SUPPLIER_ASSURANCE",
        "AUTHORITY_EXECUTION_PROVENANCE",
        "DATA_MEMORY_LINEAGE",
        "COMPETENCE_AWARENESS",
        "PUBLIC_ASSURANCE_CLAIM",
    }
    if not required_classes.issubset(classes):
        raise AssertionError(f"retention schedule missing required classes: {sorted(required_classes - classes)}")


def validate_suppliers(role_ids: set[str]) -> None:
    source_rows = read_csv(SUPPLIER_SOURCE_FILE)
    source_ids = {row["supplier_id"].strip() for row in source_rows}
    if source_ids != REQUIRED_SUPPLIERS:
        raise AssertionError(
            f"GOV-003 supplier inventory changed: expected={sorted(REQUIRED_SUPPLIERS)} observed={sorted(source_ids)}"
        )

    gov_rows = read_csv(SUPPLIER_GOV_FILE)
    gov_ids: set[str] = set()
    for row in gov_rows:
        context = f"supplier governance {row.get('supplier_id', '<missing>')}"
        required(
            row,
            [
                "supplier_id",
                "due_diligence_state",
                "security_privacy_review",
                "data_use_terms_review",
                "continuity_review",
                "provider_independence_review",
                "acquisition_mode_review",
                "assurance_evidence_state",
                "reassessment_cadence",
                "reassessment_triggers",
                "exit_readiness_state",
                "exit_or_fallback_criteria",
                "decision_owner_role_id",
                "evidence_refs",
            ],
            context,
        )
        supplier_id = row["supplier_id"].strip()
        if supplier_id in gov_ids:
            raise AssertionError(f"duplicate supplier governance row: {supplier_id}")
        gov_ids.add(supplier_id)
        if supplier_id not in source_ids:
            raise AssertionError(f"{context}: supplier not present in GOV-003 inventory")
        if row["decision_owner_role_id"].strip() not in role_ids:
            raise AssertionError(f"{context}: unknown decision owner role")
        if row["due_diligence_state"].strip() not in {"OPEN", "COMPLETE", "PARTIAL"}:
            raise AssertionError(f"{context}: invalid due_diligence_state")
        if row["exit_readiness_state"].strip() not in {"NOT_TESTED", "PARTIAL", "TESTED"}:
            raise AssertionError(f"{context}: invalid exit_readiness_state")
        validate_repo_refs(row["evidence_refs"], context)
    if gov_ids != source_ids:
        raise AssertionError(
            f"supplier governance coverage mismatch: missing={sorted(source_ids - gov_ids)} extra={sorted(gov_ids - source_ids)}"
        )


def validate_management_review() -> None:
    if not MANAGEMENT_REVIEW_FILE.is_file():
        raise AssertionError("missing management-review package")
    text = MANAGEMENT_REVIEW_FILE.read_text(encoding="utf-8")
    required_phrases = [
        "Prior actions and decisions",
        "Context, scope, interested parties and standards",
        "Objectives and metrics",
        "System inventory and intended use",
        "Risk and impact",
        "Incidents, nonconformities and corrective action",
        "Supplier and provider governance",
        "Competence, awareness and independence",
        "Audit, evidence integrity and retention",
        "Resources, funding, FinOps and performance",
        "Required outputs",
        "PENDING_LICENSED_SOURCE",
        "funding-gated",
        "Agent or reviewer consensus is not risk acceptance",
    ]
    missing = [phrase for phrase in required_phrases if phrase not in text]
    if missing:
        raise AssertionError(f"management-review package missing required coverage: {missing}")


if __name__ == "__main__":
    roles = validate_roles()
    validate_incidents(roles)
    validate_retention(roles)
    validate_suppliers(roles)
    validate_management_review()
    print("GOV-004 AIMS operating-controls validation passed")
