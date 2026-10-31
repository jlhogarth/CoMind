#!/usr/bin/env python3
from __future__ import annotations

import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ENGINE_PATH = ROOT / 'scripts' / 'check_implementation_integrity.py'
CONTRACT_PATH = ROOT / 'scripts' / 'check_integrity_enforcement_contract.py'


def load(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


ENGINE = load('check_implementation_integrity_iic003', ENGINE_PATH)
CONTRACT = load('check_integrity_enforcement_contract_iic003', CONTRACT_PATH)


class EnforcementContractTests(unittest.TestCase):
    def make_root(self) -> tuple[tempfile.TemporaryDirectory[str], Path]:
        temp = tempfile.TemporaryDirectory()
        root = Path(temp.name)
        (root / '.github' / 'workflows').mkdir(parents=True)
        return temp, root

    def write_workflow(self, root: Path, content: str) -> None:
        (root / '.github' / 'workflows' / 'ci.yml').write_text(content, encoding='utf-8')

    def test_missing_workflow_path_blocks_enforce_mode(self) -> None:
        temp, root = self.make_root(); self.addCleanup(temp.cleanup)
        self.write_workflow(root, 'jobs:\n  check:\n    steps:\n      - run: python scripts/missing.py\n')
        self.assertEqual(1, ENGINE.main([str(root), '--mode', 'enforce']))

    def test_missing_local_action_blocks_enforce_mode(self) -> None:
        temp, root = self.make_root(); self.addCleanup(temp.cleanup)
        self.write_workflow(root, 'jobs:\n  check:\n    steps:\n      - uses: ./actions/missing\n')
        self.assertEqual(1, ENGINE.main([str(root), '--mode', 'enforce']))

    def test_missing_package_path_blocks_enforce_mode(self) -> None:
        temp, root = self.make_root(); self.addCleanup(temp.cleanup)
        package = root / 'server'; package.mkdir()
        (package / 'package.json').write_text(
            json.dumps({'scripts': {'start': 'node scripts/missing.js'}}), encoding='utf-8'
        )
        self.assertEqual(1, ENGINE.main([str(root), '--mode', 'enforce']))

    def test_nfs_candidate_remains_nonblocking(self) -> None:
        temp, root = self.make_root(); self.addCleanup(temp.cleanup)
        self.write_workflow(
            root,
            'jobs:\n  check:\n    steps:\n      - name: Optional probe\n        continue-on-error: true\n        run: echo hi\n',
        )
        self.assertEqual(0, ENGINE.main([str(root), '--mode', 'enforce']))

    def test_current_repository_enforcement_contract_is_valid(self) -> None:
        self.assertEqual([], CONTRACT.failures(ROOT))

    def test_shadow_downgrade_is_rejected(self) -> None:
        temp, root = self.make_root(); self.addCleanup(temp.cleanup)
        workflow = root / '.github' / 'workflows' / 'implementation-integrity.yml'
        workflow.write_text(
            'on:\n  pull_request:\n  push:\n    branches:\n      - main\n'
            'permissions:\n  contents: read\n'
            'jobs:\n  check:\n    steps:\n'
            '      - run: python scripts/test_check_implementation_integrity.py\n'
            '      - run: python scripts/test_integrity_enforcement_contract.py\n'
            '      - run: python scripts/check_integrity_enforcement_contract.py .\n'
            '      - run: python scripts/check_implementation_integrity.py . --mode shadow\n',
            encoding='utf-8',
        )
        self.assertTrue(any('enforce' in item or 'shadow' in item for item in CONTRACT.failures(root)))

    def test_baseline_bypass_is_rejected(self) -> None:
        temp, root = self.make_root(); self.addCleanup(temp.cleanup)
        workflow = root / '.github' / 'workflows' / 'implementation-integrity.yml'
        workflow.write_text(
            'on:\n  pull_request:\n  push:\n    branches:\n      - main\n'
            'permissions:\n  contents: read\n'
            'jobs:\n  check:\n    steps:\n'
            '      - run: python scripts/test_check_implementation_integrity.py\n'
            '      - run: python scripts/test_integrity_enforcement_contract.py\n'
            '      - run: python scripts/check_integrity_enforcement_contract.py .\n'
            '      - run: python scripts/check_implementation_integrity.py . --mode enforce --baseline allow.json\n',
            encoding='utf-8',
        )
        self.assertTrue(any('baseline' in item for item in CONTRACT.failures(root)))

    def test_continue_on_error_bypass_is_rejected(self) -> None:
        temp, root = self.make_root(); self.addCleanup(temp.cleanup)
        workflow = root / '.github' / 'workflows' / 'implementation-integrity.yml'
        workflow.write_text(
            'on:\n  pull_request:\n  push:\n    branches:\n      - main\n'
            'permissions:\n  contents: read\n'
            'jobs:\n  check:\n    steps:\n'
            '      - run: python scripts/test_check_implementation_integrity.py\n'
            '      - run: python scripts/test_integrity_enforcement_contract.py\n'
            '      - run: python scripts/check_integrity_enforcement_contract.py .\n'
            '      - continue-on-error: true\n'
            '        run: python scripts/check_implementation_integrity.py . --mode enforce\n',
            encoding='utf-8',
        )
        self.assertTrue(any('continue on error' in item for item in CONTRACT.failures(root)))


if __name__ == '__main__':
    unittest.main()
