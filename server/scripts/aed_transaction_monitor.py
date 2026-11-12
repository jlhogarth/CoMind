#!/usr/bin/env python3
"""Observe a bounded local AED command and retain its process transactions as JSONL."""
import argparse
import hashlib
import json
import math
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
                          "step_id", "parent_step_id", "operation", "phase", "source", "destination",
                          "input_bytes", "output_bytes",
                          "input_tokens", "output_tokens", "work_allowance_before",
                          "work_allowance_after", "work_allowance_unit", "usage_source",
                          "maximum_usd", "approval_reference", "evidence_reference"})


def observe_usage(executable):
    """Read only a bounded, structured account meter; discard all other process output."""
    try:
        result = subprocess.run([str(executable)], capture_output=True, timeout=5, check=True)
        if len(result.stdout) > 2048:
            raise ValueError("meter output too large")
        value = json.loads(result.stdout)
        allowed = {"source", "captured_at", "included_allowance_remaining_percent",
                   "purchased_credits_remaining"}
        if not isinstance(value, dict) or value.keys() - allowed or value.get("source") != "openai_usage_ui":
            raise ValueError("invalid meter source or fields")
        captured = datetime.fromisoformat(value["captured_at"].replace("Z", "+00:00"))
        if captured.tzinfo is None or abs((datetime.now(timezone.utc) - captured).total_seconds()) > 300:
            raise ValueError("stale meter reading")
        numbers = ("included_allowance_remaining_percent", "purchased_credits_remaining")
        if not any(name in value for name in numbers):
            raise ValueError("meter reading required")
        for name in numbers:
            if name in value and (type(value[name]) not in (int, float) or
                                  not math.isfinite(value[name]) or value[name] < 0 or
                                  (name.endswith("percent") and value[name] > 100)):
                raise ValueError("invalid meter reading")
        return value
    except (OSError, subprocess.SubprocessError, UnicodeError, ValueError, KeyError, TypeError):
        return None


def parse_event(line):
    if not line.startswith("AED_EVENT "):
        return None
    value = json.loads(line[len("AED_EVENT "):])
    if not isinstance(value, dict) or value.keys() - EVENT_FIELDS:
        raise ValueError("AED event contains unknown fields")
    if any(not isinstance(v, (str, int, float, type(None))) or isinstance(v, bool)
           for v in value.values()):
        raise ValueError("AED event field has unsupported value")
    for name in ("input_bytes", "output_bytes", "input_tokens", "output_tokens"):
        if name in value and (type(value[name]) is not int or value[name] < 0):
            raise ValueError(f"{name} must be a nonnegative integer")
    for name in ("cost_usd", "work_allowance_before", "work_allowance_after"):
        if name in value and value[name] is not None:
            import math
            if type(value[name]) not in (int, float) or not math.isfinite(value[name]) or value[name] < 0:
                raise ValueError(f"{name} must be finite and nonnegative")
    if "phase" in value and value["phase"] not in ("start", "end", "error"):
        raise ValueError("invalid FlowOps phase")
    if "phase" in value and (not value.get("step_id") or not value.get("operation")):
        raise ValueError("FlowOps phase requires step_id and operation")
    if "cost_usd" in value and value.get("usage_source") not in ("provider_receipt", "account_meter"):
        raise ValueError("cost_usd requires a provider receipt or account meter")
    return value


def run(command, output, timeout, usage_observer=None):
    if not command or not 1 <= timeout <= 600:
        raise ValueError("command and timeout of 1..600 seconds required")
    output.parent.mkdir(parents=True, exist_ok=True)
    started = time.monotonic()
    execution = hashlib.sha256(os.urandom(32)).hexdigest()[:24]
    sequence = 0
    active_steps = {}
    totals = {"output_bytes": 0, "flow_input_bytes": 0, "flow_output_bytes": 0}
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
        before = observe_usage(usage_observer) if usage_observer else None
        if usage_observer:
            record("usage_snapshot", phase="before", **before) if before else record(
                "usage_unavailable", phase="before", reason="observer_failed")

        def finish_usage():
            if not usage_observer:
                return
            after = observe_usage(usage_observer)
            if not after:
                record("usage_unavailable", phase="after", reason="observer_failed")
                return
            record("usage_snapshot", phase="after", **after)
            if not before:
                return
            delta = {}
            for name in ("included_allowance_remaining_percent", "purchased_credits_remaining"):
                if name in before and name in after:
                    difference = before[name] - after[name]
                    if difference >= 0:
                        delta[name.replace("remaining", "observed_consumed")] = round(difference, 6)
                    else:
                        delta[name.replace("remaining", "observed_consumed")] = None
            record("usage_reconciliation", source="openai_usage_ui", scope="shared_account",
                   attribution="unallocated", before_at=before["captured_at"],
                   after_at=after["captured_at"], **delta)

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
                selector.close()
                process.stdout.close()
                finish_usage()
                record("timeout", returncode=process.returncode, active_steps=sorted(active_steps), totals=totals)
                return 124
            for key, _ in selector.select(timeout=0.25):
                line = key.fileobj.readline()
                if line:
                    # Retain hashes and bounded sizes, never raw output or credentials.
                    data = line.encode("utf-8")
                    totals["output_bytes"] += len(data)
                    record("output", bytes=len(data), sha256=hashlib.sha256(data).hexdigest())
                    try:
                        event = parse_event(line)
                        if event is not None:
                            if event.get("phase"):
                                step_id = event["step_id"]
                                if event["phase"] == "start":
                                    if step_id in active_steps:
                                        raise ValueError("duplicate FlowOps step start")
                                    active_steps[step_id] = (time.monotonic(), event["operation"])
                                else:
                                    prior = active_steps.pop(step_id, None)
                                    if prior is None or prior[1] != event["operation"]:
                                        raise ValueError("FlowOps step end without matching start")
                                    event["duration_ms"] = round((time.monotonic() - prior[0]) * 1000)
                                    totals["flow_input_bytes"] += event.get("input_bytes", 0)
                                    totals["flow_output_bytes"] += event.get("output_bytes", 0)
                            record("aed_event", **event)
                    except ValueError:
                        record("invalid_event", sha256=hashlib.sha256(data).hexdigest())
                else:
                    selector.unregister(key.fileobj)
            if process.poll() is not None and not selector.get_map():
                selector.close()
                process.stdout.close()
                finish_usage()
                record("exited", returncode=process.returncode, active_steps=sorted(active_steps), totals=totals)
                return process.returncode


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--timeout", type=int, default=120)
    parser.add_argument("--usage-observer", type=Path, help="Executable returning a fresh, structured Work account meter reading")
    parser.add_argument("command", nargs=argparse.REMAINDER)
    args = parser.parse_args()
    command = args.command[1:] if args.command[:1] == ["--"] else args.command
    try:
        sys.exit(run(command, args.output, args.timeout, args.usage_observer))
    except (ValueError, FileExistsError) as error:
        parser.error(str(error))
