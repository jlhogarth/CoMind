import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const workflowUrl = new URL(
  '../../.github/workflows/lane-health-sentinel-retry-proof.yml',
  import.meta.url
);

test('controlled retry proof preserves GNU timeout exit 124 under GitHub bash errexit', async () => {
  const source = await readFile(workflowUrl, 'utf8');

  assert.match(
    source,
    /timeout 1s bash -c 'sleep 5' \|\| exit_code=\$\?/,
    'timeout must execute in an errexit-safe command context so exit 124 is captured'
  );
  assert.match(
    source,
    /printf 'exit_code=%s\\n' "\$\{exit_code\}" >> "\$\{GITHUB_OUTPUT\}"/,
    'captured exit code must be persisted as a step output before the fixture exits'
  );
  assert.match(
    source,
    /steps\.fixture\.outputs\.exit_code == '124'/,
    'structured-signal emission must remain gated on the exact reviewed exit code'
  );
});
