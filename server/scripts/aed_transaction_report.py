#!/usr/bin/env python3
"""Query retained AED transaction JSONL files without a database or provider call."""
import argparse
import json
from collections import Counter
from pathlib import Path


def report(paths, case=None):
    result = []
    for path in paths:
        rows = [json.loads(line) for line in Path(path).read_text(encoding="utf-8").splitlines()]
        if not rows or any(row.get("schema") != "comind.aed.transaction.v1" for row in rows):
            raise ValueError(f"invalid AED transaction file: {path}")
        selected = [row for row in rows if case is None or row.get("case") == case]
        events = [row for row in selected if row["kind"] == "aed_event"]
        result.append({"file": str(path), "execution_id": rows[0]["execution_id"],
                       "case_filter": case, "event_count": len(events),
                       "states": dict(Counter(row.get("state") for row in events)),
                       "cases": sorted({row["case"] for row in events if row.get("case")}),
                       "outcomes": dict(Counter(row.get("outcome") for row in events if row.get("outcome"))),
                       "wake_sources": dict(Counter(row.get("wake_source") for row in events if row.get("wake_source"))),
                       "elapsed_ms": rows[-1]["elapsed_ms"],
                       "process_exit": next((row["returncode"] for row in reversed(rows)
                                             if row["kind"] == "exited"), None),
                       "reported_cost_usd": sum(row.get("cost_usd") or 0 for row in events),
                       "chatgpt_work_cost": "unknown"})
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("files", nargs="+", type=Path)
    parser.add_argument("--case")
    args = parser.parse_args()
    print(json.dumps(report(args.files, args.case), indent=2, sort_keys=True))
