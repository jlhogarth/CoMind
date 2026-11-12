"""Publish a DFG-001-format source in Test and resume using the same request ID."""
from __future__ import annotations

import argparse
from contextlib import closing
from datetime import datetime, timezone
import fcntl
from hashlib import sha256
import json
import os
from pathlib import Path
import re
import sqlite3
from tempfile import TemporaryDirectory

from drive import Drive, FILE_ID, FOLDER_MIME, MAX_BYTES, PublicationError
from manifest import build_manifest, verify_publication

REQUEST_ID = re.compile(r"[a-zA-Z0-9_-]{8,64}")
RECEIPT_MIME = "application/json"


def utc():
    return datetime.now(timezone.utc).isoformat()


def digest(payload):
    return sha256(payload).hexdigest()


def store(connection, request_id, stage, *, detail=None):
    connection.execute("INSERT INTO event(request_id, occurred_at, stage, detail) VALUES (?, ?, ?, ?)",
                       (request_id, utc(), stage, json.dumps(detail or {}, sort_keys=True)))
    connection.commit()


def open_state(path):
    connection = sqlite3.connect(path)
    connection.execute("PRAGMA foreign_keys = ON")
    connection.executescript("""
        CREATE TABLE IF NOT EXISTS request (
            id TEXT PRIMARY KEY, source_sha256 TEXT NOT NULL, folder TEXT NOT NULL,
            docx_id TEXT, pdf_id TEXT, receipt_id TEXT, manifest TEXT, receipt BLOB
        );
        CREATE TABLE IF NOT EXISTS artifact (
            request_id TEXT NOT NULL REFERENCES request(id), name TEXT NOT NULL, payload BLOB NOT NULL,
            PRIMARY KEY (request_id, name)
        );
        CREATE TABLE IF NOT EXISTS event (
            sequence INTEGER PRIMARY KEY, request_id TEXT NOT NULL REFERENCES request(id),
            occurred_at TEXT NOT NULL, stage TEXT NOT NULL, detail TEXT NOT NULL
        );
    """)
    connection.row_factory = sqlite3.Row
    return connection


def prepare(source_bytes, engine, request_id, folder):
    from generate import generate
    from verify_foundation import verify_foundation

    with TemporaryDirectory() as directory:
        work = Path(directory)
        source = work / "source.json"
        source.write_bytes(source_bytes)
        docx, pdf, created = generate(source, work, office=engine)
        checks = verify_foundation(source, docx, pdf)
        docx = docx.rename(docx.with_stem(f"{docx.stem}_{request_id}"))
        pdf = pdf.rename(pdf.with_stem(f"{pdf.stem}_{request_id}"))
        data = json.loads(source_bytes)
        manifest = build_manifest(
            data["id"], data["version"],
            [{"ref": "request-source", "sha256": digest(source_bytes)}], [docx, pdf],
            classification="INTERNAL", destinations=[{"folder_id": folder}],
            title=data["title"], generated_at=created.isoformat(),
            engine={"docx": "python-docx", "pdf": "LibreOffice Writer"},
            development={"issue": 562, "commit": None, "pr": None},
            editable_sources={pdf.name: docx.name},
            validation={file.name: [{"status": "PASS", "check": check}
                                    for check in checks[file.suffix[1:]]]
                        for file in (docx, pdf)},
        )
        manifest["request_id"] = request_id
        payloads = {file.name: file.read_bytes() for file in (docx, pdf)}
    if any(len(payload) > MAX_BYTES for payload in payloads.values()):
        raise PublicationError("Generated artifact exceeds the Test publication size limit")
    return manifest, payloads


def check_folder(drive, folder):
    meta = drive.metadata(folder)
    if (not meta or meta.get("id") != folder or meta.get("mimeType") != FOLDER_MIME
            or meta.get("trashed") is not False or meta.get("shared") is not False
            or meta.get("capabilities", {}).get("canAddChildren") is not True):
        raise PublicationError("Approved Test destination is unavailable, shared, or not writable")


