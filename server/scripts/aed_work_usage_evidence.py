#!/usr/bin/env python3
"""Capture and reconcile manually observed Work account readings for one AED run."""
import argparse
import hashlib
import json
import math
from datetime import datetime, timezone
from pathlib import Path


def timestamp(value):
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        raise ValueError("timestamp must include a timezone")
    return parsed.astimezone(timezone.utc)


def number(value, maximum=None):
    parsed = float(value)
    if not math.isfinite(parsed) or parsed < 0 or (maximum is not None and parsed > maximum):
        raise ValueError("invalid account meter value")
    return parsed


def save_exclusive(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("x", encoding="utf-8") as destination:
        json.dump(value, destination, sort_keys=True, indent=2)
        destination.write("\n")


def capture(path, captured_at, allowance=None, purchased=None, evidence_sha256=None):
    at = timestamp(captured_at)
    if at > datetime.now(timezone.utc):
        raise ValueError("future meter reading")
    if allowance is None and purchased is None:
        raise ValueError("at least one account meter value is required")
    if evidence_sha256 is not None and (len(evidence_sha256) != 64 or
                                        any(c not in "0123456789abcdef" for c in evidence_sha256)):
        raise ValueError("invalid evidence SHA-256")
    row = {"schema": "comind.aed.work-usage-snapshot.v1", "source": "openai_usage_ui_manual",
           "captured_at": at.isoformat(), "capture_method": "operator_transcription",
           "evidence_sha256": evidence_sha256,
           "included_allowance_remaining_percent": number(allowance, 100) if allowance is not None else None,
           "purchased_credits_remaining": number(purchased) if purchased is not None else None}
    save_exclusive(path, row)
    return row


def load_snapshot(path):
    raw = path.read_bytes()
    if not raw or len(raw) > 4096:
        raise ValueError("snapshot size out of bounds")
    row = json.loads(raw)
    expected = {"schema", "source", "captured_at", "capture_method", "evidence_sha256",
                "included_allowance_remaining_percent", "purchased_credits_remaining"}
    if set(row) != expected or row["schema"] != "comind.aed.work-usage-snapshot.v1" or \
            row["source"] != "openai_usage_ui_manual" or row["capture_method"] != "operator_transcription":
        raise ValueError("invalid snapshot contract")
    timestamp(row["captured_at"])
    if row["included_allowance_remaining_percent"] is None and row["purchased_credits_remaining"] is None:
        raise ValueError("empty snapshot")
    for key, maximum in (("included_allowance_remaining_percent", 100), ("purchased_credits_remaining", None)):
        if row[key] is not None and (type(row[key]) not in (int, float) or
                                     number(row[key], maximum) != row[key]):
            raise ValueError("invalid meter value")
    digest = row["evidence_sha256"]
    if digest is not None and (not isinstance(digest, str) or len(digest) != 64 or
                               any(c not in "0123456789abcdef" for c in digest)):
        raise ValueError("invalid snapshot evidence hash")
    return row, hashlib.sha256(raw).hexdigest()


def reconcile(execution_path, before_path, after_path, output_path):
    raw = execution_path.read_bytes()
    if not raw or len(raw) > 8_000_000:
        raise ValueError("execution evidence size out of bounds")
    rows = [json.loads(line) for line in raw.decode("utf-8").splitlines()]
    if not rows or rows[0].get("kind") != "preflight" or rows[-1].get("kind") not in ("exited", "timeout"):
        raise ValueError("complete AED execution evidence required")
    execution_id = rows[0]["execution_id"]
    if len(execution_id) != 24 or any(c not in "0123456789abcdef" for c in execution_id):
        raise ValueError("invalid execution identity")
    if any(row.get("execution_id") != execution_id or row.get("sequence") != i
           for i, row in enumerate(rows, 1)):
        raise ValueError("inconsistent execution evidence")
    before, before_hash = load_snapshot(before_path)
    after, after_hash = load_snapshot(after_path)
    before_at, after_at = timestamp(before["captured_at"]), timestamp(after["captured_at"])
    if before_at > timestamp(rows[0]["at"]) or after_at < timestamp(rows[-1]["at"]) or after_at <= before_at:
        raise ValueError("meter readings do not bracket execution")
    deltas = {}
    for key, label in (("included_allowance_remaining_percent", "allowance_percentage_points"),
                       ("purchased_credits_remaining", "purchased_credits")):
        first, last = before[key], after[key]
        deltas[label] = round(first - last, 6) if first is not None and last is not None and first >= last else None
    result = {"schema": "comind.aed.work-usage-reconciliation.v1", "execution_id": execution_id,
              "execution_sha256": hashlib.sha256(raw).hexdigest(), "before_snapshot_sha256": before_hash,
              "after_snapshot_sha256": after_hash, "before_at": before["captured_at"],
              "after_at": after["captured_at"], "source": "openai_usage_ui_manual",
              "account_scope": "shared", "attribution": "unallocated",
              "allowance_percentage_points_observed": deltas["allowance_percentage_points"],
              "purchased_credits_observed": deltas["purchased_credits"],
              "actual_work_charge_usd": None,
              "limits": "Display refresh and other account activity can affect the observed difference."}
    save_exclusive(output_path, result)
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    actions = parser.add_subparsers(dest="action", required=True)
    snap = actions.add_parser("capture")
    snap.add_argument("--out", type=Path, required=True)
    snap.add_argument("--captured-at", required=True, help="Timezone-aware time when the UI value was seen")
    snap.add_argument("--allowance-remaining-percent")
    snap.add_argument("--purchased-credits-remaining")
    snap.add_argument("--evidence-sha256", help="Optional SHA-256 of a private screenshot")
    pair = actions.add_parser("reconcile")
    pair.add_argument("--execution", type=Path, required=True)
    pair.add_argument("--before", type=Path, required=True)
    pair.add_argument("--after", type=Path, required=True)
    pair.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    try:
        result = (capture(args.out, args.captured_at, args.allowance_remaining_percent,
                          args.purchased_credits_remaining, args.evidence_sha256)
                  if args.action == "capture" else
                  reconcile(args.execution, args.before, args.after, args.out))
    except (OSError, ValueError, TypeError, KeyError, json.JSONDecodeError) as error:
        parser.error(str(error))
    print(json.dumps(result, sort_keys=True))


if __name__ == "__main__":
    main()
