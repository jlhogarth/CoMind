#!/usr/bin/env python3
"""Query retained AED transaction JSONL files without a database or provider call."""
import argparse
import hashlib
import json
import math
from collections import Counter
from pathlib import Path


def report(paths, case=None, usage_evidence=()):
    reconciliations = {}
    for evidence_path in usage_evidence:
        raw = Path(evidence_path).read_bytes()
        if not raw or len(raw) > 4096:
            raise ValueError("usage reconciliation size out of bounds")
        row = json.loads(raw)
        required = {"schema", "execution_id", "execution_sha256", "before_snapshot_sha256",
                    "after_snapshot_sha256", "before_at", "after_at", "source", "account_scope",
                    "attribution", "allowance_percentage_points_observed", "weekly_percentage_points_observed",
                    "purchased_credits_observed",
                    "actual_work_charge_usd", "limits"}
        if set(row) != required or row["schema"] != "comind.aed.work-usage-reconciliation.v1" or \
                row["source"] not in ("openai_usage_ui_manual", "openai_usage_ui_browser") or \
                row["attribution"] != "unallocated" or \
                row["account_scope"] != "shared" or row["actual_work_charge_usd"] is not None:
            raise ValueError("invalid usage reconciliation")
        for key in ("execution_sha256", "before_snapshot_sha256", "after_snapshot_sha256"):
            digest = row[key]
            if not isinstance(digest, str) or len(digest) != 64 or any(c not in "0123456789abcdef" for c in digest):
                raise ValueError("invalid reconciliation hash")
        for key in ("allowance_percentage_points_observed", "weekly_percentage_points_observed",
                    "purchased_credits_observed"):
            value = row[key]
            if value is not None and (type(value) not in (int, float) or not math.isfinite(value) or value < 0):
                raise ValueError("invalid reconciliation meter")
        identity = row.get("execution_id")
        if identity in reconciliations:
            raise ValueError("duplicate usage reconciliation")
        reconciliations[identity] = row
    result = []
    used_reconciliations = set()
    for path in paths:
        raw = Path(path).read_bytes()
        rows = [json.loads(line) for line in raw.decode("utf-8").splitlines()]
        if not rows or any(row.get("schema") != "comind.aed.transaction.v1" for row in rows):
            raise ValueError(f"invalid AED transaction file: {path}")
        external = reconciliations.get(rows[0]["execution_id"])
        if external and external.get("execution_sha256") != hashlib.sha256(raw).hexdigest():
            raise ValueError("usage reconciliation does not match execution bytes")
        if external:
            used_reconciliations.add(rows[0]["execution_id"])
        selected = [row for row in rows if case is None or row.get("case") == case]
        events = [row for row in selected if row["kind"] == "aed_event"]
        charges = [row["cost_usd"] for row in events if row.get("cost_usd") is not None]
        usage = next((row for row in reversed(rows) if row["kind"] == "usage_reconciliation"), None)
        if usage and external:
            raise ValueError("duplicate inline and separate account meter evidence")
        terminal = rows[-1]
        steps = [row for row in events if row.get("phase") in ("end", "error")]
        token_steps = [row for row in steps if "input_tokens" in row or "output_tokens" in row]
        result.append({"file": str(path), "execution_id": rows[0]["execution_id"],
                       "case_filter": case, "event_count": len(events),
                       "states": dict(Counter(row.get("state") for row in events)),
                       "cases": sorted({row["case"] for row in events if row.get("case")}),
                       "outcomes": dict(Counter(row.get("outcome") for row in events if row.get("outcome"))),
                       "wake_sources": dict(Counter(row.get("wake_source") for row in events if row.get("wake_source"))),
                       "elapsed_ms": rows[-1]["elapsed_ms"],
                       "process_output_bytes": terminal.get("totals", {}).get("output_bytes"),
                       "flow_step_count": len(steps),
                       "flow_input_bytes": terminal.get("totals", {}).get("flow_input_bytes"),
                       "flow_output_bytes": terminal.get("totals", {}).get("flow_output_bytes"),
                       "token_reported_step_count": len(token_steps),
                       "input_tokens": sum(row.get("input_tokens", 0) for row in token_steps) if token_steps else None,
                       "output_tokens": sum(row.get("output_tokens", 0) for row in token_steps) if token_steps else None,
                       "process_exit": next((row["returncode"] for row in reversed(rows)
                                             if row["kind"] == "exited"), None),
                       "reported_cost_usd": sum(charges) if charges else None,
                       "reported_charge_event_count": len(charges),
                       "work_account_meter": ({key: value for key, value in usage.items()
                                               if key in {"source", "scope", "attribution", "before_at", "after_at",
                                                          "included_allowance_observed_consumed_percent",
                                                          "purchased_credits_observed_consumed"}}
                                              if usage else external),
                       "chatgpt_work_cost": "unknown"})
    if used_reconciliations != set(reconciliations):
        raise ValueError("usage reconciliation has no matching execution")
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("files", nargs="+", type=Path)
    parser.add_argument("--case")
    parser.add_argument("--usage-evidence", action="append", default=[], type=Path)
    args = parser.parse_args()
    print(json.dumps(report(args.files, args.case, args.usage_evidence), indent=2, sort_keys=True))
