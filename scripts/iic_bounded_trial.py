#!/usr/bin/env python3
"""IIC-009 bounded GitHub evidence monitoring trial.

No scheduler, external worker, RunBook connection, Production mutation, or
provider inference. A run is temporary, automatically ends, and preserves
negative evidence. Uses GitHub workflow token only when supplied by Actions.
"""
from __future__ import annotations
import argparse
import json
import os
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

REPO = "jlhogarth/CoMind"
API = "https://api.github.com/repos/" + REPO
WORKFLOW = ".github/workflows/implementation-integrity.yml"
SHA = re.compile(r"^[0-9a-f]{40}$")
MAX_DURATION = 300
MIN_INTERVAL = 10
MAX_POLLS = 30
FRESH_SECONDS = 24 * 60 * 60

def utc(ts: float) -> str:
    return datetime.fromtimestamp(ts, timezone.utc).isoformat().replace("+00:00", "Z")

def parse_timestamp(value: object) -> float | None:
    if not isinstance(value, str) or not re.search(r"(?:Z|[+-]\d\d:\d\d)$", value):
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp()
    except ValueError:
        return None

def http_json(endpoint: str, token: str | None = None) -> dict:
    if endpoint not in ("branches/main", "actions/workflows/implementation-integrity.yml/runs?branch=main&per_page=20"):
        raise ValueError("endpoint not allowlisted")
    headers = {"Accept": "application/vnd.github+json", "User-Agent": "CoMind-IIC-009-bounded-test"}
    if token:
        headers["Authorization"] = "Bearer " + token
    req = Request(API + "/" + endpoint, headers=headers)
    with urlopen(req, timeout=8) as response:
        if int(response.headers.get("Content-Length", "0") or "0") > 500_000:
            raise ValueError("source response too large")
        raw = response.read(500_001)
        if len(raw) > 500_000:
            raise ValueError("source response too large")
        result = json.loads(raw)
        if not isinstance(result, dict):
            raise ValueError("source response not object")
        return result

def classify(branch: dict, runs: dict, observed: float) -> dict:
    """Return source observation status, not an implementation-completion claim."""
    rev = branch.get("commit") if isinstance(branch, dict) else None
    sha = rev.get("sha") if isinstance(rev, dict) else None
    if not isinstance(sha, str) or not SHA.fullmatch(sha):
        return {"state": "unavailable", "reason": "main revision invalid"}
    list_runs = runs.get("workflow_runs") if isinstance(runs, dict) else None
    if not isinstance(list_runs, list):
        return {"state": "unavailable", "reason": "workflow list unavailable", "main_sha": sha}
    candidates = []
    for run in list_runs:
        if not isinstance(run, dict):
            continue
        if run.get("head_sha") != sha or run.get("head_branch") != "main" or run.get("event") != "push":
            continue
        if run.get("path") != WORKFLOW or not isinstance(run.get("repository"), dict) or run["repository"].get("full_name") != REPO:
            return {"state": "unavailable", "reason": "matching run has mismatched source identity", "main_sha": sha}
        run_id = run.get("id")
        if not isinstance(run_id, int) or run_id <= 0 or run.get("html_url") != f"https://github.com/{REPO}/actions/runs/{run_id}":
            return {"state": "unavailable", "reason": "run link invalid", "main_sha": sha}
        recorded = parse_timestamp(run.get("updated_at"))
        if recorded is None or recorded > observed + 60:
            return {"state": "unavailable", "reason": "run source timestamp invalid", "main_sha": sha}
        candidates.append((recorded, run))
    if not candidates:
        return {"state": "unavailable", "reason": "no exact-main push workflow run", "main_sha": sha}
    recorded, run = max(candidates, key=lambda item: (item[0], item[1]["id"]))
    age = observed - recorded
    if run.get("status") != "completed":
        state = "pending"
    elif age > FRESH_SECONDS:
        state = "stale"
    elif run.get("conclusion") == "success":
        state = "current"
    else:
        state = "failed"
    return {"state": state, "main_sha": sha, "run_id": run["id"],
            "run_url": run["html_url"], "source_conclusion": run.get("conclusion"),
            "source_recorded_at": utc(recorded), "source_age_seconds": max(0, round(age)),
            "reason": "GitHub workflow observation only. No Runtime/Production/RunBook authority."}

def observe(fetch=http_json, token=None, clock=time.time) -> dict:
    stamp=clock()
    try:
        branch=fetch("branches/main", token)
        runs=fetch("actions/workflows/implementation-integrity.yml/runs?branch=main&per_page=20", token)
        result=classify(branch,runs,stamp)
    except (HTTPError, URLError, TimeoutError, OSError, ValueError, TypeError, json.JSONDecodeError):
        result={"state":"unavailable","reason":"source fetch failed; no health inferred"}
    return {"observed_at":utc(stamp),**result}

def run(duration: int, interval: int, fetch=http_json, clock=time.time,
        monotonic=time.monotonic, sleeper=time.sleep, token=None) -> dict:
    if not (isinstance(duration,int) and 10 <= duration <= MAX_DURATION):
        raise ValueError("duration outside 10..300 seconds")
    if not (isinstance(interval,int) and MIN_INTERVAL <= interval <= duration):
        raise ValueError("interval outside 10..duration")
    if 1 + (duration // interval) > MAX_POLLS:
        raise ValueError("too many observations")
    started=monotonic()
    samples=[]
    next_at=started
    while monotonic() - started < duration and len(samples) < MAX_POLLS:
        remaining=next_at - monotonic()
        if remaining>0:
            sleeper(min(remaining, max(0,duration-(monotonic()-started))))
        if monotonic()-started>=duration:
            break
        samples.append(observe(fetch=fetch,clock=clock,token=token))
        next_at += interval
    states={k:sum(s["state"]==k for s in samples) for k in ("current","stale","failed","pending","unavailable")}
    return {"schema_version":1,"component":"IIC-009-bounded-source-trial",
            "mode":"finite-and-auto-stop","environment":"Development/Test",
            "duration_cap_seconds":duration,"poll_interval_seconds":interval,
            "sample_count":len(samples),"state_counts":states,
            "all_observations_current":bool(samples) and states["current"]==len(samples),
            "production_authority":"not-established","private_runbook":"not-connected",
            "claim_scope":"exact-main GitHub Implementation Integrity workflow observation only",
            "samples":samples}

def main(argv=None):
    p=argparse.ArgumentParser()
    p.add_argument("--duration-seconds",type=int,default=90)
    p.add_argument("--interval-seconds",type=int,default=15)
    p.add_argument("--output",type=Path,default=Path("iic-009-trial.json"))
    args=p.parse_args(argv)
    try:
        result=run(args.duration_seconds,args.interval_seconds,token=os.environ.get("GH_TOKEN"))
        args.output.parent.mkdir(parents=True,exist_ok=True)
        args.output.write_text(json.dumps(result,sort_keys=True,indent=2)+"\n",encoding="utf-8")
        print(json.dumps({"component":result["component"],"sample_count":result["sample_count"],
                          "state_counts":result["state_counts"],"all_observations_current":result["all_observations_current"],
                          "mode":result["mode"],"report":str(args.output)}))
        return 0 if result["all_observations_current"] else 1
    except (ValueError,OSError) as e:
        print("IIC-009 trial configuration or output failure: "+str(e),file=sys.stderr)
        return 2
if __name__=="__main__":
    raise SystemExit(main())
