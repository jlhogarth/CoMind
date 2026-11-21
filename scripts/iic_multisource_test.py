#!/usr/bin/env python3
"""IIC-009 bounded two-source Test collector and IIC-008 graph runner.

OFF by default. No hosted daemon, source grants, DB mutations, or Production
authority. Injected reader contracts support deterministic tests.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import signal
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.request import Request, urlopen

from integrity_evidence import from_github_run, from_runbook_lane
from integrity_reality_graph import build
from iic_bounded_trial import classify, http_json

TEST_PROJECT = "sbgfuanxiqepcoboxzcl"
TEST_DB = "postgres"
MAX_SECONDS = 900
MAX_SAMPLES = 60
GITHUB_SOURCE_TTL = 24 * 3600
RUNBOOK_SOURCE_TTL = 24 * 3600
STATUSES = {"backlog", "ready", "in_progress", "blocked", "review", "done", "canceled", "deferred"}
HALT = False

def stop(_signal, _frame):
    global HALT
    HALT = True

def iso(ts):
    return datetime.fromtimestamp(ts, timezone.utc).isoformat().replace("+00:00", "Z")

def deadline(timestamp, seconds):
    src = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
    if src.tzinfo is None:
        raise ValueError("timezone missing")
    return (src.astimezone(timezone.utc) + timedelta(seconds=seconds)).isoformat().replace("+00:00", "Z")

def safe_hash(value):
    return hashlib.sha256(value.encode("utf8")).hexdigest()

def postgres_read(url, project=TEST_PROJECT):
    """Private Test read-only transaction. Requires pre-approved restricted role."""
    if not url or not url.startswith(("postgresql://","postgres://")):
        raise ValueError("Test database scope not verifiable")
    from urllib.parse import urlsplit
    parsed = urlsplit(url)
    hostname=(parsed.hostname or "").lower()
    username=parsed.username or ""
    # Verify project in a structural address field, never an arbitrary password
    # or query parameter. Pooled usernames use role.<project-ref>.
    scoped_pool=(hostname.endswith(".pooler.supabase.com")
                 and username.endswith("."+project))
    scoped_direct=(hostname=="db."+project+".supabase.co")
    if not (scoped_pool or scoped_direct):
        raise ValueError("Test database host or username scope invalid")
    # Reject administrator principals and empty/anonymous user.
    principal=username.split(".")[0].lower()
    if principal in ("","postgres","supabase_admin","service_role"):
        raise ValueError("dedicated restricted Test reader role required")
    import psycopg
    from psycopg.rows import dict_row
    with psycopg.connect(url, connect_timeout=5, row_factory=dict_row) as conn:
        with conn.transaction():
            conn.execute("SET TRANSACTION READ ONLY")
            conn.execute("SET LOCAL statement_timeout = '4000ms'")
            meta = conn.execute(
                "SELECT current_user AS actor, current_database() AS db, "
                "(SELECT rolsuper OR rolcreaterole OR rolcreatedb OR rolreplication OR rolbypassrls "
                " FROM pg_roles WHERE rolname=current_user) AS elevated, "
                "EXISTS (SELECT 1 FROM pg_class c "
                " WHERE c.relnamespace='comind_pm'::regnamespace AND c.relkind IN ('r','p') "
                " AND (has_table_privilege(current_user,c.oid,'INSERT') "
                " OR has_table_privilege(current_user,c.oid,'UPDATE') "
                " OR has_table_privilege(current_user,c.oid,'DELETE'))) AS can_write"
            ).fetchone()
            if meta["elevated"] or meta["can_write"] or meta["db"] != TEST_DB or meta["actor"] != principal:
                raise ValueError("database identity or permission boundary invalid")
            row = conn.execute(
                "SELECT project_key, work_key, status, last_event_at "
                "FROM comind_pm.iic_test_lane_state()"
            ).fetchone()
            if row is None:
                raise ValueError("private Test RunBook projection returned no record")
            for key in ("project_key","work_key"):
                value=row[key]
                if not isinstance(value,str) or len(value)!=64 or any(ch not in "0123456789abcdef" for ch in value):
                    raise ValueError("source IDs must be hashed inside PostgreSQL")
            return {
                "project_key": row["project_key"],
                "work_key": row["work_key"],
                "status": row["status"],
                "last_event_at": row["last_event_at"].astimezone(timezone.utc).isoformat().replace("+00:00","Z")
            }

def github_read(token=None):
    branch=http_json("branches/main", token)
    runs=http_json("actions/workflows/implementation-integrity.yml/runs?branch=main&per_page=20", token)
    return branch,runs

def take_sample(github_reader, runbook_reader, registry, clock=time.time,
                expected_status=None):
    observed=iso(clock())
    flags=[]
    envelopes=[]
    github_state="unavailable"
    runbook_state="unavailable"
    try:
        branch,runs=github_reader()
        r=classify(branch,runs,clock())
        github_state=r["state"]
        if github_state in ("current","failed"):
            run=next((x for x in runs["workflow_runs"] if x.get("id")==r.get("run_id")),None)
            if not run or run.get("status")!="completed":
                raise ValueError("run source not terminal")
            envelopes.append(from_github_run(run,environment="Test",observed_at=observed,
                fresh_until=deadline(run["updated_at"],GITHUB_SOURCE_TTL)))
    except (Exception,) as exc:
        # Never publish an exception string; DSNs, requests and private keys are sensitive.
        flags.append("github-read-unavailable")
    try:
        row=runbook_reader()
        if row["status"] not in STATUSES:
            raise ValueError("invalid RunBook state")
        entry=from_runbook_lane(row,environment="Test",observed_at=observed,
            fresh_until=deadline(row["last_event_at"],RUNBOOK_SOURCE_TTL))
        envelopes.append(entry)
        runbook_state=entry["freshness"]
    except (Exception,) as exc:
        flags.append("runbook-read-unavailable")
    claims=[]
    bindings=[]
    approvals=[]
    if github_state in ("current","failed") and any(x["source_system"]=="github-actions" for x in envelopes):
        gh=next(x for x in envelopes if x["source_system"]=="github-actions")
        claims.append({"claim_id":"IIC-GITHUB-WORKFLOW","statement":"Exact-main GitHub integrity workflow reports success",
            "environment":"Test","expected":{"claim_type":"github.run.conclusion","claim_value":"success"},
            "authority_required":False})
        bindings.append({"kind":"evidence","claim_id":"IIC-GITHUB-WORKFLOW","evidence_ref":gh["evidence_ref"]})
    if runbook_state!="unavailable" and expected_status in STATUSES:
        rb=next(x for x in envelopes if x["source_system"]=="durable-runbook")
        claims.append({"claim_id":"IIC-RUNBOOK-LANE","statement":"Scoped Test RunBook latest lane reports expected state",
            "environment":"Test","expected":{"claim_type":"runbook.lane.status","claim_value":expected_status},
            "authority_required":False})
        bindings.append({"kind":"evidence","claim_id":"IIC-RUNBOOK-LANE","evidence_ref":rb["evidence_ref"]})
    # Critical: no Production authority claim is promoted by this collector.
    claims.append({"claim_id":"IIC-PRODUCTION-READY","statement":"CoMind integrity enforcement is Production authorized",
        "environment":"Production","expected":{"claim_type":"github.run.conclusion","claim_value":"success"},
        "authority_required":True})
    graph=build(envelopes,claims,bindings,approvals,registry)
    outcome={x["claim_id"]:x["status"] for x in graph["assessments"]}
    return {"observed_at":observed,"source_states":{"github":github_state,"runbook":runbook_state},
            "claim_statuses":outcome,"node_count":graph["node_count"],"edge_count":graph["edge_count"],
            "source_refs":[{"system":x["source_system"],"ref":x["evidence_ref"],"freshness":x["freshness"],
               "status":x["status"]} for x in envelopes],"flags":flags}

def evaluate(mode, duration, interval, sample, clock=time.monotonic, sleep=time.sleep):
    if mode not in ("ON","OFF"):
        raise ValueError("mode must be ON or OFF")
    if not (isinstance(duration,int) and 10<=duration<=MAX_SECONDS):
        raise ValueError("duration must be 10..900 seconds")
    if not (isinstance(interval,int) and 10<=interval<=duration):
        raise ValueError("interval must be 10..duration")
    if (duration + interval - 1) // interval > MAX_SAMPLES:
        raise ValueError("sample cap exceeded")
    report={"schema_version":1,"component":"IIC-009-private-test-graph",
            "mode_requested":mode,"auto_stop_seconds":duration,"interval_seconds":interval,
            "production_authority":"not-granted","environment":"Test","samples":[]}
    if mode=="OFF":
        report["stopped"]=True
        report["stop_reason"]="switch-off"
        return report
    begun=clock()
    next_tick=begun
    while not HALT and len(report["samples"])<MAX_SAMPLES and clock()-begun<duration:
        if clock()<next_tick:
            sleep(min(next_tick-clock(),max(0,duration-(clock()-begun))))
        if HALT or clock()-begun>=duration:
            break
        try:
            report["samples"].append(sample())
        except Exception:
            report["samples"].append({"flags":["collector-failure"],"claim_statuses":{},
                "source_states":{"github":"unavailable","runbook":"unavailable"}})
        next_tick+=interval
    report["stopped"]=True
    report["stop_reason"]="signal" if HALT else "deadline-or-sample-cap"
    report["observations"]=len(report["samples"])
    report["no_false_success"]=all(
        x.get("claim_statuses",{}).get("IIC-PRODUCTION-READY")!="supported"
        for x in report["samples"])
    return report

def main(argv=None):
    p=argparse.ArgumentParser()
    p.add_argument("--mode",choices=["ON","OFF"],default="OFF")
    p.add_argument("--duration-seconds",type=int,default=180)
    p.add_argument("--interval-seconds",type=int,default=15)
    p.add_argument("--expected-runbook-status",choices=sorted(STATUSES))
    p.add_argument("--registry",type=Path,default=Path("config/integrity-registry.v1.json"))
    p.add_argument("--output",type=Path,default=Path("iic-009-private-test.json"))
    args=p.parse_args(argv)
    if args.mode=="ON" and args.expected_runbook_status not in STATUSES:
        print("IIC-009: ON requires a declared expected RunBook lane state",file=sys.stderr)
        return 2
    if args.mode=="ON" and (not os.environ.get("IIC_TEST_DATABASE_URL")
                            or os.environ.get("IIC_TEST_SCOPE")!="sbgfuanxiqepcoboxzcl"):
        print("IIC-009: dedicated Test credential/scope not configured",file=sys.stderr)
        return 2
    try:
        registry=json.loads(args.registry.read_text(encoding="utf-8"))
        if registry.get("registry_id")!="COMIND-IIC-REGISTRY":
            raise ValueError("canonical registry mismatch")
        signal.signal(signal.SIGTERM,stop)
        signal.signal(signal.SIGINT,stop)
        report=evaluate(args.mode,args.duration_seconds,args.interval_seconds,
            sample=lambda:take_sample(lambda:github_read(os.environ.get("GH_TOKEN")),
                lambda:postgres_read(os.environ.get("IIC_TEST_DATABASE_URL")),registry,
                expected_status=args.expected_runbook_status))
        args.output.parent.mkdir(parents=True,exist_ok=True)
        args.output.write_text(json.dumps(report,sort_keys=True,indent=2)+"\n",encoding="utf-8")
        print(json.dumps({"stopped":report["stopped"],"reason":report["stop_reason"],
            "samples":len(report["samples"]),"mode":args.mode,"production":"not-granted"}))
        return 0 if report["stopped"] and report.get("no_false_success",True) else 1
    except (OSError,ValueError,TypeError,json.JSONDecodeError):
        print("IIC-009: controlled configuration or output failure",file=sys.stderr)
        return 2

if __name__=="__main__":
    raise SystemExit(main())
