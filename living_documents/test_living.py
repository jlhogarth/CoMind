import copy
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from living_documents import LivingDocument, Reader, digest


ROOT = Path(__file__).resolve().parents[1]
MANIFEST = json.loads((ROOT / "living_documents/platform_overview.json").read_text())
SOURCE = MANIFEST["sources"][0]["id"]
PUBLIC = Reader("reader-a", frozenset([SOURCE]), frozenset(["public"]), "grant-v1")


class LivingProof(unittest.TestCase):
    def test_three_audiences_cache_snapshot_and_source_revision(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root / "README.md").write_bytes((ROOT / "README.md").read_bytes())
            doc = LivingDocument(MANIFEST, root)
            rendered = [doc.render(PUBLIC, audience, depth=2) for audience in
                        ("strategic", "technical", "public")]
            for item in rendered:
                self.assertIn(MANIFEST["sources"][0]["approved_excerpt"], item["content"])
                self.assertEqual(item["mode"], "L1")
                self.assertEqual(item["verification"], "deterministic_source_excerpt")
            self.assertTrue(doc.render(PUBLIC, "public", depth=2)["cache_hit"])
            self.assertFalse(doc.render(Reader("reader-b", PUBLIC.allowed_sources,
                PUBLIC.allowed_classes, "grant-v1"), "public", depth=2)["cache_hit"])
            receipt = doc.snapshot(PUBLIC, rendered[2], root / "archive" / "overview.md")
            self.assertEqual(receipt["sha256"], digest((root / "archive/overview.md").read_bytes()))
            (root / "README.md").write_text((root / "README.md").read_text() + "\nControlled revision.\n")
            with self.assertRaisesRegex(ValueError, "source_revision_changed"):
                doc.render(PUBLIC, "public", depth=2)
            revised = copy.deepcopy(MANIFEST)
            revised["sources"][0]["sha256"] = digest((root / "README.md").read_bytes())
            revised["sources"][0]["revision"] = "controlled-test-revision"
            self.assertFalse(LivingDocument(revised, root).render(PUBLIC, "public", depth=2)["cache_hit"])

    def test_protected_marker_never_retrieved_for_public_reader(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root / "protected.txt").write_text("synthetic-protected-marker", encoding="utf-8")
            m = copy.deepcopy(MANIFEST)
            m["classification"] = "restricted"
            m["sources"] = [{"id": "synthetic:protected", "path": "protected.txt",
                "revision": "fixture-v1", "sha256": digest((root / "protected.txt").read_bytes()),
                "classification": "restricted", "approved_excerpt": "synthetic-protected-marker"}]
            with patch.object(LivingDocument, "_read", side_effect=AssertionError("retrieval occurred")):
                with self.assertRaises(PermissionError):
                    LivingDocument(m, root).render(PUBLIC, "public")
            with self.assertRaises(PermissionError):
                LivingDocument(m, root).render(Reader("internal", frozenset(["synthetic:protected"]),
                    frozenset(["restricted"]), "v1"), "public")

    def test_policy_revision_and_auth_scope_partition_cache(self):
        doc = LivingDocument(MANIFEST, ROOT)
        first = doc.render(PUBLIC, "technical")
        self.assertNotEqual(first["cache_key"], doc.render(Reader("reader-a", PUBLIC.allowed_sources,
            PUBLIC.allowed_classes, "grant-v2"), "technical")["cache_key"])
        changed = copy.deepcopy(MANIFEST)
        changed["policy_version"] = "GAM-001-v2"
        self.assertNotEqual(first["cache_key"], LivingDocument(changed, ROOT).render(PUBLIC, "technical")["cache_key"])
        with self.assertRaises(ValueError):
            doc.render(PUBLIC, "technical", language="fr")


if __name__ == "__main__":
    unittest.main()
