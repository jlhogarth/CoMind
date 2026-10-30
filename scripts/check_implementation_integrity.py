#!/usr/bin/env python3
"""CoMind hard implementation-integrity control engine.

IIC-002 extends the IIC-001 engine to host multiple controls while preserving
stable NDT-001 fingerprints. Controls may emit deterministic verified risks or
review candidates. Shadow mode never blocks on findings; enforce mode blocks
only unbaselined findings classified as verified risks.
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
    classification: str
    path: str
    line: int
    target: str
    message: str
    evidence: str
    fingerprint: str


def fingerprint(control_id: str, detector: str, path: str, target: str) -> str:
    """Stable finding identity.

    This is intentionally unchanged from IIC-001 so existing NDT-001 finding
    fingerprints remain stable across the multi-control refactor.
    """
    payload = "|".join((control_id, detector, path, target)).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()[:24]


def finding(
    *,
    control_id: str,
    detector: str,
    severity: str,
    classification: str,
    path: Path,
    line: int,
    target: str,
    message: str,
    evidence: str,
) -> Finding:
    normalized_path = path.as_posix()
    return Finding(
        control_id=control_id,
        detector=detector,
        severity=severity,
        classification=classification,
        path=normalized_path,
        line=line,
        target=target,
        message=message,
        evidence=evidence,
        fingerprint=fingerprint(control_id, detector, normalized_path, target),
    )


def ndt_finding(*, detector: str, path: Path, line: int, target: str, message: str) -> Finding:
    return finding(
        control_id="NDT-001",
        detector=detector,
        severity="error",
        classification="verified-risk",
        path=path,
        line=line,
        target=target,
        message=message,
        evidence=target,
    )


def nfs_candidate(
    *, detector: str, path: Path, line: int, target: str, message: str, evidence: str
) -> Finding:
    return finding(
        control_id="NFS-001",
        detector=detector,
        severity="warning",
        classification="candidate",
        path=path,
        line=line,
        target=target,
        message=message,
        evidence=evidence,
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


def extract_run_blocks(lines: list[str]) -> list[tuple[int, int, str]]:
    """Extract literal run bodies without requiring a YAML dependency.

    Returns (zero-based source index, one-based source line, body).
    """
    blocks: list[tuple[int, int, str]] = []
    for index, line in enumerate(lines):
        match = re.match(r"^(?P<indent>\s*)(?:-\s*)?run:\s*(?P<body>.*)$", line)
        if not match:
            continue
        indent = len(match.group("indent"))
        body = match.group("body").strip()
        start_line = index + 1
        if body and body not in {"|", ">", "|-", ">-", "|+", ">+"}:
            blocks.append((index, start_line, body))
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
        blocks.append((index, start_line, "\n".join(collected)))
    return blocks


def workflow_step_label(lines: list[str], index: int) -> str:
    """Return a bounded, stable label for the surrounding workflow step."""
    current_indent = len(lines[index]) - len(lines[index].lstrip())
    for candidate_index in range(index, max(-1, index - 12), -1):
        candidate = lines[candidate_index]
        match = re.match(r"^\s*-?\s*name:\s*(.+?)\s*$", candidate)
        if not match:
            continue
        candidate_indent = len(candidate) - len(candidate.lstrip())
        if candidate_indent <= current_indent:
            return match.group(1).strip().strip("'\"")[:120]
    return "unlabeled-step"


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


def scan_ndt_workflows(root: Path) -> list[Finding]:
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
                    ndt_finding(
                        detector="workflow-local-use",
                        path=relative,
                        line=line_number,
                        target=target,
                        message="Literal local workflow/action target does not resolve.",
                    )
                )

        if re.search(r"^\s*(?:-\s*)?working-directory\s*:", text, re.MULTILINE):
            continue

        for _index, line_number, body in extract_run_blocks(lines):
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
                        ndt_finding(
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


def generated_package_target_exists(package_dir: Path, target: str) -> bool:
    """Recognize simple TypeScript build outputs backed by checked-in source."""
    tsconfig = package_dir / "tsconfig.json"
    if not tsconfig.is_file():
        return False
    try:
        payload = json.loads(tsconfig.read_text(encoding="utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        return False
    compiler_options = payload.get("compilerOptions")
    if not isinstance(compiler_options, dict):
        return False
    out_dir = compiler_options.get("outDir")
    root_dir = compiler_options.get("rootDir")
    if not isinstance(out_dir, str) or not isinstance(root_dir, str):
        return False
    if any(marker in out_dir + root_dir for marker in DYNAMIC_MARKERS):
        return False

    target_path = Path(target)
    try:
        source_relative = target_path.relative_to(Path(out_dir))
    except ValueError:
        return False

    source_base = package_dir / root_dir / source_relative
    if target_path.suffix.lower() in {".js", ".mjs", ".cjs"}:
        candidates = [
            source_base.with_suffix(suffix)
            for suffix in (".ts", ".tsx", ".mts", ".cts", ".js", ".mjs", ".cjs")
        ]
    else:
        candidates = [source_base]
    return any(candidate.is_file() for candidate in candidates)


def scan_ndt_package_scripts(root: Path) -> list[Finding]:
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
                if not exists and not generated_package_target_exists(package_file.parent, target):
                    findings.append(
                        ndt_finding(
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


def normalized_shell_line(raw_line: str) -> str:
    return " ".join(raw_line.strip().split())[:240]


def failure_mask_pattern(raw_line: str) -> str | None:
    """Return the visible failure-mask token when the line contains one."""
    line = raw_line.strip()
    if not line or line.startswith("#"):
        return None
    if re.search(r"(?:^|\s)\|\|\s*true(?:\s|$|[;&])", line):
        return "|| true"
    if re.search(r"(?:^|\s)\|\|\s*:(?:\s|$|[;&])", line):
        return "|| :"
    if re.match(r"^set\s+\+e(?:\s|$)", line):
        return "set +e"
    return None


def scan_nfs_workflows(root: Path) -> list[Finding]:
    findings: list[Finding] = []
    for workflow in iter_workflows(root):
        relative = workflow.relative_to(root)
        text = workflow.read_text(encoding="utf-8")
        lines = text.splitlines()

        for index, line in enumerate(lines):
            match = re.match(r"^\s*(?:-\s*)?continue-on-error\s*:\s*(true)\s*(?:#.*)?$", line, re.I)
            if not match:
                continue
            label = workflow_step_label(lines, index)
            target = f"{label}:continue-on-error:true"
            findings.append(
                nfs_candidate(
                    detector="workflow-continue-on-error",
                    path=relative,
                    line=index + 1,
                    target=target,
                    message=(
                        "Step is explicitly allowed to continue after failure; review whether "
                        "required behavior can be reported successful despite this failure."
                    ),
                    evidence=line.strip(),
                )
            )

        for index, line_number, body in extract_run_blocks(lines):
            label = workflow_step_label(lines, index)
            for raw_line in body.splitlines():
                pattern = failure_mask_pattern(raw_line)
                if pattern is None:
                    continue
                normalized = normalized_shell_line(raw_line)
                findings.append(
                    nfs_candidate(
                        detector="workflow-shell-failure-mask",
                        path=relative,
                        line=line_number,
                        target=f"{label}:{pattern}:{normalized}",
                        message=(
                            "Shell failure masking is present; review whether the step can "
                            "return success after required behavior fails."
                        ),
                        evidence=normalized,
                    )
                )
    return findings


def scan_nfs_package_scripts(root: Path) -> list[Finding]:
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
            for raw_line in command_text.splitlines():
                pattern = failure_mask_pattern(raw_line)
                if pattern is None:
                    continue
                normalized = normalized_shell_line(raw_line)
                findings.append(
                    nfs_candidate(
                        detector="package-shell-failure-mask",
                        path=relative,
                        line=1,
                        target=f"{script_name}:{pattern}:{normalized}",
                        message=(
                            "Package script contains failure masking; review whether the script "
                            "can return success after required behavior fails."
                        ),
                        evidence=normalized,
                    )
                )
    return findings


def scan(root: Path) -> list[Finding]:
    findings = (
        scan_ndt_workflows(root)
        + scan_ndt_package_scripts(root)
        + scan_nfs_workflows(root)
        + scan_nfs_package_scripts(root)
    )
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
    if not isinstance(fingerprints, list) or not all(isinstance(item, str) for item in fingerprints):
        raise ValueError("baseline fingerprints must be a list of strings")
    return set(fingerprints)


def is_blocking(item: Finding, baseline: set[str]) -> bool:
    return item.classification == "verified-risk" and item.fingerprint not in baseline


def render_text(findings: list[Finding], baseline: set[str], mode: str) -> str:
    if not findings:
        return "Implementation Integrity: PASS, no findings in enabled controls."
    lines = []
    for item in findings:
        disposition = "baseline" if item.fingerprint in baseline else "new"
        lines.append(
            f"{item.path}:{item.line}: {item.control_id} {item.detector} "
            f"[{item.classification}/{disposition}] {item.target}: {item.message} "
            f"fingerprint={item.fingerprint}"
        )
    blocking = sum(is_blocking(item, baseline) for item in findings)
    candidates = sum(item.classification == "candidate" for item in findings)
    lines.append(
        f"Implementation Integrity {mode}: {len(findings)} finding(s), "
        f"{blocking} blocking risk(s), {candidates} review candidate(s)."
    )
    return "\n".join(lines)


def render_json(findings: list[Finding], baseline: set[str], mode: str) -> str:
    records = []
    for item in findings:
        record = asdict(item)
        record["disposition"] = "baseline" if item.fingerprint in baseline else "new"
        record["blocking"] = is_blocking(item, baseline)
        records.append(record)
    control_ids = sorted({item.control_id for item in findings} | {"NDT-001", "NFS-001"})
    counts = {
        control_id: sum(item.control_id == control_id for item in findings)
        for control_id in control_ids
    }
    payload = {
        "schema_version": 2,
        "lane": "IIC-002",
        "mode": mode,
        "controls": control_ids,
        "finding_count": len(findings),
        "finding_count_by_control": counts,
        "blocking_count": sum(is_blocking(item, baseline) for item in findings),
        "candidate_count": sum(item.classification == "candidate" for item in findings),
        "findings": records,
    }
    return json.dumps(payload, indent=2, sort_keys=True)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Run CoMind implementation-integrity controls.")
    parser.add_argument("root", nargs="?", default=".", help="Repository root")
    parser.add_argument("--mode", choices=("shadow", "enforce"), default="shadow")
    parser.add_argument("--format", choices=("text", "json"), default="text")
    parser.add_argument("--baseline", type=Path, help="Reviewed baseline JSON containing fingerprints")
    parser.add_argument("--output", type=Path, help="Optional output file; stdout is still written")
    arguments = parser.parse_args(argv)

    root = Path(arguments.root).resolve()
    if not root.is_dir():
        print(f"Integrity engine error: repository root is not a directory: {root}", file=sys.stderr)
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
        else render_text(findings, baseline, arguments.mode)
    )
    print(rendered)
    if arguments.output is not None:
        arguments.output.parent.mkdir(parents=True, exist_ok=True)
        arguments.output.write_text(rendered + "\n", encoding="utf-8")

    if arguments.mode == "enforce" and any(is_blocking(item, baseline) for item in findings):
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
