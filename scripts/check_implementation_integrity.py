#!/usr/bin/env python3
"""CoMind hard implementation-integrity control engine.

IIC-001 begins in shadow mode. Findings are reported deterministically, while
only engine failures are blocking. Enforcement can later reject unbaselined
findings without changing detector semantics.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import shlex
import sys
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Iterable


EXCLUDED_DIRECTORY_NAMES = {
    ".git",
    ".next",
    ".pytest_cache",
    ".venv",
    "build",
    "coverage",
    "dist",
    "node_modules",
}

WORKFLOW_SUFFIXES = {".yml", ".yaml"}
LOCAL_COMMANDS = {"python", "python3", "node", "bash", "sh"}
SCRIPT_SUFFIXES = {".py", ".js", ".mjs", ".cjs", ".sh", ".ts", ".tsx"}
DYNAMIC_MARKERS = ("$", "{", "}", "*", "?")


@dataclass(frozen=True)
class Finding:
    control_id: str
    detector: str
    severity: str
    path: str
    line: int
    target: str
    message: str
    fingerprint: str


def fingerprint(control_id: str, detector: str, path: str, target: str) -> str:
    payload = "|".join((control_id, detector, path, target)).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()[:24]


def finding(*, detector: str, path: Path, line: int, target: str, message: str) -> Finding:
    normalized_path = path.as_posix()
    return Finding(
        control_id="NDT-001",
        detector=detector,
        severity="error",
        path=normalized_path,
        line=line,
        target=target,
        message=message,
        fingerprint=fingerprint("NDT-001", detector, normalized_path, target),
    )


def is_excluded(path: Path) -> bool:
    return any(part in EXCLUDED_DIRECTORY_NAMES for part in path.parts)


def iter_workflows(root: Path) -> Iterable[Path]:
    workflow_root = root / ".github" / "workflows"
    if not workflow_root.is_dir():
        return []
    return sorted(
        path
        for path in workflow_root.rglob("*")
        if path.is_file() and path.suffix.lower() in WORKFLOW_SUFFIXES
    )


def literal_local_action_target(raw_target: str) -> str | None:
    target = raw_target.strip().strip("'\"")
    if not target.startswith("./") or any(marker in target for marker in DYNAMIC_MARKERS):
        return None
    return target[2:]


def action_target_exists(root: Path, target: str) -> bool:
    candidate = (root / target).resolve()
    try:
        candidate.relative_to(root.resolve())
    except ValueError:
        return False
    if candidate.is_file():
        return True
    return candidate.is_dir() and any(
        (candidate / filename).is_file() for filename in ("action.yml", "action.yaml")
    )


def extract_run_blocks(lines: list[str]) -> list[tuple[int, str]]:
    """Extract literal run bodies without requiring a YAML dependency."""
    blocks: list[tuple[int, str]] = []
    for index, line in enumerate(lines):
        match = re.match(r"^(?P<indent>\s*)(?:-\s*)?run:\s*(?P<body>.*)$", line)
        if not match:
            continue
        indent = len(match.group("indent"))
        body = match.group("body").strip()
        start_line = index + 1
        if body and body not in {"|", ">", "|-", ">-", "|+", ">+"}:
            blocks.append((start_line, body))
            continue
        collected: list[str] = []
        for nested in lines[index + 1 :]:
            if not nested.strip():
                collected.append("")
                continue
            nested_indent = len(nested) - len(nested.lstrip())
            if nested_indent <= indent:
                break
            collected.append(nested.strip())
        blocks.append((start_line, "\n".join(collected)))
    return blocks


def static_command_targets(command_text: str) -> list[str]:
    """Return statically knowable repository-relative executable operands."""
    targets: list[str] = []
    for raw_line in command_text.splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        try:
            tokens = shlex.split(line, comments=True, posix=True)
        except ValueError:
            continue
        if not tokens:
            continue
        command_index = 0
        while command_index < len(tokens) and re.fullmatch(
            r"[A-Za-z_][A-Za-z0-9_]*=.*", tokens[command_index]
        ):
            command_index += 1
        if command_index >= len(tokens):
            continue
        command = Path(tokens[command_index]).name
        if command in LOCAL_COMMANDS:
            operand = None
            for token in tokens[command_index + 1 :]:
                if token.startswith("-"):
                    continue
                operand = token
                break
            if operand is None or any(marker in operand for marker in DYNAMIC_MARKERS):
                continue
            candidate = operand[2:] if operand.startswith("./") else operand
            if "/" in candidate and Path(candidate).suffix.lower() in SCRIPT_SUFFIXES:
                targets.append(candidate)
        elif tokens[command_index].startswith("./"):
            operand = tokens[command_index][2:]
            if not any(marker in operand for marker in DYNAMIC_MARKERS):
                targets.append(operand)
    return targets


def scan_workflows(root: Path) -> list[Finding]:
    findings: list[Finding] = []
    for workflow in iter_workflows(root):
        relative = workflow.relative_to(root)
        text = workflow.read_text(encoding="utf-8")
        lines = text.splitlines()

        for line_number, line in enumerate(lines, start=1):
            match = re.match(r"^\s*(?:-\s*)?uses:\s*(.+?)\s*$", line)
            if not match:
                continue
            target = literal_local_action_target(match.group(1))
            if target is None:
                continue
            if not action_target_exists(root, target):
                findings.append(
                    finding(
                        detector="workflow-local-use",
                        path=relative,
                        line=line_number,
                        target=target,
                        message="Literal local workflow/action target does not resolve.",
                    )
                )

        # A workflow-level or step-level working directory changes command
        # resolution semantics. Skip run-path checks rather than infer scope.
        if re.search(r"^\s*(?:-\s*)?working-directory\s*:", text, re.MULTILINE):
            continue

        for line_number, body in extract_run_blocks(lines):
            for target in static_command_targets(body):
                candidate = (root / target).resolve()
                try:
                    candidate.relative_to(root.resolve())
                except ValueError:
                    exists = False
                else:
                    exists = candidate.is_file()
                if not exists:
                    findings.append(
                        finding(
                            detector="workflow-run-path",
                            path=relative,
                            line=line_number,
                            target=target,
                            message="Literal repository-relative executable path does not resolve.",
                        )
                    )
    return findings


def iter_package_json(root: Path) -> Iterable[Path]:
    return sorted(
        path
        for path in root.rglob("package.json")
        if path.is_file() and not is_excluded(path.relative_to(root))
    )


def scan_package_scripts(root: Path) -> list[Finding]:
    findings: list[Finding] = []
    for package_file in iter_package_json(root):
        relative = package_file.relative_to(root)
        try:
            payload = json.loads(package_file.read_text(encoding="utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            continue
        scripts = payload.get("scripts")
        if not isinstance(scripts, dict):
            continue
        for script_name, command_text in scripts.items():
            if not isinstance(command_text, str):
                continue
            for target in static_command_targets(command_text):
                candidate = (package_file.parent / target).resolve()
                try:
                    candidate.relative_to(root.resolve())
                except ValueError:
                    exists = False
                else:
                    exists = candidate.is_file()
                if not exists:
                    findings.append(
                        finding(
                            detector="package-script-path",
                            path=relative,
                            line=1,
                            target=f"{script_name}:{target}",
                            message=(
                                "Literal package-script executable path does not resolve "
                                "from its package directory."
                            ),
                        )
                    )
    return findings


def scan(root: Path) -> list[Finding]:
    findings = scan_workflows(root) + scan_package_scripts(root)
    return sorted(
        findings,
        key=lambda item: (
            item.control_id,
            item.path,
            item.line,
            item.detector,
            item.target,
        ),
    )


def load_baseline(path: Path | None) -> set[str]:
    if path is None:
        return set()
    payload = json.loads(path.read_text(encoding="utf-8"))
    fingerprints = payload.get("fingerprints", [])
    if not isinstance(fingerprints, list) or not all(
        isinstance(item, str) for item in fingerprints
    ):
        raise ValueError("baseline fingerprints must be a list of strings")
    return set(fingerprints)


def render_text(findings: list[Finding], baseline: set[str]) -> str:
    if not findings:
        return "IIC-001 shadow scan: NDT-001 PASS, no statically provable dead paths found."
    lines = []
    for item in findings:
        disposition = "baseline" if item.fingerprint in baseline else "new"
        lines.append(
            f"{item.path}:{item.line}: {item.control_id} {item.detector} "
            f"[{disposition}] {item.target}: {item.message} "
            f"fingerprint={item.fingerprint}"
        )
    lines.append(
        f"IIC-001 shadow scan: {len(findings)} finding(s), "
        f"{sum(item.fingerprint not in baseline for item in findings)} unbaselined."
    )
    return "\n".join(lines)


def render_json(findings: list[Finding], baseline: set[str], mode: str) -> str:
    records = []
    for item in findings:
        record = asdict(item)
        record["disposition"] = "baseline" if item.fingerprint in baseline else "new"
        records.append(record)
    payload = {
        "schema_version": 1,
        "lane": "IIC-001",
        "mode": mode,
        "controls": ["NDT-001"],
        "finding_count": len(findings),
        "unbaselined_count": sum(
            item.fingerprint not in baseline for item in findings
        ),
        "findings": records,
    }
    return json.dumps(payload, indent=2, sort_keys=True)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Run CoMind implementation-integrity controls."
    )
    parser.add_argument("root", nargs="?", default=".", help="Repository root")
    parser.add_argument("--mode", choices=("shadow", "enforce"), default="shadow")
    parser.add_argument("--format", choices=("text", "json"), default="text")
    parser.add_argument(
        "--baseline", type=Path, help="Reviewed baseline JSON containing fingerprints"
    )
    parser.add_argument(
        "--output", type=Path, help="Optional output file; stdout is still written"
    )
    arguments = parser.parse_args(argv)

    root = Path(arguments.root).resolve()
    if not root.is_dir():
        print(
            f"Integrity engine error: repository root is not a directory: {root}",
            file=sys.stderr,
        )
        return 2

    try:
        baseline = load_baseline(arguments.baseline)
        findings = scan(root)
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        print(f"Integrity engine error: {exc}", file=sys.stderr)
        return 2

    rendered = (
        render_json(findings, baseline, arguments.mode)
        if arguments.format == "json"
        else render_text(findings, baseline)
    )
    print(rendered)
    if arguments.output is not None:
        arguments.output.parent.mkdir(parents=True, exist_ok=True)
        arguments.output.write_text(rendered + "\n", encoding="utf-8")

    unbaselined = [item for item in findings if item.fingerprint not in baseline]
    if arguments.mode == "enforce" and unbaselined:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
