#!/usr/bin/env python3
"""Ingest or query AED-007 JSONL through a direct PostgreSQL connection."""
import argparse
import hashlib
import json
import math
import os
import re
import subprocess
import sys
from datetime import datetime
from pathlib import Path
from urllib.parse import urlparse

ID = re.compile(r"^[0-9a-f]{24}$")
HASH = re.compile(r"^[0-9a-f]{64}$")


def literal(value):
    if value is None:
        return "NULL"
    value = str(value)
    if "\x00" in value:
        raise ValueError("NUL byte is forbidden")
    return "'" + value.replace("'", "''") + "'"


def sql_json(value):
    return literal(json.dumps(value, sort_keys=True, separators=(",", ":"))) + "::jsonb"


def validated(path):
    raw = path.read_bytes()
    if not raw or len(raw) > 8_000_000:
        raise ValueError("source must be 1..8000000 bytes")
    rows = [json.loads(line) for line in raw.decode("utf-8").splitlines()]
    execution = rows[0].get("execution_id")
    if not isinstance(execution, str) or not ID.fullmatch(execution):
        raise ValueError("invalid execution_id")
    for index, row in enumerate(rows, 1):
        if row.get("schema") != "comind.aed.transaction.v1" or row.get("execution_id") != execution:
            raise ValueError("mixed execution or invalid schema")
        if row.get("sequence") != index or not isinstance(row.get("elapsed_ms"), int) or row["elapsed_ms"] < 0:
            raise ValueError("noncontiguous sequence or invalid elapsed time")
        if datetime.fromisoformat(row["at"].replace("Z", "+00:00")).tzinfo is None:
            raise ValueError("event timestamp requires timezone")
        if not isinstance(row.get("kind"), str):
            raise ValueError("event kind required")
        cost = row.get("cost_usd")
        if cost is not None and (isinstance(cost, bool) or not isinstance(cost, (int, float))
                                 or not math.isfinite(cost) or cost < 0):
            raise ValueError("invalid cost_usd")
    if rows[-1]["kind"] not in {"exited", "timeout"}:
        raise ValueError("terminal event required before archival")
    return execution, rows, hashlib.sha256(raw).hexdigest()


def psql(sql, database_url):
    completed = subprocess.run(["psql", database_url, "-X", "-v", "ON_ERROR_STOP=1", "-At"],
                               input=sql, text=True, capture_output=True, check=False)
    if completed.returncode:
        raise RuntimeError("PostgreSQL operation failed: " + completed.stderr[-1500:])
    return completed.stdout.strip()


def ingest(path, database_url, lane=None, run_url=None, artifact_hash=None):
    execution, rows, source_hash = validated(path)
    if artifact_hash is not None and not HASH.fullmatch(artifact_hash):
        raise ValueError("invalid artifact SHA-256")
    sql = ["BEGIN;", "SET LOCAL standard_conforming_strings = on;",
           "INSERT INTO comind_pm.pm_aed_monitor_execution "
           "(execution_id,lane_id,workflow_run_url,first_at,last_at,event_count,source_sha256,artifact_sha256) VALUES "
           f"({literal(execution)},{literal(lane)},{literal(run_url)},{literal(rows[0]['at'])}::timestamptz,"
           f"{literal(rows[-1]['at'])}::timestamptz,{len(rows)},{literal(source_hash)},{literal(artifact_hash)}) "
           "ON CONFLICT (execution_id) DO NOTHING;"]
    sql.append(f"DO $$ BEGIN IF EXISTS (SELECT 1 FROM comind_pm.pm_aed_monitor_execution WHERE execution_id={literal(execution)} "
               f"AND (source_sha256 <> {literal(source_hash)} OR event_count <> {len(rows)})) "
               "THEN RAISE EXCEPTION 'conflicting AED execution replay'; END IF; END $$;")
    for row in rows:
        digest = hashlib.sha256(json.dumps(row, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
        fields = [literal(execution), str(row["sequence"]), literal(row["at"]) + "::timestamptz",
                  str(row["elapsed_ms"]), literal(row["kind"]), literal(row.get("case")),
                  literal(row.get("state")), literal(row.get("outcome")), literal(row.get("wake_source")),
                  literal(row.get("provider")), "NULL" if row.get("cost_usd") is None else str(row["cost_usd"]),
                  sql_json(row), literal(digest)]
        sql.append("INSERT INTO comind_pm.pm_aed_monitor_event "
                   "(execution_id,sequence,event_at,elapsed_ms,kind,case_id,state,outcome,wake_source,provider,actual_cost_usd,payload,payload_sha256) "
                   "VALUES (" + ",".join(fields) + ") ON CONFLICT (execution_id,sequence) DO NOTHING;")
        sql.append(f"DO $$ BEGIN IF EXISTS (SELECT 1 FROM comind_pm.pm_aed_monitor_event "
                   f"WHERE execution_id={literal(execution)} AND sequence={row['sequence']} "
                   f"AND payload_sha256 <> {literal(digest)}) THEN "
                   "RAISE EXCEPTION 'conflicting AED event replay'; END IF; END $$;")
    sql.append("COMMIT;")
    psql("\n".join(sql), database_url)
    return {"execution_id": execution, "event_count": len(rows), "source_sha256": source_hash}


def readback(execution, database_url):
    if not ID.fullmatch(execution):
        raise ValueError("invalid execution_id")
    query = ("SELECT json_build_object('execution_id',x.execution_id,'lane_id',x.lane_id,"
             "'event_count',x.event_count,'source_sha256',x.source_sha256,"
             "'stored_events',(SELECT count(*) FROM comind_pm.pm_aed_monitor_event e WHERE e.execution_id=x.execution_id),"
             "'states',(SELECT coalesce(json_agg(e.state ORDER BY e.sequence) FILTER (WHERE e.state IS NOT NULL),'[]'::json) "
             "FROM comind_pm.pm_aed_monitor_event e WHERE e.execution_id=x.execution_id)) "
             "FROM comind_pm.pm_aed_monitor_execution x WHERE x.execution_id=" + literal(execution) + ";")
    result = psql(query, database_url)
    if not result:
        raise ValueError("execution not found")
    return json.loads(result)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("action", choices=["ingest", "readback"])
    parser.add_argument("value", help="JSONL path for ingest; execution_id for readback")
    parser.add_argument("--lane")
    parser.add_argument("--run-url")
    parser.add_argument("--artifact-sha256")
    args = parser.parse_args()
    database_url = os.environ.get("DATABASE_URL")
    if not database_url or urlparse(database_url).scheme not in {"postgres", "postgresql"}:
        parser.error("direct DATABASE_URL is required")
    result = (ingest(Path(args.value), database_url, args.lane, args.run_url, args.artifact_sha256)
              if args.action == "ingest" else readback(args.value, database_url))
    print(json.dumps(result, sort_keys=True))


if __name__ == "__main__":
    try:
        main()
    except (ValueError, RuntimeError) as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
