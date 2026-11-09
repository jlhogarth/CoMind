#!/usr/bin/env python3
"""Build a private, read-only FinOps report from a Supabase projection and AED proofs."""
import argparse
import hashlib
import importlib.util
import json
import re
import tempfile
from datetime import datetime
from io import BytesIO
from pathlib import Path
from zipfile import BadZipFile, ZipFile


SHA256 = re.compile(r"[0-9a-f]{64}")
EXECUTION_ID = re.compile(r"[0-9a-f]{24}")
MAX_PROOF_BYTES = 9_000_000
AED_DEPENDENCIES = {
    "aed_work_usage_evidence": "19e5bf1b5f22db90df3de05e4cf9cf5857eef532202df5919950e61286047bf6",
    "aed_transaction_report": "8d13421decf7616211fd6f991f68a80e42f02975aa77bc69aecb33f26e1c8eb9",
    "aed_monitor_store": "d7fe5fb55a511b5b85680baed8322f3c78be3ddbef871f4a6a2fd8fc4651e207",
}
PROJECTION_FIELDS = (
    "execution_id", "lane_id", "workflow_run_url", "source_sha256", "artifact_sha256",
    "first_at", "last_at", "declared_events", "observed_events", "hashed_events",
    "distinct_sequences", "min_sequence", "max_sequence", "providers", "model",
    "input_tokens", "output_tokens", "duration_ms", "priced_events", "receipt_tagged_events",
    "actual_cost_usd", "estimated_cost_usd", "sequence_verified",
)
METERS = {
    "included_allowance_remaining_percent": "allowance_percentage_points",
    "weekly_allowance_remaining_percent": "weekly_percentage_points",
    "purchased_credits_remaining": "purchased_credits",
}


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def instant(value):
    parsed = datetime.fromisoformat(value)
    if parsed.utcoffset() is None:
        raise ValueError("timezone-aware evidence timestamp required")
    return parsed


def load_aed_tools(directory):
    modules = {}
    for name, expected in AED_DEPENDENCIES.items():
        source = directory / (name + ".py")
        raw = source.read_bytes()
        if digest(raw) != expected:
            raise ValueError(f"unexpected AED-007 dependency digest for {name}")
        spec = importlib.util.spec_from_file_location(name, source)
        module = importlib.util.module_from_spec(spec)
        exec(compile(raw, str(source), "exec"), module.__dict__)
        modules[name] = module
    return modules


def proof_members(archive, expected_sha256):
    with archive.open("rb") as source:
        raw = source.read(MAX_PROOF_BYTES + 1)
    if len(raw) > MAX_PROOF_BYTES or digest(raw) != expected_sha256:
        raise ValueError("AED proof archive SHA-256 mismatch or size out of bounds")
    with ZipFile(BytesIO(raw)) as bundle:
        members = bundle.infolist()
        if (len(members) != 6 or len({member.filename for member in members}) != 6
                or sum(member.file_size for member in members) > MAX_PROOF_BYTES
                or any(not re.fullmatch(r"[a-zA-Z0-9_.-]+", member.filename)
                       or member.filename in {".", ".."} for member in members)):
            raise ValueError("invalid AED proof archive members")
        contents = {member.filename: bundle.read(member) for member in members}
    manifest = json.loads(contents.pop("manifest.json"))
    if (manifest.get("schema") != "comind.aed.work-meter-proof.v1"
            or manifest.get("environment") != "CoMind Test"
            or manifest.get("scope") != "shared account; unallocated"
            or manifest.get("files") != {name: digest(raw) for name, raw in contents.items()}):
        raise ValueError("AED proof manifest or member SHA-256 mismatch")
    return manifest, contents


