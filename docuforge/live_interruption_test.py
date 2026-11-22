"""One-shot, Linux-only private Drive interruption acceptance for DFG-002.

Run only on an authorized Test host with a durable private state directory.
The child exits immediately after the first real upload. The parent resumes
using the same SQLite state and checks authenticated bytes and exact-name counts.
"""
from __future__ import annotations

import argparse
from contextlib import closing
import fcntl
import json
import os
from pathlib import Path
import sqlite3

from drive import Drive, PublicationError
from publish import REQUEST_ID, check_folder, digest, events, open_state, publish


class InterruptingDrive:
    def __init__(self, actual):
        self.actual = actual

    def __getattr__(self, name):
        return getattr(self.actual, name)

    def create(self, file_id, name, mime, folder, payload):
        if self.actual.create(file_id, name, mime, folder, payload) is not True:
            raise PublicationError("First live upload did not create a new Drive file")
        # The process dies before the publisher records the upload response.
        os._exit(71)


def run(source_bytes, request_id, folder, state_dir, token, engine="soffice"):
    if not REQUEST_ID.fullmatch(request_id) or not source_bytes:
        raise PublicationError("Invalid live Test request")
    state_dir.mkdir(parents=True, exist_ok=True, mode=0o700)
    stat = state_dir.stat()
    if stat.st_mode & 0o077 or stat.st_uid != os.geteuid():
        raise PublicationError("Test state directory must be private and owned by the operator")
    with (state_dir / "publisher.lock").open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        database = state_dir / "publisher.sqlite3"
        drive = Drive(token)
        check_folder(drive, folder)
        with closing(open_state(database)) as conn:
            if conn.execute("SELECT 1 FROM request WHERE id=?", (request_id,)).fetchone():
                raise PublicationError("Live interruption requires a fresh request ID in this state directory")
        pid = os.fork()
        if pid == 0:
            with closing(open_state(database)) as conn:
                publish(conn, InterruptingDrive(drive), source_bytes, request_id, folder, engine)
            os._exit(72)
        _, status = os.waitpid(pid, 0)
        if not os.WIFEXITED(status) or os.WEXITSTATUS(status) != 71:
            raise PublicationError("Test child did not exit immediately after its first Drive create")
        with closing(open_state(database)) as conn:
            before = events(conn, request_id)
            state = conn.execute("SELECT * FROM request WHERE id=?", (request_id,)).fetchone()
            if not before or before[-1]["stage"] != "docx_pending" or not state:
                raise PublicationError("Interrupted request did not preserve the expected pending stage")
            ids = [state["docx_id"], state["pdf_id"], state["receipt_id"]]
            if not all(ids) or len(set(ids)) != 3:
                raise PublicationError("Interrupted request did not preserve three unique Drive IDs")
            docx = conn.execute("SELECT name,payload FROM artifact WHERE request_id=? AND name LIKE '%.docx'",
                                (request_id,)).fetchone()
            if not docx:
                raise PublicationError("Validated Word bytes were not preserved")
            first = drive.metadata(ids[0])
            if not first or first.get("name") != docx["name"]:
                raise PublicationError("First uploaded Drive file is not recoverable")
            if digest(drive.read(ids[0], len(docx["payload"]))) != digest(docx["payload"]):
                raise PublicationError("First Drive readback differs from saved bytes")
            result = publish(conn, drive, source_bytes, request_id, folder, engine)
            resumed = events(conn, request_id)
            replay = publish(conn, drive, source_bytes, request_id, folder, engine)
            if result["receipt_readback"]["sha256"] != replay["receipt_readback"]["sha256"]:
                raise PublicationError("Replay changed the verified receipt")
            # Artifacts are selected in manifest order, not SQLite row order.
            expected = [(item["name"], ids[i], item["sha256"])
                        for i, item in enumerate(result["manifest"]["artifacts"])]
            expected.append((f"DFG-002_{request_id}_receipt.json", ids[2],
                             result["receipt_readback"]["sha256"]))
            for name, file_id, sha in expected:
                matches = drive.files_named(folder, name)
                if len(matches) != 1 or matches[0].get("id") != file_id:
                    raise PublicationError(f"Duplicate or missing Drive file for {name}")
                payload = conn.execute("SELECT payload FROM artifact WHERE request_id=? AND name=?",
                                       (request_id, name)).fetchone()
                expected_bytes = payload[0] if payload else conn.execute(
                    "SELECT receipt FROM request WHERE id=?", (request_id,)).fetchone()[0]
                if digest(drive.read(file_id, len(expected_bytes))) != sha:
                    raise PublicationError(f"Final authenticated readback differs for {name}")
        return {"status": "PASS", "request_id": request_id, "folder_id": folder,
                "interrupted_after_first_upload": True, "pending_stage": before[-1]["stage"],
                "reserved_ids": ids, "files": [{"name": n, "id": i, "sha256": h, "count": 1}
                                        for n, i, h in expected],
                "resume_verified": any(e["stage"] == "verified" for e in resumed),
                "replay_receipt_sha256": replay["receipt_readback"]["sha256"]}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--state-dir", type=Path, required=True)
    parser.add_argument("request_id")
    parser.add_argument("source", type=Path)
    parser.add_argument("destination")
    parser.add_argument("--office", default="soffice")
    args = parser.parse_args()
    os.umask(0o077)
    if args.destination != os.environ.get("DOCUFORGE_TEST_FOLDER_ID"):
        parser.exit(1, "DocuForge blocked: destination differs from configured Test folder\n")
    token = os.environ.pop("DOCUFORGE_DRIVE_ACCESS_TOKEN", None)
    try:
        result = run(args.source.read_bytes(), args.request_id, args.destination,
                     args.state_dir, token, args.office)
        print(json.dumps(result, indent=2))
    except (PublicationError, OSError, sqlite3.Error) as error:
        parser.exit(1, f"DocuForge blocked: {error if isinstance(error, PublicationError) else type(error).__name__}\n")


if __name__ == "__main__":
    main()
