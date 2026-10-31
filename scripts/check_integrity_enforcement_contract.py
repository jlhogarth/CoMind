#!/usr/bin/env python3
"""Validate the repository contract that keeps NDT-001 hard enforcement enabled."""

from __future__ import annotations

import re
import sys
from pathlib import Path

REQUIRED_WORKFLOW = Path('.github/workflows/implementation-integrity.yml')


def failures(root: Path) -> list[str]:
    workflow = root / REQUIRED_WORKFLOW
    if not workflow.is_file():
        return [f"missing required workflow: {REQUIRED_WORKFLOW.as_posix()}"]
    text = workflow.read_text(encoding='utf-8')
    problems: list[str] = []

    engine_invocations = [
        line.strip()
        for line in text.splitlines()
        if 'scripts/check_implementation_integrity.py' in line
    ]
    if len(engine_invocations) != 1:
        problems.append(
            f"expected exactly one integrity engine invocation, found {len(engine_invocations)}"
        )
    elif '--mode enforce' not in engine_invocations[0]:
        problems.append('integrity engine invocation must use --mode enforce')

    if '--mode shadow' in text:
        problems.append('hard enforcement workflow must not invoke shadow mode')
    if '--baseline' in text:
        problems.append('NDT-001 zero-debt enforcement must not use a baseline file')
    if re.search(r'^\s*(?:-\s*)?continue-on-error\s*:\s*true\s*(?:#.*)?$', text, re.I | re.M):
        problems.append('integrity enforcement workflow must not continue on error')
    if 'python scripts/test_check_implementation_integrity.py' not in text:
        problems.append('integrity regression suite must run before enforcement')
    if 'python scripts/test_integrity_enforcement_contract.py' not in text:
        problems.append('integrity enforcement adversarial suite must run before enforcement')
    if 'python scripts/check_integrity_enforcement_contract.py .' not in text:
        problems.append('workflow must self-validate its enforcement contract')
    if 'permissions:\n  contents: read' not in text:
        problems.append('workflow permissions must remain contents: read')
    if 'pull_request:' not in text or 'push:' not in text or '- main' not in text:
        problems.append('workflow must cover pull requests and pushes to main')
    return problems


def main(argv: list[str] | None = None) -> int:
    root = Path(argv[0] if argv else '.').resolve()
    problems = failures(root)
    if problems:
        for problem in problems:
            print(f"Integrity enforcement contract violation: {problem}", file=sys.stderr)
        return 1
    print('IIC-003 enforcement contract: PASS')
    return 0


if __name__ == '__main__':
    raise SystemExit(main(sys.argv[1:]))