def read_proof(archive, expected_sha256, evidence_source, aed):
    manifest, contents = proof_members(archive, expected_sha256)
    with tempfile.TemporaryDirectory(prefix="finops-aed-") as temporary:
        directory = Path(temporary)
        snapshots, executions, sidecars, reports = [], [], [], []
        for name, raw in contents.items():
            path = directory / name
            path.write_bytes(raw)
            if path.suffix == ".jsonl":
                executions.append(path)
                continue
            value = json.loads(raw)
            if isinstance(value, list):
                reports.append(value)
            elif value.get("schema") == "comind.aed.work-usage-snapshot.v1":
                snapshots.append((instant(value["captured_at"]), path, value))
            elif value.get("schema") == "comind.aed.work-usage-reconciliation.v1":
                sidecars.append(path)
        if (len(executions), len(snapshots), len(sidecars), len(reports)) != (1, 2, 1, 1):
            raise ValueError("incomplete AED execution and observation proof")
        execution_path, = executions
        sidecar, = sidecars
        archived_report, = reports
        (_, before_path, before), (_, after_path, after) = sorted(snapshots, key=lambda row: row[0])
        execution_id, events, source_sha256 = aed["aed_monitor_store"].validated(execution_path)
        if (manifest.get("execution_id") != execution_id
                or any(type(event["sequence"]) is not int for event in events)
                or [event["elapsed_ms"] for event in events] != sorted(event["elapsed_ms"] for event in events)
                or [instant(event["at"]) for event in events] != sorted(instant(event["at"]) for event in events)):
            raise ValueError("invalid AED execution identity or event order")
        rebuilt = aed["aed_work_usage_evidence"].reconcile(
            execution_path, before_path, after_path, directory / "verified-reconciliation.json")
        if rebuilt != json.loads(sidecar.read_bytes()):
            raise ValueError("AED observation sidecar disagrees with verified reconciliation")
        result, = aed["aed_transaction_report"].report([execution_path], usage_evidence=[sidecar])
        if [{k: v for k, v in row.items() if k != "file"} for row in archived_report] != [
                {k: v for k, v in result.items() if k != "file"}]:
            raise ValueError("archived AED report disagrees with verified evidence")

    if not any(before[key] is not None and after[key] is not None for key in METERS):
        raise ValueError("AED observation has no comparable account meter")
    meters = {}
    for key, label in METERS.items():
        first, last = before[key], after[key]
        delta = rebuilt[label + "_observed"]
        if first is None or last is None:
            status = "unknown"
        elif last > first:
            status = "balance_increased_or_reset"
        else:
            status = "observed"
        meters[label] = {"before": first, "after": last, "unattributed_change": delta, "status": status}
    return {
        "execution_id": execution_id, "lane_id": "AED-007", "workflow_run_url": None,
        "first_at": events[0]["at"], "last_at": events[-1]["at"],
        "declared_events": len(events), "observed_events": len(events),
        "sequence_verified": True, "duration_ms": result["elapsed_ms"],
        "providers": sorted({event["provider"] for event in events
                             if event.get("provider") and event["provider"] != "local"}) or None,
        "model": None, "input_tokens": result["input_tokens"], "output_tokens": result["output_tokens"],
        "source_sha256": source_sha256, "artifact_sha256": None,
        "actual_cost_usd": None, "estimated_cost_usd": None,
        "persisted_in_supabase": False, "verification": "verified_archive",
        "flowops": {"process_output_bytes": result["process_output_bytes"],
                    "flow_step_count": result["flow_step_count"], "process_exit": result["process_exit"],
                    "flow_input_bytes": result["flow_input_bytes"] if result["flow_step_count"] else None,
                    "flow_output_bytes": result["flow_output_bytes"] if result["flow_step_count"] else None},
        "work_account_meter": {
            "status": "observed", "attribution": "shared_account_unallocated",
            "source": rebuilt["source"], "source_reference": evidence_source,
            "archive_sha256": expected_sha256, "sidecar_sha256": digest(contents[sidecar.name]),
            "before_at": rebuilt["before_at"], "after_at": rebuilt["after_at"],
            "before_snapshot_sha256": rebuilt["before_snapshot_sha256"],
            "after_snapshot_sha256": rebuilt["after_snapshot_sha256"],
            "meters": meters, "process_attributed_work_usage": None, "actual_work_charge_usd": None,
            "limits": rebuilt["limits"],
        },
    }


