#!/usr/bin/env python3
"""Reconcile observed ChatGPT Usage readings with one AED transaction execution.

The observations are manually transcribed from the signed-in Usage UI. This tool
never treats account percentage points as credits or inferred reasoning tokens.
"""
import argparse
import json
import math
from datetime import datetime
from pathlib import Path


METRICS = ("five_hour_remaining_pct", "weekly_remaining_pct", "purchased_credits_remaining")


def _timestamp(value):
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None or parsed.utcoffset() is None:
        raise ValueError("observed_at must include a timezone")
    return parsed


def _number(value, name, maximum=None):
    if type(value) not in (int, float) or not math.isfinite(value) or value < 0:
        raise ValueError(f"{name} must be finite and nonnegative")
    if maximum is not None and value > maximum:
        raise ValueError(f"{name} exceeds {maximum}")
    return value


def _reading(value):
    if not isinstance(value, dict):
        raise ValueError("reading must be an object")
    allowed = set(METRICS) | {"observed_at", "source", "evidence_sha256"}
    if set(value) - allowed or not all(k in value for k in (*METRICS, "observed_at", "source")):
        raise ValueError("reading has missing or unknown fields")
    if value["source"] != "chatgpt_settings_usage_ui":
        raise ValueError("only signed-in Usage UI observations are supported")
    _timestamp(value["observed_at"])
    if "evidence_sha256" in value and (
        not isinstance(value["evidence_sha256"], str)
        or len(value["evidence_sha256"]) != 64
        or any(c not in "0123456789abcdef" for c in value["evidence_sha256"])
    ):
        raise ValueError("invalid evidence SHA-256")
    for key in METRICS:
        _number(value[key], key, 100 if key.endswith("_pct") else None)
    return value


def reconcile(transaction_path, observations_path):
    raw = Path(transaction_path).read_bytes()
    rows = [json.loads(line) for line in raw.decode("utf-8").splitlines()]
    if not rows or rows[0].get("kind") != "preflight":
        raise ValueError("invalid AED transaction source")
    execution = rows[0].get("execution_id")
    if not execution or any(row.get("execution_id") != execution for row in rows):
        raise ValueError("mixed execution IDs")
    if rows[-1].get("kind") not in ("exited", "timeout"):
        raise ValueError("AED transaction is not terminal")
    data = json.loads(Path(observations_path).read_text(encoding="utf-8"))
    if set(data) != {"execution_id", "before", "after", "concurrent_activity", "reset_occurred"}:
        raise ValueError("observation envelope has missing or unknown fields")
    if data["execution_id"] != execution:
        raise ValueError("observation execution ID mismatch")
    before, after = _reading(data["before"]), _reading(data["after"])
    if type(data["concurrent_activity"]) is not bool or type(data["reset_occurred"]) is not bool:
        raise ValueError("activity and reset flags must be booleans")
    started = _timestamp(rows[0]["at"])
    ended = _timestamp(rows[-1]["at"])
    if not _timestamp(before["observed_at"]) <= started <= ended <= _timestamp(after["observed_at"]):
        raise ValueError("readings must bracket the execution")
    deltas = {}
    for key in METRICS:
        value = round(before[key] - after[key], 6)
        deltas[key.replace("_remaining", "_used")] = value
    status = "observed_window"
    if data["reset_occurred"] or any(value < 0 for value in deltas.values()):
        status = "not_reconcilable_reset_or_balance_increase"
    elif data["concurrent_activity"]:
        status = "shared_window_unattributed"
    return {
        "execution_id": execution,
        "status": status,
        "before_observed_at": before["observed_at"],
        "after_observed_at": after["observed_at"],
        "deltas": deltas,
        "attribution": "isolated_window_candidate" if status == "observed_window" else "unattributed",
        "reasoning_tokens": None,
        "provider_receipt": False,
        "note": "Percentages are percentage points, not credits. Purchased credits are separate from included allowance.",
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("transaction", type=Path)
    parser.add_argument("observations", type=Path)
    args = parser.parse_args()
    print(json.dumps(reconcile(args.transaction, args.observations), indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
