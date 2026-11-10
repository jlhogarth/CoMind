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
if __name__ == "__main__":
    unittest.main()
