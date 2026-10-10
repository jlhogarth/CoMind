#!/usr/bin/env python3
"""Validate GOV-003 AIMS system/supplier/risk inventory without network access."""

from __future__ import annotations

import csv
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ISO_DIR = ROOT / "docs" / "governance" / "iso"
SYSTEMS = ISO_DIR / "aims-system-inventory.csv"
SUPPLIERS = ISO_DIR / "aims-supplier-inventory.csv"
RISKS = ISO_DIR / "aims-system-risk-baseline.csv"
INTENDED_USE = ISO_DIR / "AIMS-INTENDED-USE-AND-OVERSIGHT-BASELINE.md"

EXPECTED_SYSTEM_IDS = {
    "SYS-CHAT-001",
    "SYS-PROV-001",
    "SYS-FOUND-001",
    "SYS-WORK-001",
    "SYS-FIN-001",
    "SYS-DATA-001",
    "SYS-MEM-001",
}
EXPECTED_SUPPLIER_IDS = {
    "SUP-OPENAI-001",
    "SUP-SUPABASE-001",
    "SUP-GITHUB-001",
    "SUP-NPM-001",
}
EXPECTED_RISK_IDS = {f"RISK-G003-{index:03d}" for index in range(1, 9)}

ALLOWED_LIFECYCLE = {"ISOLATED_TEST", "LIVE_SUPPORTING_SCHEMA"}
ALLOWED_EVIDENCE = {
    "PROPOSED",
    "REPOSITORY_IMPLEMENTED",
    "ISOLATED_VERIFIED",
    "VERIFIED_NOT_DEPLOYED",
    "DEPLOYED_UNVERIFIED",
    "OPERATING_EVIDENCE",
    "INDEPENDENTLY_ASSESSED",
    "GAP",
}
ALLOWED_DEPLOYMENT = {
    "NOT_VERIFIED_PRODUCTION",
    "VERIFIED_NOT_DEPLOYED",
    "LIVE_OBSERVED_SUPPORTING",
}
ALLOWED_TIERS = {"T0", "T1", "T2", "T3"}
ALLOWED_EXTERNAL = {"NONE", "NETWORK_FREE_ISOLATED", "LIVE_PROVIDER_VERIFIED_ISOLATED"}
ALLOWED_LIKELIHOOD = {"UNLIKELY", "POSSIBLE", "LIKELY"}
ALLOWED_IMPACT = {"LIMITED", "MATERIAL", "SEVERE", "CRITICAL"}
ALLOWED_RATING = {"LOW", "MEDIUM", "HIGH", "CRITICAL"}


def fail(message: str) -> None:
    raise AssertionError(message)


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        if not reader.fieldnames:
            fail(f"{path}: missing header")
        rows = []
        for raw in reader:
            rows.append({str(key).strip(): (value or "").strip() for key, value in raw.items()})
        return rows


def split_semicolon(value: str) -> list[str]:
    return [item.strip() for item in value.split(";") if item.strip()]


def require_fields(row: dict[str, str], fields: set[str], identity: str) -> None:
    missing = sorted(field for field in fields if not row.get(field, "").strip())
    if missing:
        fail(f"{identity}: blank required fields {missing}")


def verify_repo_refs(raw: str, identity: str, field: str) -> None:
    for ref in split_semicolon(raw):
        candidate = ROOT / ref
        if not candidate.exists():
            fail(f"{identity}: {field} path does not exist: {ref}")


