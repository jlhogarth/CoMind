#!/usr/bin/env python3
"""IIC-006 conservative, read-only retry and cleanup candidate detector.

Heuristic signals are candidates, never verified violations. The scanning scope
is GitHub Actions run blocks and package.json scripts. This does not claim
control-flow proof across workflow steps, runtime functions, or external systems.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from dataclasses import asdict, dataclass
from pathlib import Path

from check_implementation_integrity import extract_run_blocks, iter_package_json, iter_workflows

RETRY_COMMAND = re.compile(r"\bgh\s+run\s+rerun\b|\bcurl\s+[^;\n]*?--retry(?:=|\s+)(\S+)")
TEMP_RESOURCE = re.compile(r"\bmktemp\s+-d\b|\bdocker\s+run\s+(?:[^\n;]*\s)?-d(?:\s|$)")
CLEANUP = re.compile(r"\btrap\b|\brm\s+-r[f]?\b|\brm\s+-f?r\b|\bdocker\s+(?:rm|stop)\b")
CONTROL_CONTEXT = re.compile(r"\b(?:max.attempts|max.retries|retry.limit|retry.count|idempotenc|fenc|backoff|stop.condition)\b", re.I)

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
    observed_controls: tuple[str, ...]
    limitation: str
    fingerprint: str

def candidate(control_id: str, detector: str, path: str, line: int, target: str,
              evidence: str, observed_controls: tuple[str, ...] = ()) -> Candidate:
    digest = hashlib.sha256("|".join((control_id, detector, path, target)).encode()).hexdigest()[:24]
    return Candidate(control_id, detector, "candidate", "warning", path, line, target,
                     evidence[:240], observed_controls,
                     "Static local signal only; inspect full lifecycle and authoritative owner evidence.", digest)

def scan_command(path: str, line: int, body: str, scope: str) -> list[Candidate]:
    results: list[Candidate] = []
    controls = tuple(
        label for label, present in (
            ("bound-or-idempotency-token", bool(CONTROL_CONTEXT.search(body))),
            ("cleanup-token", bool(CLEANUP.search(body))),
        ) if present
    )
    for index, raw in enumerate(body.splitlines()):
        stripped = raw.strip()
        if not stripped or stripped.startswith("#"):
            continue
        for match in RETRY_COMMAND.finditer(raw):
            token = match.group(1)
            if token is not None and token.isdecimal() and 0 < int(token) <= 10:
                continue
            results.append(candidate("NRC-001", "retry-command-review", path, line + index,
                                     scope + ":" + match.group(0).strip(), stripped, controls))
        for match in TEMP_RESOURCE.finditer(raw):
            if CLEANUP.search(body):
                continue
            results.append(candidate("NCI-001", "temporary-resource-lifecycle", path, line + index,
                                     scope + ":" + match.group(0).strip(), stripped, controls))
    return results

def scan(root: Path) -> list[Candidate]:
    results: list[Candidate] = []
    for path in iter_workflows(root):
        lines = path.read_text(encoding="utf-8").splitlines()
        rel = path.relative_to(root).as_posix()
        for line, body in extract_run_blocks(lines):
            results.extend(scan_command(rel, line, body, "workflow"))
    for path in iter_package_json(root):
        rel = path.relative_to(root).as_posix()
        try:
            scripts = json.loads(path.read_text(encoding="utf-8")).get("scripts", {})
        except (json.JSONDecodeError, UnicodeDecodeError):
            continue
        if not isinstance(scripts, dict):
            continue
        for name, body in scripts.items():
            if isinstance(body, str):
                results.extend(scan_command(rel, 1, body, "script:" + name))
    unique = {v.fingerprint: v for v in results}
    return sorted(unique.values(), key=lambda v: (v.control_id, v.path, v.line, v.target))

def report(findings: list[Candidate]) -> str:
    return json.dumps({
        "schema_version": 1, "lane": "IIC", "component": "retry-cleanup-integrity",
        "mode": "shadow", "scope": ["workflow-run", "package-script"],
        "candidate_count": len(findings), "blocking_count": 0,
        "counts": {cid: sum(x.control_id == cid for x in findings)
                   for cid in ("NRC-001", "NCI-001")},
        "findings": [asdict(v) for v in findings]
    }, indent=2, sort_keys=True)

def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("root", nargs="?", default=".")
    parser.add_argument("--output", type=Path)
    args = parser.parse_args(argv)
    root = Path(args.root).resolve()
    if not root.is_dir():
        print("IIC-006: invalid repository root", file=sys.stderr)
        return 2
    try:
        output = report(scan(root))
        if args.output:
            args.output.parent.mkdir(parents=True, exist_ok=True)
            args.output.write_text(output + "\n", encoding="utf-8")
        print(output)
    except (OSError, ValueError) as exc:
        print("IIC-006 scanner error: " + str(exc), file=sys.stderr)
        return 2
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
