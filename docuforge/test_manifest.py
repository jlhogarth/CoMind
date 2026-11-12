import json
import tempfile
import unittest
from pathlib import Path
from manifest import build_manifest, registry, verify_manifest

class RegistryTests(unittest.TestCase):
    def test_required_formats(self):
        self.assertTrue({"docx", "pdf", "pptx", "xlsx", "svg", "md"}.issubset(registry()))
    def test_manifest_detects_tampering(self):
        with tempfile.TemporaryDirectory() as directory:
            p = Path(directory) / "test.md"
            p.write_text("evidence", encoding="utf-8")
            manifest = build_manifest("DFG-001", "0.1", [], [p])
            self.assertTrue(verify_manifest(manifest, directory))
            p.write_text("tampered", encoding="utf-8")
            self.assertFalse(verify_manifest(manifest, directory))
    def test_rejects_unknown_format(self):
        with tempfile.TemporaryDirectory() as directory:
            p = Path(directory) / "test.exe"
            p.write_bytes(b"x")
            with self.assertRaises(ValueError):
                build_manifest("DFG-001", "0.1", [], [p])

class PublicationTests(unittest.TestCase):
    def setUp(self):
        from manifest import sha256
        self.workspace = tempfile.TemporaryDirectory()
        self.addCleanup(self.workspace.cleanup)
        self.directory = Path(self.workspace.name)
        self.word = self.directory / "source.docx"
        self.pdf = self.directory / "publication.pdf"
        self.word.write_bytes(b"synthetic editable source")
        self.pdf.write_bytes(b"synthetic PDF")
        self.manifest = build_manifest(
            "DFG-001", "0.2", [{"ref": "test fixture", "sha256": sha256(self.word)}],
            [self.word, self.pdf], destinations=[{"folder_id": "fixture-folder"}],
            title="Test package", editable_sources={self.pdf.name: self.word.name},
            validation={p.name: [{"status": "PASS", "check": "synthetic test"}]
                        for p in (self.word, self.pdf)},
        )
        self.receipts = {
            item["name"]: {"file_id": f"fixture-file-{i}", "folder_id": "fixture-folder",
                           "authenticated": True, "retrieved_utc": "2026-01-01T00:00:00Z",
                           "mime": item["mime"], "bytes": item["bytes"]}
            for i, item in enumerate(self.manifest["artifacts"])
        }

    def test_valid_publication_and_editable_source_link(self):
        from manifest import verify_publication
        self.assertTrue(verify_publication(self.manifest, self.receipts, self.directory))
        self.assertEqual(self.manifest["publication"]["status"], "verified")
        self.assertEqual(self.manifest["artifacts"][1]["editable_source"], self.word.name)

    def test_failed_readback_clears_previously_verified_publication(self):
        from manifest import verify_publication
        self.assertTrue(verify_publication(self.manifest, self.receipts, self.directory))
        self.pdf.write_bytes(b"mismatch")
        self.assertFalse(verify_publication(self.manifest, self.receipts, self.directory))
        self.assertEqual(self.manifest["publication"]["status"], "failed")
        self.assertTrue(all(item["drive"] is None for item in self.manifest["artifacts"]))

    def test_metadata_and_failed_visual_check_block_publication(self):
        from manifest import verify_publication
        self.receipts[self.pdf.name]["folder_id"] = "wrong-folder"
        self.assertFalse(verify_publication(self.manifest, self.receipts, self.directory))
        self.receipts[self.pdf.name]["folder_id"] = "fixture-folder"
        self.manifest["artifacts"][1]["validation"]["status"] = "failed"
        self.assertFalse(verify_publication(self.manifest, self.receipts, self.directory))

    def test_missing_and_duplicate_artifacts_are_rejected(self):
        self.pdf.unlink()
        self.assertFalse(verify_manifest(self.manifest, self.directory))
        with self.assertRaisesRegex(ValueError, "Missing"):
            build_manifest("DFG-001", "0.2", [], [self.pdf])
        with self.assertRaisesRegex(ValueError, "Duplicate"):
            build_manifest("DFG-001", "0.2", [], [self.word, self.word])

    def test_empty_and_unsafe_manifests_are_rejected(self):
        self.assertFalse(verify_manifest({**self.manifest, "artifacts": []}, self.directory))
        self.manifest["artifacts"][0]["name"] = "../source.docx"
        self.assertFalse(verify_manifest(self.manifest, self.directory))

    def test_malformed_registry_and_complete_coverage(self):
        from unittest.mock import patch
        data = registry()
        self.assertEqual(set(data), set("docx pdf pptx xlsx csv svg png jpg jpeg md html".split()))
        data["pdf"]["editable"] = "false"
        invalid = self.directory / "registry.json"
        invalid.write_text(json.dumps({"schema_version": "1.0.0", "formats": data}))
        with patch("manifest.REGISTRY", invalid), self.assertRaisesRegex(ValueError, "Malformed"):
            registry()


if __name__ == "__main__":
    unittest.main()
