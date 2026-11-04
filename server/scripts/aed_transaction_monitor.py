#!/usr/bin/env python3
"""Observe a bounded local AED command and retain its process transactions as JSONL."""
import argparse
import hashlib
import json
import os
import signal
import selectors
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

EVENT_FIELDS = frozenset({"lane", "workflow_id", "run_id", "case", "state", "wake_source",
                          "outcome", "checkpoint", "next_action", "fencing_epoch",
                          "progress_at", "attempt", "reason", "provider", "cost_usd",
                          "maximum_usd", "approval_reference", "evidence_reference"})


def parse_event(line):
    if not line.startswith("AED_EVENT "):
        return None
    value = json.loads(line[len("AED_EVENT "):])
    if not isinstance(value, dict) or value.keys() - EVENT_FIELDS:
        raise ValueError("AED event contains unknown fields")
    if any(not isinstance(v, (str, int, float, type(None))) or isinstance(v, bool)
           for v in value.values()):
        raise ValueError("AED event field has unsupported value")
    return value


def run(command, output, timeout):
    if not command or not 1 <= timeout <= 600:
        raise ValueError("command and timeout of 1..600 seconds required")
    output.parent.mkdir(parents=True, exist_ok=True)
    started = time.monotonic()
    execution = hashlib.sha256(os.urandom(32)).hexdigest()[:24]
    sequence = 0
    with output.open("x", encoding="utf-8") as evidence:
        def record(kind, **fields):
            nonlocal sequence
            sequence += 1
            row = {"schema": "comind.aed.transaction.v1", "execution_id": execution,
                   "sequence": sequence, "at": datetime.now(timezone.utc).isoformat(),
                   "elapsed_ms": round((time.monotonic() - started) * 1000),
                   "kind": kind, **fields}
            evidence.write(json.dumps(row, sort_keys=True) + "\n")
            evidence.flush()
            os.fsync(evidence.fileno())

        record("preflight", provider="local", incremental_cost=False,
               decision="allow", chatgpt_work_cost="unknown")
        process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                                   text=True, bufsize=1, start_new_session=True)
        record("started", pid=process.pid, argv_sha256=hashlib.sha256(
            json.dumps(command).encode()).hexdigest())
        selector = selectors.DefaultSelector()
        selector.register(process.stdout, selectors.EVENT_READ)
        while True:
            if time.monotonic() - started > timeout:
                os.killpg(process.pid, signal.SIGTERM)
                try:
                    process.wait(timeout=3)
                except subprocess.TimeoutExpired:
                    os.killpg(process.pid, signal.SIGKILL)
                    process.wait()
                record("timeout", returncode=process.returncode)
                return 124
            for key, _ in selector.select(timeout=0.25):
                line = key.fileobj.readline()
                if line:
                    # Retain hashes and bounded sizes, never raw output or credentials.
                    data = line.encode("utf-8")
                    record("output", bytes=len(data), sha256=hashlib.sha256(data).hexdigest())
                    try:
                        event = parse_event(line)
                        if event is not None:
                            record("aed_event", **event)
                    except ValueError:
                        record("invalid_event", sha256=hashlib.sha256(data).hexdigest())
                else:
                    selector.unregister(key.fileobj)
            if process.poll() is not None and not selector.get_map():
                record("exited", returncode=process.returncode)
                return process.returncode


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--timeout", type=int, default=120)
    parser.add_argument("command", nargs=argparse.REMAINDER)
    args = parser.parse_args()
    command = args.command[1:] if args.command[:1] == ["--"] else args.command
    try:
        sys.exit(run(command, args.output, args.timeout))
    except (ValueError, FileExistsError) as error:
        parser.error(str(error))