def private_report(projection, proofs):
    if not isinstance(projection, list):
        raise ValueError("Supabase projection must be a JSON array")
    rows, persisted_sources = {}, {}
    for original in projection:
        row = {key: original[key] for key in PROJECTION_FIELDS}
        identity = row["execution_id"]
        if not EXECUTION_ID.fullmatch(identity) or identity in rows:
            raise ValueError("invalid or duplicate Supabase execution identity")
        if (not SHA256.fullmatch(row["source_sha256"] or "")
                or (row["artifact_sha256"] is not None and not SHA256.fullmatch(row["artifact_sha256"]))):
            raise ValueError("invalid Supabase source or artifact hash")
        if row["source_sha256"] in persisted_sources:
            raise ValueError("duplicate Supabase execution source hash")
        persisted_sources[row["source_sha256"]] = identity
        if row["actual_cost_usd"] is not None or row["estimated_cost_usd"] is not None:
            raise ValueError("AED projection cannot verify actual or estimated monetary cost")
        count = row["declared_events"]
        complete = (row["sequence_verified"] is True and count > 0
                    and row["observed_events"] == row["hashed_events"] == row["distinct_sequences"] == count
                    and row["min_sequence"] == 1 and row["max_sequence"] == count)
        if not complete:
            # Incomplete or duplicated event sequences cannot support execution totals.
            row.update(input_tokens=None, output_tokens=None, duration_ms=None)
        rows[identity] = {**row, "persisted_in_supabase": True,
                          "verification": "supabase_sequence_and_hash_coverage" if complete else "incomplete",
                          "work_account_meter": {"status": "not_observed"}, "flowops": None}

    meter_windows, source_hashes, snapshot_hashes = [], set(), set()
    for proof in proofs:
        identity = proof["execution_id"]
        meter = proof["work_account_meter"]
        start, end = instant(meter["before_at"]), instant(meter["after_at"])
        snapshots = {meter["before_snapshot_sha256"], meter["after_snapshot_sha256"]}
        if (proof["source_sha256"] in source_hashes or snapshots & snapshot_hashes
                or any(start < other_end and other_start < end for other_start, other_end in meter_windows)):
            raise ValueError("duplicate or overlapping shared-account reconciliation")
        source_hashes.add(proof["source_sha256"])
        snapshot_hashes.update(snapshots)
        meter_windows.append((start, end))
        stored_identity = persisted_sources.get(proof["source_sha256"])
        if stored_identity is not None and stored_identity != identity:
            raise ValueError("AED proof digest belongs to a different persisted execution")
        persisted = rows.get(identity)
        if persisted is None:
            rows[identity] = proof
            continue
        if (persisted["verification"] != "supabase_sequence_and_hash_coverage"
                or persisted["source_sha256"] != proof["source_sha256"]
                or persisted["declared_events"] != proof["declared_events"]
                or any(instant(persisted[key]) != instant(proof[key]) for key in ("first_at", "last_at"))):
            raise ValueError("AED proof conflicts with persisted execution evidence")
        persisted.update(work_account_meter=meter, flowops=proof["flowops"],
                         verification="verified_archive_and_supabase")

    for row in rows.values():
        row["classification"] = {
            "execution_evidence": "verified" if row["verification"] != "incomplete" else "unknown",
            "actual_cost": "verified" if row["actual_cost_usd"] is not None else "unknown",
            "estimated_cost": "estimated" if row["estimated_cost_usd"] is not None else "unknown",
            "work_account_meter": "observed" if row["work_account_meter"]["status"] == "observed" else "unknown",
        }
    return {"schema": "comind.finops.aed-reconciliation.v1",
            "executions": [rows[key] for key in sorted(rows)]}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--projection-json", type=Path, required=True)
    parser.add_argument("--aed-tools", type=Path)
    parser.add_argument("--proof", nargs=3, metavar=("ZIP", "EXPECTED_SHA256", "PRIVATE_SOURCE"),
                        action="append", default=[])
    args = parser.parse_args()
    if args.proof and not args.aed_tools:
        parser.error("--aed-tools is required when supplying AED proofs")
    try:
        aed = load_aed_tools(args.aed_tools) if args.proof else {}
        projection = json.loads(args.projection_json.read_bytes())
        proofs = [read_proof(Path(path), expected, reference, aed) for path, expected, reference in args.proof]
        print(json.dumps(private_report(projection, proofs), indent=2, sort_keys=True, allow_nan=False))
    except (OSError, BadZipFile, ValueError, TypeError, KeyError, AttributeError) as error:
        parser.error(str(error))


if __name__ == "__main__":
    main()
