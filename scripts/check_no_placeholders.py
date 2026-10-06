#!/usr/bin/env python3
"""Reject unresolved development markers in deliverable repository files."""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path


SCANNED_SUFFIXES = {
    ".cjs",
    ".css",
    ".html",
    ".java",
    ".js",
    ".json",
    ".jsx",
    ".md",
    ".mjs",
    ".py",
    ".sql",
    ".toml",
    ".ts",
    ".tsx",
    ".yaml",
    ".yml",
}

EXCLUDED_DIRECTORY_NAMES = {
    ".git",
    ".next",
    ".pytest_cache",
    ".venv",
    "build",
    "coverage",
    "dist",
    "node_modules",
    "testdata",
}

EXCLUDED_PATH_PREFIXES = {"tests/fixtures"}

SELF_PATH = Path("scripts/check_no_placeholders.py")

PROHIBITED_PATTERNS = (
    ("unresolved marker", re.compile(r"\b(?:TODO|TBD|FIXME|CHANGEME|REPLACE_ME)\b")),
    ("unresolved named value", re.compile(r"\bYOUR_[A-Z0-9_]+_HERE\b")),
    ("example network address", re.compile(r"\b(?:example\.com|example\.org|example\.net)\b", re.IGNORECASE)),
    ("fabricated object name", re.compile(r"\b(?:example_table|dummy_uuid|placeholder_value)\b", re.IGNORECASE)),
    ("nil UUID", re.compile(r"\b00000000-0000-0000-0000-000000000000\b")),
)


def is_excluded(relative_path: Path) -> bool:
    normalized = relative_path.as_posix()
    return (
        any(part in EXCLUDED_DIRECTORY_NAMES for part in relative_path.parts)
        or any(
        normalized == directory or normalized.startswith(f"{directory}/")
        for directory in EXCLUDED_PATH_PREFIXES
        )
    )


def iter_files(root: Path):
    for path in root.rglob("*"):
        if not path.is_file():
            continue
        relative_path = path.relative_to(root)
        if relative_path == SELF_PATH or is_excluded(relative_path):
            continue
        if path.suffix.lower() in SCANNED_SUFFIXES:
            yield path, relative_path


def scan(root: Path) -> list[tuple[Path, int, str, str]]:
    findings: list[tuple[Path, int, str, str]] = []
    for path, relative_path in iter_files(root):
        try:
            lines = path.read_text(encoding="utf-8").splitlines()
        except UnicodeDecodeError:
            continue
        for line_number, line in enumerate(lines, start=1):
            for finding_type, pattern in PROHIBITED_PATTERNS:
                match = pattern.search(line)
                if match:
                    findings.append(
                        (relative_path, line_number, finding_type, match.group(0))
                    )
    return findings


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Fail when deliverable files contain unresolved development markers."
    )
    parser.add_argument("root", nargs="?", default=".", help="Repository root")
    arguments = parser.parse_args()
    root = Path(arguments.root).resolve()

    findings = scan(root)
    if not findings:
        print("No prohibited development markers found.")
        return 0

    for path, line_number, finding_type, matched_text in findings:
        print(f"{path}:{line_number}: {finding_type}: {matched_text}")
    print(f"Rejected: {len(findings)} prohibited development marker(s) found.")
    return 1


if __name__ == "__main__":
    sys.exit(main())

