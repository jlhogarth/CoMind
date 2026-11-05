#!/usr/bin/env python3
"""Isolated PostgreSQL readback after the ingestion process has exited."""
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

root = Path(__file__).resolve().parents[2]
url = os.environ["DATABASE_URL"]
assert url.endswith("/comind_ci"), "refusing non-isolated database"
migration = root / "db/migrations/20261104_001_aed_007_monitoring.sql"
store = root / "server/scripts/aed_monitor_store.py"
files = [root / "artifacts/aed-002c/recovery-transactions.jsonl",
         root / "artifacts/aed-002c/temporal-transactions.jsonl",
         root / "artifacts/aed-002c/live-transactions.jsonl"]

for _ in range(2):
    subprocess.run(["psql", url, "-X", "-v", "ON_ERROR_STOP=1", "-f", str(migration)], check=True,
                   stdout=subprocess.DEVNULL)

for path in files:
    assert path.exists(), path
    command = [sys.executable, str(store), "ingest", str(path), "--lane", "AED-007",
               "--run-url", os.environ["GITHUB_RUN_URL"]]
    first = json.loads(subprocess.check_output(command, text=True))
    subprocess.check_output(command, text=True)  # idempotent replay
    # New subprocess and connection: the original writer has terminated.
    readback = json.loads(subprocess.check_output(
        [sys.executable, str(store), "readback", first["execution_id"]], text=True))
    assert readback["event_count"] == first["event_count"] == readback["stored_events"]
    assert readback["source_sha256"] == first["source_sha256"]
    with tempfile.TemporaryDirectory() as directory:
        altered = Path(directory) / "altered.jsonl"
        rows = [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines()]
        rows[0]["kind"] = "altered_preflight"
        altered.write_text("\n".join(json.dumps(row) for row in rows) + "\n", encoding="utf-8")
        rejected = subprocess.run([sys.executable, str(store), "ingest", str(altered)],
                                  text=True, capture_output=True)
        assert rejected.returncode != 0 and "conflicting AED execution replay" in rejected.stderr
        after = json.loads(subprocess.check_output(
            [sys.executable, str(store), "readback", first["execution_id"]], text=True))
        assert after == readback
    print(json.dumps(readback, sort_keys=True))
