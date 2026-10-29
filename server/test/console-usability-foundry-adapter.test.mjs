import assert from 'node:assert/strict';
import test from 'node:test';

const { createConsoleUsabilityFoundryAdapter } = await import('../dist/providers/console-usability-foundry-adapter.js');

const baseRequest = Object.freeze({
  executionContextId: '11111111-1111-4111-8111-111111111111',
  adapterOperationId: '22222222-2222-4222-8222-222222222222',
  capabilityCode: 'console.usability.browser_test',
  action: 'browser_test',
  authorityLevel: 'C1',
  targetKind: 'operator_console',
  targetRef: 'apps/operator-console',
  requestFingerprint: 'abc123',
  input: Object.freeze({}),
});

function validReport(overrides = {}) {
  return {
    schemaVersion: 'comind.cux-001.usability-report.v1',
    summary: {
      runCount: 7,
      findingCount: 3,
      limitationCount: 0,
      severityCounts: { major: 2, minor: 1 },
      ...overrides,
    },
  };
}

test('Console usability adapter runs only the bounded harness and returns governed evidence', async () => {
  let captured;
  const adapter = createConsoleUsabilityFoundryAdapter({
    repositoryRoot: '/repo',
    browsers: ['chromium', 'webkit'],
    timeoutMs: 60_000,
    runHarness: async (request) => {
      captured = request;
      return { exitCode: 0, stdout: 'ok', stderr: '', report: validReport() };
    },
  });

  const result = await adapter(baseRequest);
  assert.equal(result.status, 'succeeded');
  assert.equal(result.errorCode, undefined);
  assert.equal(result.resultRef, 'apps/operator-console/test-results/cux-001/foundry/11111111-1111-4111-8111-111111111111.json');
  assert.match(result.summary, /7 browser\/profile runs/);
  assert.deepEqual(captured.browsers, ['chromium', 'webkit']);
  assert.equal(captured.consoleDirectory, '/repo/apps/operator-console');
  assert.equal(captured.timeoutMs, 60_000);
});

test('Console usability adapter fails when the report contains a blocker', async () => {
  const adapter = createConsoleUsabilityFoundryAdapter({
    repositoryRoot: '/repo',
    runHarness: async () => ({
      exitCode: 1,
      stdout: '',
      stderr: '',
      report: validReport({ findingCount: 1, severityCounts: { blocker: 1 } }),
    }),
  });

  const result = await adapter(baseRequest);
  assert.equal(result.status, 'failed');
  assert.equal(result.errorCode, 'cux_blocker_found');
});

test('Console usability adapter blocks when a required browser is unavailable', async () => {
  const adapter = createConsoleUsabilityFoundryAdapter({
    repositoryRoot: '/repo',
    runHarness: async () => ({
      exitCode: 2,
      stdout: '',
      stderr: '',
      report: validReport({ limitationCount: 1 }),
    }),
  });

  const result = await adapter(baseRequest);
  assert.equal(result.status, 'blocked');
  assert.equal(result.errorCode, 'cux_browser_unavailable');
});

test('Console usability adapter rejects runtime command overrides and out-of-scope targets', async () => {
  const adapter = createConsoleUsabilityFoundryAdapter({
    repositoryRoot: '/repo',
    runHarness: async () => ({ exitCode: 0, stdout: '', stderr: '', report: validReport() }),
  });

  await assert.rejects(
    adapter({ ...baseRequest, input: { command: 'arbitrary' } }),
    /does not accept runtime command or target overrides/
  );
  await assert.rejects(
    adapter({ ...baseRequest, targetRef: 'server' }),
    /outside the Operator Console/
  );
  await assert.rejects(
    adapter({ ...baseRequest, authorityLevel: 'C2' }),
    /only accepts C0 or C1 authority/
  );
});

test('Console usability adapter rejects unsupported browser configuration before execution', () => {
  assert.throws(
    () => createConsoleUsabilityFoundryAdapter({ repositoryRoot: '/repo', browsers: ['chrome-shell'] }),
    /unsupported browser engine/
  );
});
