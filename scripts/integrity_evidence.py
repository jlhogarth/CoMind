#!/usr/bin/env python3
"""IIC-007 read-only, source-scoped evidence envelope adapters.

Data is supplied by an authorized read caller. A JSON file alone does not prove
an authenticated read or grant permission. Normalization never initiates calls.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

SCHEMA_VERSION=1
ALLOWED_ENVIRONMENTS={"Test","Development","Production"}
ALLOWED_STATUS={"verified","mixed","uncertain","unavailable"}

class EvidenceError(ValueError):
    pass

def require(value, name):
    if not isinstance(value,str) or not value.strip():
        raise EvidenceError(name+" must be a nonempty string")
    return value

def instant(value, name):
    value=require(value,name)
    try:
        result=datetime.fromisoformat(value.replace("Z","+00:00"))
    except ValueError as exc:
        raise EvidenceError(name+" is not an ISO-8601 timestamp") from exc
    if result.tzinfo is None:
        raise EvidenceError(name+" needs an explicit timezone")
    return result.astimezone(timezone.utc)

def sha256_json(data):
    return hashlib.sha256(json.dumps(data,sort_keys=True,separators=(",",":"),default=str).encode()).hexdigest()

def envelope(source, authority, object_id, claim_type, claim_value, environment,
             recorded_at, observed_at, source_revision, evidence_ref, provenance,
             fresh_until=None):
    if environment not in ALLOWED_ENVIRONMENTS:
        raise EvidenceError("environment must be explicit and recognized")
    stamp=instant(observed_at,"observed_at")
    rec=instant(recorded_at,"recorded_at")
    if rec > stamp:
        raise EvidenceError("source recorded timestamp is later than read observation")
    deadline=instant(fresh_until,"fresh_until") if fresh_until else None
    if deadline and deadline < rec:
        raise EvidenceError("freshness boundary precedes source record")
    freshness="current" if deadline and stamp<=deadline else ("stale" if deadline else "unspecified")
    # Verified is deliberately narrow: the source-reported field was read, NOT
    # that a larger deployment, feature, or approval claim is established.
    status="verified" if freshness=="current" else "uncertain"
    return {
        "schema_version":SCHEMA_VERSION,"source_system":source,
        "source_authority":authority,"canonical_object_id":require(object_id,"canonical_object_id"),
        "claim_type":claim_type,"claim_value":require(str(claim_value),"claim_value"),
        "environment":environment,"recorded_at":recorded_at,"observed_at":observed_at,
        "source_revision":require(source_revision,"source_revision"),
        "evidence_ref":require(evidence_ref,"evidence_ref"),
        "provenance":provenance,"fresh_until":fresh_until,
        "freshness":freshness,"status":status,
        "limitations":["Source field observation only; not application acceptance, authorization, or Production readiness."]
    }

def from_github_run(run, *, environment, observed_at, fresh_until=None):
    if not isinstance(run,dict):
        raise EvidenceError("GitHub source must be an object")
    run_id=run.get("id")
    if not isinstance(run_id,int) or run_id<=0:
        raise EvidenceError("GitHub run id missing")
    repo=run.get("repository",{})
    repo_name=repo.get("full_name") if isinstance(repo,dict) else None
    require(repo_name,"GitHub repository.full_name")
    sha=require(run.get("head_sha"),"GitHub head_sha")
    if len(sha)!=40 or any(c not in "0123456789abcdef" for c in sha.lower()):
        raise EvidenceError("GitHub head SHA must be a full commit hash")
    conclusion=run.get("conclusion")
    status=run.get("status")
    if status!="completed" or conclusion not in {"success","failure","cancelled","skipped","timed_out","action_required","neutral"}:
        raise EvidenceError("GitHub run has no terminal conclusion")
    ref=require(run.get("html_url"),"GitHub run URL")
    if not ref.startswith("https://github.com/"+repo_name+"/actions/runs/"):
        raise EvidenceError("GitHub evidence reference does not match repository")
    return envelope("github-actions","GitHub workflow run status",repo_name+"/actions/runs/"+str(run_id),
                    "github.run.conclusion",conclusion,environment,require(run.get("updated_at"),"GitHub updated_at"),
                    observed_at,sha,ref,{"source_record_sha256":sha256_json(run),"read_contract":"github-rest-workflow-run"},
                    fresh_until)

def from_runbook_lane(row, *, environment, observed_at, fresh_until=None):
    if not isinstance(row,dict):
        raise EvidenceError("RunBook source must be an object")
    project=require(row.get("project_key"),"RunBook project_key")
    key=require(row.get("work_key"),"RunBook work_key")
    status=require(row.get("status"),"RunBook status")
    if status not in {"backlog","ready","in_progress","blocked","review","done","canceled","deferred"}:
        raise EvidenceError("unknown RunBook lane status")
    stamp=require(row.get("last_event_at"),"RunBook last_event_at")
    return envelope("durable-runbook","comind_pm.v_runbook_lane_state",project+"/"+key,
                    "runbook.lane.status",status,environment,stamp,observed_at,
                    stamp,"comind-runbook://"+project+"/"+key,
                    {"source_record_sha256":sha256_json(row),"read_contract":"comind_pm.v_runbook_lane_state"},
                    fresh_until)

def reconcile(envelopes):
    if not isinstance(envelopes,list):
        raise EvidenceError("envelopes must be a list")
    groups={}
    for record in envelopes:
        if not isinstance(record,dict) or record.get("status") not in ALLOWED_STATUS:
            raise EvidenceError("malformed evidence envelope")
        key=(record.get("canonical_object_id"),record.get("claim_type"),record.get("environment"))
        if any(not isinstance(x,str) or not x for x in key):
            raise EvidenceError("evidence identity incomplete")
        groups.setdefault(key,[]).append(record)
    outcome=[]
    for key,records in sorted(groups.items()):
        values={json.dumps(v["claim_value"],sort_keys=True) for v in records}
        contradiction=len(values)>1
        state=("mixed" if contradiction else
               "uncertain" if any(v["status"]!="verified" for v in records) else "verified")
        outcome.append({"subject":list(key),"status":state,"contradiction":contradiction,
                        "source_count":len(records),"evidence_refs":[v["evidence_ref"] for v in records]})
    return {"schema_version":SCHEMA_VERSION,"source_envelopes":envelopes,"assessments":outcome}

def main(argv=None):
    p=argparse.ArgumentParser()
    p.add_argument("--github-run-json",type=Path)
    p.add_argument("--runbook-lane-json",type=Path)
    p.add_argument("--environment",required=True)
    p.add_argument("--observed-at",required=True)
    p.add_argument("--fresh-until")
    p.add_argument("--output",type=Path)
    a=p.parse_args(argv)
    if not (a.github_run_json or a.runbook_lane_json):
        p.error("at least one source is required")
    try:
        items=[]
        for path,adapter in ((a.github_run_json,from_github_run),(a.runbook_lane_json,from_runbook_lane)):
            if path:
                data=json.loads(path.read_text(encoding="utf-8"))
                items.append(adapter(data,environment=a.environment,observed_at=a.observed_at,
                                     fresh_until=a.fresh_until))
        out=json.dumps(reconcile(items),indent=2,sort_keys=True)
        if a.output:
            a.output.parent.mkdir(parents=True,exist_ok=True)
            a.output.write_text(out+"\n",encoding="utf-8")
        print(out)
    except (OSError,ValueError,KeyError,TypeError) as exc:
        print("IIC-007 input/authority error: "+str(exc),file=sys.stderr)
        return 2
    return 0
if __name__=="__main__":
    raise SystemExit(main())
