"""Recovery regressions, including an abrupt process exit after a successful create."""
from contextlib import closing
import json
import os
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

from drive import FOLDER_MIME, PublicationError
from manifest import build_manifest
from publish import events, open_state, publish, runbook_events

FOLDER = "private_test_folder"
REQUEST = "fixture-run-001"
SOURCE = b'{"title":"synthetic fixture"}'


class FixtureDrive:
    def __init__(self, root):
        self.root = root
        self.stop_after_create = False
        self.folder_shared = False

    def reserve(self, count):
        path = self.root / "reserve"
        with path.open("a") as log:
            log.write("reserve\n")
        return [f"fixture-id-{i}" for i in range(count)]

    def metadata(self, file_id):
        if file_id == FOLDER:
            return {"id": FOLDER, "mimeType": FOLDER_MIME, "shared": self.folder_shared,
                    "trashed": False, "capabilities": {"canAddChildren": True}}
        entry = self.root / f"{file_id}.json"
        return json.loads(entry.read_text()) if entry.exists() else None

    def create(self, file_id, name, mime, folder, payload):
        if self.metadata(file_id):
            raise AssertionError("duplicate upload")
        (self.root / file_id).write_bytes(payload)
        (self.root / f"{file_id}.json").write_text(json.dumps({
            "id": file_id, "name": name, "mimeType": mime, "parents": [folder],
            "shared": False, "trashed": False, "size": len(payload),
        }))
        if self.stop_after_create:
            os._exit(71)

    def read(self, file_id, size):
        return (self.root / file_id).read_bytes()


def prepared(source, engine, request_id, folder):
    payloads = {"fixture.docx": b"synthetic word", "fixture.pdf": b"synthetic pdf"}
    with TemporaryDirectory() as directory:
        paths = []
        for name, payload in payloads.items():
            path = Path(directory) / name
            path.write_bytes(payload)
            paths.append(path)
        manifest = build_manifest("DFG-FIXTURE", "1", [], paths,
                                  destinations=[{"folder_id": folder}],
                                  editable_sources={"fixture.pdf": "fixture.docx"},
                                  validation={name: [{"status": "PASS"}] for name in payloads})
    return manifest, payloads


class PublishTests(unittest.TestCase):
    def setUp(self):
        directory = TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.root = Path(directory.name)
        self.drive = FixtureDrive(self.root)
        self.db = self.root / "state.sqlite"
        patcher = patch("publish.prepare", side_effect=prepared)
        self.prepare = patcher.start()
        self.addCleanup(patcher.stop)

    def run_request(self, source=SOURCE):
        with closing(open_state(self.db)) as conn:
            return publish(conn, self.drive, source, REQUEST, FOLDER)

    def read_events(self):
        with closing(open_state(self.db)) as conn:
            return events(conn, REQUEST)

    def test_abrupt_exit_after_word_create_resumes_same_ids(self):
        pid = os.fork()
        if pid == 0:
            self.drive.stop_after_create = True
            self.run_request()
            os._exit(72)
        _, status = os.waitpid(pid, 0)
        self.assertEqual(os.waitstatus_to_exitcode(status), 71)
        self.assertEqual(self.read_events()[-1]["stage"], "docx_pending")
        self.assertEqual(len(list(self.root.glob("fixture-id-*.json"))), 1)
        word = self.drive.metadata("fixture-id-0")
        result = self.run_request()
        self.assertEqual(result["manifest"]["publication"]["status"], "verified")
        self.assertEqual(result["receipt_readback"]["file_id"], "fixture-id-2")
        self.assertEqual(word, self.drive.metadata("fixture-id-0"))
        self.assertEqual(len(list(self.root.glob("fixture-id-*.json"))), 3)
        self.assertEqual((self.root / "reserve").read_text().splitlines(), ["reserve"])
        replay = self.run_request()
        self.assertEqual(replay["manifest"], result["manifest"])
        self.assertEqual(replay["receipt_readback"]["sha256"], result["receipt_readback"]["sha256"])
        self.prepare.assert_not_called()

    def test_tampering_is_a_block_and_never_creates_replacement(self):
        self.run_request()
        (self.root / "fixture-id-0").write_bytes(b"synthetic WORD")
        with self.assertRaisesRegex(PublicationError, "SHA-256 mismatch"):
            self.run_request()
        self.assertEqual(self.read_events()[-1]["stage"], "blocked")
        self.assertEqual(self.read_events()[-1]["detail"]["phase"], "docx_readback")
        with closing(open_state(self.db)) as conn:
            ledger = runbook_events(conn, REQUEST)
        self.assertEqual(ledger[-1]["p_outcome"], "blocked")
        self.assertEqual(ledger[-1]["p_work_key"], "DFG-002")
        self.assertEqual(ledger[-1]["p_source_system"], "manual")
        self.assertEqual(len({e["p_source_ref"] for e in ledger}), len(ledger))
        self.assertEqual(len(list(self.root.glob("fixture-id-*.json"))), 3)

    def test_source_change_is_rejected(self):
        self.run_request()
        with self.assertRaisesRegex(PublicationError, "different source or destination"):
            self.run_request(SOURCE + b" ")

    def test_wrong_folder_or_sharing_blocks_publication(self):
        self.drive.folder_shared = True
        with self.assertRaisesRegex(PublicationError, "shared"):
            self.run_request()
        self.assertFalse((self.root / "reserve").exists())
        self.drive.folder_shared = False
        self.run_request()
        file = self.root / "fixture-id-0.json"
        info = json.loads(file.read_text())
        file.write_text(json.dumps({**info, "parents": ["wrong_folder"]}))
        with self.assertRaisesRegex(PublicationError, "metadata mismatch"):
            self.run_request()

    def test_missing_verified_file_is_not_recreated(self):
        self.run_request()
        (self.root / "fixture-id-0.json").unlink()
        with self.assertRaisesRegex(PublicationError, "metadata mismatch"):
            self.run_request()
        self.assertIsNone(self.drive.metadata("fixture-id-0"))
