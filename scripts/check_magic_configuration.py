#!/usr/bin/env python3
"""NMC-001 No Magic Configuration shadow detector.

The detector is intentionally conservative. It reports review candidates for
consequential runtime configuration that is statically embedded as an
operational fallback or literal network endpoint. It does not rewrite code,
claim a violation, or block acceptance in this maturity state.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Iterable

SOURCE_SUFFIXES = {".ts", ".tsx", ".js", ".mjs", ".cjs"}
EXCLUDED_PARTS = {
    ".git",
    ".next",
    "build",
    "coverage",
    "dist",
    "docs",
    "fixtures",
    "node_modules",
    "scripts",
    "test",
    "tests",
}
OPERATIONAL_ENV_HINTS = (
    "URL",
    "URI",
    "HOST",
    "PORT",
    "MODEL",
    "PROVIDER",
    "ENV",
    "ENVIRONMENT",
    "TIMEOUT",
    "RETRY",
    "AUTHORITY",
    "PURPOSE",
    "ENDPOINT",
    "REGION",
)
ENV_FALLBACK_RE = re.compile(
    r"process\.env\.(?P<name>[A-Z][A-Z0-9_]*)[^\n;]{0,120}?(?:\?\?|\|\|)\s*(?P<value>(?:['\"][^'\"]+['\"]|\d+(?:\.\d+)?|true|false))"
)
HTTP_LITERAL_RE = re.compile(r"(?P<quote>['\"])(?P<url>https?://[^'\"\s]+)(?P=quote)")


@dataclass(frozen=True)
class Candidate:
    control_id: str
    detector: str
    classification: str
    severity: str
    path: str
    line: int
    target: str
    evidence: str
    message: str
    fingerprint: str


def fingerprint(detector: str, path: str, target: str) -> str:
    payload = f"NMC-001|{detector}|{path}|{target}".encode("utf-8")
    return hashlib.sha256(payload).hexdigest()[:24]


def candidate(*, detector: str, path: Path, line: int, target: str, evidence: str, message: str) -> Candidate:
    normalized = path.as_posix()
    return Candidate(
        control_id="NMC-001",
        detector=detector,
        classification="candidate",
        severity="warning",
        path=normalized,
        line=line,
        target=target,
        evidence=evidence.strip()[:300],
        message=message,
        fingerprint=fingerprint(detector, normalized, target),
    )


def is_runtime_source(relative: Path) -> bool:
    if relative.suffix.lower() not in SOURCE_SUFFIXES:
        return False
    lowered = [part.lower() for part in relative.parts]
    if any(part in EXCLUDED_PARTS for part in lowered):
        return False
    name = relative.name.lower()
    if any(token in name for token in (".test.", ".spec.", "fixture")):
        return False
    if name.startswith("config.") or name.endswith(".config.ts") or name.endswith(".config.js"):
        return False
    return True


def iter_runtime_sources(root: Path) -> Iterable[Path]:
    for path in sorted(root.rglob("*")):
        if not path.is_file():
            continue
        relative = path.relative_to(root)
        if is_runtime_source(relative):
            yield path


def is_consequential_env(name: str) -> bool:
    upper = name.upper()
    return any(hint in upper for hint in OPERATIONAL_ENV_HINTS)


def scan(root: Path) -> list[Candidate]:
    findings: list[Candidate] = []
    for source in iter_runtime_sources(root):
        relative = source.relative_to(root)
        try:
            text = source.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue
        for line_number, raw_line in enumerate(text.splitlines(), start=1):
            line = raw_line.strip()
            if not line or line.startswith("//"):
                continue

            for match in ENV_FALLBACK_RE.finditer(raw_line):
                name = match.group("name")
                if not is_consequential_env(name):
                    continue
                value = match.group("value")
                findings.append(
                    candidate(
                        detector="runtime-env-fallback",
                        path=relative,
                        line=line_number,
                        target=f"{name}:{value}",
                        evidence=line,
                        message=(
                            "Consequential runtime environment variable has a literal fallback; "
                            "review whether the default is an explicit governed contract."
                        ),
                    )
                )

            for match in HTTP_LITERAL_RE.finditer(raw_line):
                url = match.group("url")
                findings.append(
                    candidate(
                        detector="runtime-http-literal",
                        path=relative,
                        line=line_number,
                        target=url,
                        evidence=line,
                        message=(
                            "Runtime source contains a literal HTTP endpoint; review whether "
                            "endpoint ownership belongs in governed configuration."
                        ),
                    )
                )

    unique = {item.fingerprint: item for item in findings}
    return sorted(
        unique.values(),
        key=lambda item: (item.path, item.line, item.detector, item.target),
    )


def render_json(findings: list[Candidate]) -> str:
    return json.dumps(
        {
            "schema_version": 1,
            "lane": "IIC",
            "component": "no-magic-configuration",
            "control_id": "NMC-001",
            "mode": "shadow",
            "finding_count": len(findings),
            "candidate_count": len(findings),
            "blocking_count": 0,
            "findings": [asdict(item) for item in findings],
        },
        indent=2,
        sort_keys=True,
    )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Run NMC-001 No Magic Configuration shadow detection.")
    parser.add_argument("root", nargs="?", default=".")
    parser.add_argument("--output", type=Path)
    args = parser.parse_args(argv)
    root = Path(args.root).resolve()
    if not root.is_dir():
        print(f"NMC-001 error: repository root is not a directory: {root}", file=sys.stderr)
        return 2
    try:
        rendered = render_json(scan(root))
    except OSError as exc:
        print(f"NMC-001 error: {exc}", file=sys.stderr)
        return 2
    print(rendered)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(rendered + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