def main() -> int:
    system_rows = read_csv(SYSTEMS)
    supplier_rows = read_csv(SUPPLIERS)
    risk_rows = read_csv(RISKS)

    system_ids = [row.get("system_id", "") for row in system_rows]
    supplier_ids = [row.get("supplier_id", "") for row in supplier_rows]
    risk_ids = [row.get("risk_id", "") for row in risk_rows]

    if len(system_ids) != len(set(system_ids)):
        fail("duplicate system_id found")
    if set(system_ids) != EXPECTED_SYSTEM_IDS:
        fail(
            f"system set mismatch: missing={sorted(EXPECTED_SYSTEM_IDS - set(system_ids))} "
            f"extra={sorted(set(system_ids) - EXPECTED_SYSTEM_IDS)}"
        )
    if len(supplier_ids) != len(set(supplier_ids)):
        fail("duplicate supplier_id found")
    if set(supplier_ids) != EXPECTED_SUPPLIER_IDS:
        fail(
            f"supplier set mismatch: missing={sorted(EXPECTED_SUPPLIER_IDS - set(supplier_ids))} "
            f"extra={sorted(set(supplier_ids) - EXPECTED_SUPPLIER_IDS)}"
        )
    if len(risk_ids) != len(set(risk_ids)):
        fail("duplicate risk_id found")
    if set(risk_ids) != EXPECTED_RISK_IDS:
        fail(
            f"risk set mismatch: missing={sorted(EXPECTED_RISK_IDS - set(risk_ids))} "
            f"extra={sorted(set(risk_ids) - EXPECTED_RISK_IDS)}"
        )

    system_required = {
        "system_id", "canonical_name", "system_group", "lifecycle_state", "evidence_state",
        "deployment_state", "accountable_owner", "purpose", "prohibited_uses", "human_oversight",
        "authority_boundary", "engineering_tier", "supplier_ids", "data_store_dependencies",
        "data_classes", "external_interaction_state", "recovery_fallback", "evidence_refs",
        "observed_at", "next_review_trigger",
    }
    for row in system_rows:
        sid = row["system_id"]
        require_fields(row, system_required, sid)
        if row["lifecycle_state"] not in ALLOWED_LIFECYCLE:
            fail(f"{sid}: invalid lifecycle_state {row['lifecycle_state']!r}")
        if row["evidence_state"] not in ALLOWED_EVIDENCE:
            fail(f"{sid}: invalid evidence_state {row['evidence_state']!r}")
        if row["deployment_state"] not in ALLOWED_DEPLOYMENT:
            fail(f"{sid}: invalid deployment_state {row['deployment_state']!r}")
        if row["engineering_tier"] not in ALLOWED_TIERS:
            fail(f"{sid}: invalid engineering_tier {row['engineering_tier']!r}")
        if row["external_interaction_state"] not in ALLOWED_EXTERNAL:
            fail(f"{sid}: invalid external_interaction_state {row['external_interaction_state']!r}")
        linked_suppliers = set(split_semicolon(row["supplier_ids"]))
        unknown_suppliers = linked_suppliers - EXPECTED_SUPPLIER_IDS
        if unknown_suppliers:
            fail(f"{sid}: unknown supplier links {sorted(unknown_suppliers)}")
        verify_repo_refs(row["evidence_refs"], sid, "evidence_refs")

        if row["deployment_state"] == "LIVE_OBSERVED_SUPPORTING":
            if sid not in {"SYS-DATA-001", "SYS-MEM-001"}:
                fail(f"{sid}: only supporting live schema components may use LIVE_OBSERVED_SUPPORTING")
            if row["lifecycle_state"] != "LIVE_SUPPORTING_SCHEMA":
                fail(f"{sid}: live supporting deployment requires LIVE_SUPPORTING_SCHEMA lifecycle")
            if row["evidence_state"] != "DEPLOYED_UNVERIFIED":
                fail(f"{sid}: live supporting schema must remain DEPLOYED_UNVERIFIED in GOV-003")
            if linked_suppliers != {"SUP-SUPABASE-001"}:
                fail(f"{sid}: live supporting schema must resolve only to current Supabase dependency")
        else:
            if row["lifecycle_state"] == "LIVE_SUPPORTING_SCHEMA":
                fail(f"{sid}: LIVE_SUPPORTING_SCHEMA requires LIVE_OBSERVED_SUPPORTING deployment state")

        if row["evidence_state"] in {"OPERATING_EVIDENCE", "INDEPENDENTLY_ASSESSED"}:
            fail(f"{sid}: GOV-003 has no basis to claim {row['evidence_state']}")

    systems_by_id = {row["system_id"]: row for row in system_rows}
    if systems_by_id["SYS-CHAT-001"]["external_interaction_state"] != "LIVE_PROVIDER_VERIFIED_ISOLATED":
        fail("SYS-CHAT-001 must preserve the isolated real-provider verification state")
    if systems_by_id["SYS-PROV-001"]["external_interaction_state"] != "NETWORK_FREE_ISOLATED":
        fail("SYS-PROV-001 must not inherit the ordinary assistant live-provider smoke")
    for sid in {"SYS-FOUND-001", "SYS-WORK-001", "SYS-FIN-001"}:
        if systems_by_id[sid]["deployment_state"] != "VERIFIED_NOT_DEPLOYED":
            fail(f"{sid}: repository/isolated control must remain VERIFIED_NOT_DEPLOYED")

    supplier_required = {
        "supplier_id", "supplier_name", "service_role", "dependency_scope", "criticality",
        "substitution_difficulty", "data_classes_or_access", "auth_category", "region_or_residency",
        "assurance_state", "approval_state", "fallback_or_exit", "current_risk_state",
        "evidence_refs", "observed_at", "reassessment_trigger",
    }
    for row in supplier_rows:
        sid = row["supplier_id"]
        require_fields(row, supplier_required, sid)
        verify_repo_refs(row["evidence_refs"], sid, "evidence_refs")
        if "CERTIFIED" in row["assurance_state"].upper():
            fail(f"{sid}: supplier certification/assurance claim is not evidenced in GOV-003")
        if sid == "SUP-OPENAI-001" and row["approval_state"] != "DEVELOPMENT_USE_VERIFIED":
            fail("SUP-OPENAI-001 must remain development-use verified, not production-approved")
        if sid == "SUP-SUPABASE-001" and row["approval_state"] != "LIVE_DEPENDENCY":
            fail("SUP-SUPABASE-001 must reflect the observed live dependency")

    risk_required = {
        "risk_id", "title", "system_ids", "risk_statement", "affected_stakeholders",
        "impact_flags", "likelihood", "impact", "risk_rating", "existing_controls",
        "evidence_state", "treatment", "treatment_owner", "residual_rating",
        "risk_acceptance_state", "review_trigger", "evidence_refs", "observed_at",
    }
    for row in risk_rows:
        rid = row["risk_id"]
        require_fields(row, risk_required, rid)
        if row["likelihood"] not in ALLOWED_LIKELIHOOD:
            fail(f"{rid}: invalid likelihood {row['likelihood']!r}")
        if row["impact"] not in ALLOWED_IMPACT:
            fail(f"{rid}: invalid impact {row['impact']!r}")
        if row["risk_rating"] not in ALLOWED_RATING:
            fail(f"{rid}: invalid risk_rating {row['risk_rating']!r}")
        if row["residual_rating"] not in ALLOWED_RATING:
            fail(f"{rid}: invalid residual_rating {row['residual_rating']!r}")
        if row["evidence_state"] not in ALLOWED_EVIDENCE:
            fail(f"{rid}: invalid evidence_state {row['evidence_state']!r}")
        linked_systems = set(split_semicolon(row["system_ids"]))
        unknown_systems = linked_systems - EXPECTED_SYSTEM_IDS
        if unknown_systems:
            fail(f"{rid}: unknown system links {sorted(unknown_systems)}")
        if row["risk_rating"] in {"HIGH", "CRITICAL"} and row["risk_acceptance_state"] != "NOT_ACCEPTED":
            fail(f"{rid}: high/critical risk may not be silently accepted")
        verify_repo_refs(row["evidence_refs"], rid, "evidence_refs")

    risks_by_id = {row["risk_id"]: row for row in risk_rows}
    blocker = risks_by_id["RISK-G003-001"]
    if blocker["risk_rating"] != "CRITICAL" or blocker["residual_rating"] != "HIGH":
        fail("RISK-G003-001 must preserve the live-database autonomy blocker severity")
    if not {"SYS-DATA-001", "SYS-FOUND-001", "SYS-FIN-001"}.issubset(
        set(split_semicolon(blocker["system_ids"]))
    ):
        fail("RISK-G003-001 must link the data, Foundry and FinOps substrates")

    intended_text = INTENDED_USE.read_text(encoding="utf-8")
    for sid in EXPECTED_SYSTEM_IDS:
        if f"`{sid}`" not in intended_text:
            fail(f"intended-use baseline does not mention {sid}")

    print(
        "OK: GOV-003 inventory validated: "
        f"systems={len(system_rows)}, suppliers={len(supplier_rows)}, risks={len(risk_rows)}; "
        "no production/operating-effectiveness promotion detected."
    )
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (AssertionError, csv.Error, OSError, KeyError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        raise SystemExit(1)
