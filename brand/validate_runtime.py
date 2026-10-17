from __future__ import annotations

from html.parser import HTMLParser
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parent

REQUIRED_FILES = {
    "tokens.css",
    "layout.css",
    "motion.css",
    "experience.css",
    "comind-brand.css",
    "demo.html",
    "lab.html",
    "lab.js",
    "sql/001_branding_manager_registry.sql",
    "sql/verify_branding_manager_registry.sql",
}

REQUIRED_IMPORTS = {
    './tokens.css',
    './layout.css',
    './motion.css',
    './experience.css',
}

REQUIRED_SCOPES = {
    "cognition",
    "operator",
    "governance",
    "success",
    "warning",
    "danger",
}

REQUIRED_EXPERIENCE_MODES = {
    "calm",
    "operational",
    "cinematic",
}


class LabParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.scopes: set[str] = set()
        self.modes: set[str] = set()
        self.stylesheets: set[str] = set()
        self.scripts: set[str] = set()
        self.has_main = False
        self.has_h1 = False
        self.has_progressbar = False

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attr = dict(attrs)
        if tag == "main":
            self.has_main = True
        if tag == "h1":
            self.has_h1 = True
        if attr.get("role") == "progressbar":
            self.has_progressbar = True
        if attr.get("data-comind-scope"):
            self.scopes.add(attr["data-comind-scope"] or "")
        if attr.get("data-set-scope"):
            self.scopes.add(attr["data-set-scope"] or "")
        if attr.get("data-set-experience"):
            self.modes.add(attr["data-set-experience"] or "")
        if tag == "link" and attr.get("rel") == "stylesheet" and attr.get("href"):
            self.stylesheets.add(attr["href"] or "")
        if tag == "script" and attr.get("src"):
            self.scripts.add(attr["src"] or "")


def fail(message: str) -> None:
    raise AssertionError(message)


def validate_files() -> None:
    missing = sorted(path for path in REQUIRED_FILES if not (ROOT / path).is_file())
    if missing:
        fail(f"Missing required brand runtime files: {', '.join(missing)}")


def validate_import_graph() -> None:
    css = (ROOT / "comind-brand.css").read_text(encoding="utf-8")
    imports = set(re.findall(r'@import\s+url\(["\']([^"\']+)["\']\)', css))
    if imports != REQUIRED_IMPORTS:
        fail(f"Unexpected aggregate CSS import graph: {sorted(imports)}")


def validate_lab_html() -> None:
    parser = LabParser()
    parser.feed((ROOT / "lab.html").read_text(encoding="utf-8"))
    parser.close()

    if not parser.has_main or not parser.has_h1:
        fail("Experience Lab must contain semantic main and h1 elements")
    if not parser.has_progressbar:
        fail("Experience Lab must expose simulation progress semantics")
    if not REQUIRED_SCOPES.issubset(parser.scopes):
        fail(f"Experience Lab is missing semantic scopes: {sorted(REQUIRED_SCOPES - parser.scopes)}")
    if parser.modes != REQUIRED_EXPERIENCE_MODES:
        fail(f"Experience Lab modes do not match the runtime contract: {sorted(parser.modes)}")
    if parser.stylesheets != {"./comind-brand.css"}:
        fail(f"Experience Lab must consume only the aggregate brand CSS entry point: {sorted(parser.stylesheets)}")
    if parser.scripts != {"./lab.js"}:
        fail(f"Experience Lab script contract changed unexpectedly: {sorted(parser.scripts)}")


def validate_no_remote_runtime_dependencies() -> None:
    runtime_files = [
        ROOT / "tokens.css",
        ROOT / "layout.css",
        ROOT / "motion.css",
        ROOT / "experience.css",
        ROOT / "comind-brand.css",
        ROOT / "lab.html",
        ROOT / "lab.js",
    ]
    remote_pattern = re.compile(r"https?://", re.IGNORECASE)
    offenders = [path.name for path in runtime_files if remote_pattern.search(path.read_text(encoding="utf-8"))]
    if offenders:
        fail(f"Remote runtime dependency detected in: {', '.join(offenders)}")


def validate_sql_contract() -> None:
    schema = (ROOT / "sql/001_branding_manager_registry.sql").read_text(encoding="utf-8")
    verification = (ROOT / "sql/verify_branding_manager_registry.sql").read_text(encoding="utf-8")

    required_schema_fragments = {
        "REVOKE ALL ON SCHEMA comind_brand FROM PUBLIC",
        "brand_profile_one_accepted_version",
        "brand_event_append_only_update",
        "brand_profile_version_guard",
        "application_binding_guard",
        "accepted_profile_catalog",
        "application_brand_catalog",
    }
    for fragment in required_schema_fragments:
        if fragment not in schema:
            fail(f"Brand registry schema is missing required contract fragment: {fragment}")

    if not verification.lstrip().startswith("BEGIN;") or not verification.rstrip().endswith("ROLLBACK;"):
        fail("Brand registry verification must be transactionally isolated with BEGIN/ROLLBACK")


def main() -> int:
    checks = [
        validate_files,
        validate_import_graph,
        validate_lab_html,
        validate_no_remote_runtime_dependencies,
        validate_sql_contract,
    ]
    for check in checks:
        check()
        print(f"PASS {check.__name__}")
    print("PASS CoMind Brand Runtime static validation")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except AssertionError as exc:
        print(f"FAIL {exc}", file=sys.stderr)
        raise SystemExit(1)
