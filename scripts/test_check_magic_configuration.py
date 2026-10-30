#!/usr/bin/env python3
from __future__ import annotations

import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path

MODULE_PATH = Path(__file__).with_name("check_magic_configuration.py")
SPEC = importlib.util.spec_from_file_location("check_magic_configuration", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = MODULE
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class MagicConfigurationTests(unittest.TestCase):
    def make_root(self) -> tuple[tempfile.TemporaryDirectory[str], Path]:
        temp = tempfile.TemporaryDirectory()
        root = Path(temp.name)
        (root / "server" / "src").mkdir(parents=True)
        return temp, root

    def write_runtime(self, root: Path, text: str, name: str = "app.ts") -> Path:
        path = root / "server" / "src" / name
        path.write_text(text, encoding="utf-8")
        return path

    def test_operational_env_fallback_is_candidate(self) -> None:
        temp, root = self.make_root(); self.addCleanup(temp.cleanup)
        self.write_runtime(root, "const port = Number(process.env.PORT ?? 3100);\n")
        findings = MODULE.scan(root)
        self.assertEqual(1, len(findings))
        self.assertEqual("runtime-env-fallback", findings[0].detector)
        self.assertEqual("candidate", findings[0].classification)

    def test_non_operational_env_fallback_is_not_candidate(self) -> None:
        temp, root = self.make_root(); self.addCleanup(temp.cleanup)
        self.write_runtime(root, "const greeting = process.env.GREETING || 'hello';\n")
        self.assertEqual([], MODULE.scan(root))

    def test_required_env_without_fallback_is_not_candidate(self) -> None:
        temp, root = self.make_root(); self.addCleanup(temp.cleanup)
        self.write_runtime(root, "const url = required(process.env.DATABASE_URL);\n")
        self.assertEqual([], MODULE.scan(root))

    def test_connection_oriented_http_literal_is_candidate(self) -> None:
        temp, root = self.make_root(); self.addCleanup(temp.cleanup)
        self.write_runtime(root, "const baseUrl = 'http://127.0.0.1:3100/api';\n")
        findings = MODULE.scan(root)
        self.assertEqual(1, len(findings))
        self.assertEqual("runtime-http-literal", findings[0].detector)

    def test_navigation_http_literal_is_not_candidate(self) -> None:
        temp, root = self.make_root(); self.addCleanup(temp.cleanup)
        self.write_runtime(root, "const link = { href: 'https://github.com/openai/openai' };\n", "page.tsx")
        self.assertEqual([], MODULE.scan(root))

    def test_provenance_source_url_is_not_candidate(self) -> None:
        temp, root = self.make_root(); self.addCleanup(temp.cleanup)
        self.write_runtime(root, "export const RATE_CARD_SOURCE = 'https://developers.openai.com/api/docs/pricing';\n", "rate-card.ts")
        self.assertEqual([], MODULE.scan(root))

    def test_test_file_is_excluded(self) -> None:
        temp, root = self.make_root(); self.addCleanup(temp.cleanup)
        test_dir = root / "server" / "test"; test_dir.mkdir(parents=True)
        (test_dir / "runtime.test.ts").write_text("const port = process.env.PORT ?? 3100;\n", encoding="utf-8")
        self.assertEqual([], MODULE.scan(root))

    def test_fixture_file_is_excluded(self) -> None:
        temp, root = self.make_root(); self.addCleanup(temp.cleanup)
        fixture_dir = root / "server" / "src" / "fixtures"; fixture_dir.mkdir(parents=True)
        (fixture_dir / "config.ts").write_text("const baseUrl = 'http://127.0.0.1:3100';\n", encoding="utf-8")
        self.assertEqual([], MODULE.scan(root))

    def test_config_surface_is_excluded(self) -> None:
        temp, root = self.make_root(); self.addCleanup(temp.cleanup)
        self.write_runtime(root, "export const port = process.env.PORT ?? 3100;\n", "config.ts")
        self.assertEqual([], MODULE.scan(root))

    def test_fingerprint_is_stable_across_line_movement(self) -> None:
        first = MODULE.candidate(detector="runtime-env-fallback", path=Path("server/src/app.ts"), line=1, target="PORT:3100", evidence="x", message="x")
        second = MODULE.candidate(detector="runtime-env-fallback", path=Path("server/src/app.ts"), line=20, target="PORT:3100", evidence="x", message="x")
        self.assertEqual(first.fingerprint, second.fingerprint)

    def test_json_output_is_nonblocking_shadow(self) -> None:
        temp, root = self.make_root(); self.addCleanup(temp.cleanup)
        self.write_runtime(root, "const port = process.env.PORT ?? 3100;\n")
        output = root / "nmc.json"
        self.assertEqual(0, MODULE.main([str(root), "--output", str(output)]))
        payload = json.loads(output.read_text(encoding="utf-8"))
        self.assertEqual("NMC-001", payload["control_id"])
        self.assertEqual("shadow", payload["mode"])
        self.assertEqual(1, payload["candidate_count"])
        self.assertEqual(0, payload["blocking_count"])


if __name__ == "__main__":
    unittest.main()