def upload_and_read(drive, file_id, name, mime, folder, payload, *, already_verified=False):
    meta = drive.metadata(file_id)
    if meta is None and not already_verified:
        check_folder(drive, folder)
        drive.create(file_id, name, mime, folder, payload)
        meta = drive.metadata(file_id)
    if (not meta or meta.get("id") != file_id or meta.get("name") != name
            or meta.get("mimeType") != mime or meta.get("parents") != [folder]
            or meta.get("trashed") is not False or meta.get("shared") is not False
            or str(meta.get("size")) != str(len(payload))):
        raise PublicationError(f"Drive metadata mismatch for {name}")
    received = drive.read(file_id, len(payload))
    if len(received) != len(payload) or digest(received) != digest(payload):
        raise PublicationError(f"Drive SHA-256 mismatch for {name}")
    return received, {"file_id": file_id, "folder_id": folder, "mime": mime,
                      "bytes": len(received), "authenticated": True, "retrieved_utc": utc()}


def publish(connection, drive, source_bytes, request_id, folder, engine="soffice"):
    if not REQUEST_ID.fullmatch(request_id) or not FILE_ID.fullmatch(folder):
        raise PublicationError("Request ID or approved folder ID has an invalid format")
    if not source_bytes or len(source_bytes) > MAX_BYTES:
        raise PublicationError("Source is empty or exceeds the Test publication size limit")
    source_sha = digest(source_bytes)
    state = connection.execute("SELECT * FROM request WHERE id = ?", (request_id,)).fetchone()
    if state and (state["source_sha256"], state["folder"]) != (source_sha, folder):
        raise PublicationError("Request ID is already bound to a different source or destination")
    if not state:
        connection.execute("INSERT INTO request (id, source_sha256, folder) VALUES (?, ?, ?)",
                           (request_id, source_sha, folder))
        store(connection, request_id, "request_registered")
        state = connection.execute("SELECT * FROM request WHERE id = ?", (request_id,)).fetchone()
    phase = "destination_preflight"
    try:
        check_folder(drive, folder)
        if not state["manifest"]:
            phase = "generate_and_validate"
            manifest, payloads = prepare(source_bytes, engine, request_id, folder)
            connection.execute("UPDATE request SET manifest = ? WHERE id = ?",
                               (json.dumps(manifest), request_id))
            connection.executemany("INSERT INTO artifact VALUES (?, ?, ?)",
                                   ((request_id, name, payload) for name, payload in payloads.items()))
            store(connection, request_id, "documents_validated")
        else:
            manifest = json.loads(state["manifest"])
            payloads = {row["name"]: row["payload"] for row in connection.execute(
                "SELECT name, payload FROM artifact WHERE request_id = ?", (request_id,))}
        for item in manifest["artifacts"]:
            if (item["name"] not in payloads or digest(payloads[item["name"]]) != item["sha256"]
                    or len(payloads[item["name"]]) != item["bytes"]):
                raise PublicationError("Durable local artifact differs from its validated digest")
        phase = "reserve_drive_ids"
        file_ids = [state["docx_id"], state["pdf_id"], state["receipt_id"]]
        if file_ids[0] is None:
            file_ids = drive.reserve(3)
            connection.execute("UPDATE request SET docx_id=?, pdf_id=?, receipt_id=? WHERE id=?",
                               (*file_ids, request_id))
            store(connection, request_id, "drive_ids_reserved")
        receipts = {}
        # Use original bytes from durable state even if the worker or converter changed.
        with TemporaryDirectory() as directory:
            for item, file_id in zip(manifest["artifacts"], file_ids[:2], strict=True):
                name = item["name"]
                phase = f"{item['format']}_readback"
                already_verified = connection.execute(
                    "SELECT 1 FROM event WHERE request_id=? AND stage=? LIMIT 1",
                    (request_id, phase)).fetchone() is not None
                store(connection, request_id, f"{item['format']}_pending", detail={"file_id": file_id})
                received, receipt = upload_and_read(drive, file_id, name, item["mime"], folder,
                                                     payloads[name], already_verified=already_verified)
                (Path(directory) / name).write_bytes(received)
                receipts[name] = receipt
                store(connection, request_id, phase, detail={"file_id": file_id, "sha256": digest(received)})
            phase = "verify_publication"
            if not verify_publication(manifest, receipts, directory):
                raise PublicationError("Publication manifest verification failed")
        receipt_name = f"DFG-002_{request_id}_receipt.json"
        receipt_payload = state["receipt"]
        if receipt_payload is None:
            receipt_payload = (json.dumps(manifest, indent=2, sort_keys=True) + "\n").encode()
            connection.execute("UPDATE request SET receipt = ? WHERE id = ?", (receipt_payload, request_id))
            connection.commit()
        phase = "receipt_readback"
        already_verified = connection.execute(
            "SELECT 1 FROM event WHERE request_id=? AND stage='verified' LIMIT 1",
            (request_id,)).fetchone() is not None
        store(connection, request_id, "receipt_pending", detail={"file_id": file_ids[2]})
        _, receipt = upload_and_read(drive, file_ids[2], receipt_name, RECEIPT_MIME, folder,
                                     receipt_payload, already_verified=already_verified)
        receipt["sha256"] = digest(receipt_payload)
        check_folder(drive, folder)
        store(connection, request_id, "verified", detail=receipt)
        return {"manifest": json.loads(receipt_payload), "receipt_readback": receipt}
    except Exception as error:
        connection.rollback()
        reason = str(error) if isinstance(error, PublicationError) else type(error).__name__
        store(connection, request_id, "blocked", detail={"phase": phase, "reason": reason})
        raise PublicationError(f"{phase}: {reason}") from error


