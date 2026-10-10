#!/usr/bin/env python3
"""Validate GOV-002 provisional AIMS crosswalk without network access."""

from __future__ import annotations

import csv
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "docs" / "governance" / "iso" / "aims-provisional-crosswalk.csv"
SOA = ROOT / "docs" / "governance" / "iso" / "AIMS-STATEMENT-OF-APPLICABILITY-PROVISIONAL.md"

EXPECTED_IDS = {
    "A.2.2", "A.2.3", "A.2.4",
    "A.3.2", "A.3.3",
    "A.4.2", "A.4.3", "A.4.4", "A.4.5", "A.4.6",
    "A.5.2", "A.5.3", "A.5.4", "A.5.5",
    "A.6.1.2", "A.6.1.3", "A.6.2.2", "A.6.2.3", "A.6.2.4",
    "A.6.2.5", "A.6.2.6", "A.6.2.7", "A.6.2.8",
    "A.7.2", "A.7.3", "A.7.4", "A.7.5", "A.7.6",
    "A.8.2", "A.8.3", "A.8.4", "A.8.5",
    "A.9.2", "A.9.3", "A.9.4",
    "A.10.2", "A.10.3", "A.10.4",
}

REQUIRED_FIELDS = {
    "control_id", "domain", "control_objective", "applicability", "rationale",
    "owner", "engineering_tier", "nist_ai_rmf", "eu_ai_act", "iso_27001",
    "evidence_state", "implementation_refs", "evidence_refs",
    "source_classification", "source_repo", "source_commit",
    "normative_verification",
}
ALLOWED_APPLICABILITY = {"APPLICABLE", "NOT_APPLICABLE", "UNDETERMINED"}
ALLOWED_TIERS = {"T0", "T1", "T2", "T3"}
ALLOWED_EVIDENCE = {
    "PROPOSED", "REPOSITORY_IMPLEMENTED", "ISOLATED_VERIFIED",
    "VERIFIED_NOT_DEPLOYED", "DEPLOYED_UNVERIFIED", "OPERATING_EVIDENCE",
    "INDEPENDENTLY_ASSESSED", "GAP",
}
EXPECTED_REPO = "Ankit-Uniyal/iso-42001-ai-governance-toolkit"
EXPECTED_COMMIT = "803b62da4c66f6b6ab601c87cb298597a497eebd"
EXPECTED_NORMATIVE = "PENDING_LICENSED_SOURCE"
EXPECTED_SOURCE_CLASS = "SECONDARY_SOURCE_UNVERIFIED"


def fail(message: str) -> None:
    raise AssertionError(message)


def normalize(value: str | None) -> str:
    if value is None:
        return ""
    return value.strip().lstrip("\ufeff")


def split_refs(raw: str) -> list[str]:
    return [item.strip() for item in raw.split(";") if item.strip()]


def parse_soa() -> dict[str, tuple[str, str, str, str]]:
    rows: dict[str, tuple[str, str, str, str]] = {}
    for line in SOA.read_text(encoding="utf-8").splitlines():
        if not line.startswith("| `A."):
            continue
        cells = [cell.strip() for cell in line.strip().strip("|").split("|")]
        if len(cells) != 5:
            fail(f"SoA row has unexpected column count: {line}")
        cid = cells[0].strip("`")
        rows[cid] = (cells[1], cells[2], cells[3], cells[4])
    return rows


def main() -> int:
    with DATA.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        fields = {normalize(field) for field in (reader.fieldnames or [])}
        missing_columns = REQUIRED_FIELDS - fields
        if missing_columns:
            fail(f"missing CSV columns: {sorted(missing_columns)}")
        raw_rows = list(reader)

    rows = [
        {normalize(key): normalize(value) for key, value in raw.items() if key is not None}
        for raw in raw_rows
    ]

    if len(rows) != 38:
        fail(f"expected 38 control rows, found {len(rows)}")

    ids = [row["control_id"] for row in rows]
    if len(ids) != len(set(ids)):
        fail("duplicate control_id found")
    if set(ids) != EXPECTED_IDS:
        fail(
            "control set mismatch; "
            f"missing={sorted(EXPECTED_IDS - set(ids))}, "
            f"extra={sorted(set(ids) - EXPECTED_IDS)}"
        )

    for row in rows:
        cid = row["control_id"]
        for field in REQUIRED_FIELDS - {"iso_27001"}:
            if not row[field]:
                fail(f"{cid}: blank required field {field}")
        if row["applicability"] not in ALLOWED_APPLICABILITY:
            fail(f"{cid}: invalid applicability {row['applicability']!r}")
        if row["engineering_tier"] not in ALLOWED_TIERS:
            fail(f"{cid}: invalid tier {row['engineering_tier']!r}")
        if row["evidence_state"] not in ALLOWED_EVIDENCE:
            fail(f"{cid}: invalid evidence state {row['evidence_state']!r}")
        if row["source_classification"] != EXPECTED_SOURCE_CLASS:
            fail(
                f"{cid}: source classification mismatch: "
                f"observed={row['source_classification']!r} expected={EXPECTED_SOURCE_CLASS!r}"
            )
        if row["source_repo"] != EXPECTED_REPO:
            fail(
                f"{cid}: source repository mismatch: "
                f"observed={row['source_repo']!r} expected={EXPECTED_REPO!r}"
            )
        if row["source_commit"] != EXPECTED_COMMIT:
            fail(
                f"{cid}: source commit mismatch: "
                f"observed={row['source_commit']!r} expected={EXPECTED_COMMIT!r}"
            )
        if row["normative_verification"] != EXPECTED_NORMATIVE:
            fail(
                f"{cid}: normative verification mismatch: "
                f"observed={row['normative_verification']!r} expected={EXPECTED_NORMATIVE!r}"
            )
        for field in ("implementation_refs", "evidence_refs"):
            for ref in split_refs(row[field]):
                if not (ROOT / ref).exists():
                    fail(f"{cid}: cited {field} path does not exist: {ref}")

    soa_rows = parse_soa()
    if set(soa_rows) != EXPECTED_IDS:
        fail("human-readable SoA control set does not match machine-readable source")
    for row in rows:
        cid = row["control_id"]
        objective, applicability, tier, evidence = soa_rows[cid]
        expected = (
            row["control_objective"], row["applicability"],
            row["engineering_tier"], row["evidence_state"],
        )
        if (objective, applicability, tier, evidence) != expected:
            fail(f"{cid}: human-readable SoA differs from CSV source")

    undetermined = [r["control_id"] for r in rows if r["applicability"] == "UNDETERMINED"]
    print(
        f"OK: {len(rows)} provisional controls validated; "
        f"source={EXPECTED_REPO}@{EXPECTED_COMMIT[:12]}; "
        f"undetermined={undetermined}; normative={EXPECTED_NORMATIVE}; "
        "SoA and evidence paths verified."
    )
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (AssertionError, csv.Error, OSError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        raise SystemExit(1)