def events(connection, request_id):
    return [{**dict(row), "detail": json.loads(row["detail"])} for row in connection.execute(
        "SELECT * FROM event WHERE request_id = ? ORDER BY sequence", (request_id,))]


def runbook_events(connection, request_id):
    """Project checkpoints into inputs for the existing Test RunBook writer."""
    result = []
    for event in events(connection, request_id):
        stage = event["stage"]
        outcome = {"verified": "pass", "blocked": "blocked"}.get(stage, "informational")
        result.append({
            "p_project_key": "COMIND",
            "p_work_key": "DFG-002",
            "p_event_type": "verification" if stage == "verified" else "agent_update",
            "p_actor": "DocuForge Test Publisher",
            "p_summary": f"DFG-002 publication {stage}",
            "p_outcome": outcome,
            "p_source_system": "docuforge",
            "p_source_ref": f"docuforge:dfg-002:{request_id}:{event['sequence']}",
            "p_next_action": ("Publication verified" if stage == "verified" else
                              "Inspect the last checkpoint and rerun with the same request ID and state directory"),
            "p_occurred_at": event["occurred_at"],
            "p_details": {"request_id": request_id, "stage": stage, **event["detail"]},
        })
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--state-dir", type=Path, required=True)
    sub = parser.add_subparsers(dest="command", required=True)
    run = sub.add_parser("run")
    run.add_argument("request_id")
    run.add_argument("source", type=Path)
    run.add_argument("destination")
    run.add_argument("--office", default="soffice")
    status = sub.add_parser("events")
    status.add_argument("request_id")
    status.add_argument("--runbook", action="store_true", help="emit existing RunBook writer inputs")
    args = parser.parse_args()
    try:
        os.umask(0o077)
        args.state_dir.mkdir(mode=0o700, parents=True, exist_ok=True)
        directory = args.state_dir.stat()
        if directory.st_mode & 0o077 or directory.st_uid != os.geteuid():
            raise PublicationError("The state directory must be private and owned by the operator")
        with (args.state_dir / "publisher.lock").open("a") as lock:
            if args.command == "run":
                try:
                    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
                except BlockingIOError:
                    raise PublicationError("Publisher is already active in this state directory") from None
            with closing(open_state(args.state_dir / "publisher.sqlite3")) as connection:
                if args.command == "run":
                    allowed = os.environ.get("DOCUFORGE_TEST_FOLDER_ID")
                    if args.destination != allowed:
                        raise PublicationError("Destination is not the configured Test folder")
                    drive = Drive(os.environ.get("DOCUFORGE_DRIVE_ACCESS_TOKEN"))
                    with args.source.open("rb") as source:
                        result = publish(connection, drive, source.read(MAX_BYTES + 1),
                                         args.request_id, args.destination, args.office)
                else:
                    result = (runbook_events if args.runbook else events)(connection, args.request_id)
                print(json.dumps(result, indent=2))
    except (PublicationError, OSError, sqlite3.Error) as error:
        message = str(error) if isinstance(error, PublicationError) else type(error).__name__
        parser.exit(1, f"DocuForge blocked: {message}\n")


if __name__ == "__main__":
    main()
