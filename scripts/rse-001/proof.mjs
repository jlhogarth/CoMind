import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { appendFile } from 'node:fs/promises';
import { Sandbox } from 'railway';

const TEST_ENVIRONMENT_ID = 'f9371d64-57a4-4b2e-8665-84fe040ef90c';
const MAX_CREDIT_OBSERVATION_AGE_MS = 10 * 60 * 1000;
const MIN_VERIFIED_CREDIT_USD = 0.10;
const evidencePath = process.env.RSE_EVIDENCE_PATH;
const observedAt = Date.parse(process.env.RSE_CREDIT_OBSERVED_AT ?? '');
const credit = Number(process.env.RSE_VERIFIED_REMAINING_CREDIT_USD);
if (!process.env.RAILWAY_TOKEN ||
    process.env.RAILWAY_ENVIRONMENT_ID !== TEST_ENVIRONMENT_ID ||
    !evidencePath ||
    !Number.isFinite(observedAt) ||
    observedAt > Date.now() ||
    Date.now() - observedAt > MAX_CREDIT_OBSERVATION_AGE_MS ||
    !Number.isFinite(credit) || credit < MIN_VERIFIED_CREDIT_USD) {
  throw new Error('RSE-001 preflight denied: scoped Test token, environment, evidence path, and fresh verified included credit are required');
}

const runId = randomUUID();
const payload = `RSE-001|issue-586|${runId}\n`;
const digest = createHash('sha256').update(payload).digest('hex');
const write = async (event, details = {}) =>
  appendFile(evidencePath, JSON.stringify({
    schema_version: 1,
    lane: 'RSE-001',
    issue: 586,
    run_id: runId,
    event,
    observed_at: new Date().toISOString(),
    environment_id: TEST_ENVIRONMENT_ID,
    ...details,
  }) + '\n', { mode: 0o600 });

let sandbox;
let executionError;
await write('PREFLIGHT_ACCEPTED', {
  credit_observed_at: new Date(observedAt).toISOString(),
  remaining_included_credit_usd: credit,
  required_credit_buffer_usd: MIN_VERIFIED_CREDIT_USD,
  network_isolation: 'ISOLATED',
  idle_timeout_minutes: 1,
  resources: { cpu: 0.5, memoryGB: 0.5 },
});
try {
  sandbox = await Sandbox.create({
    idleTimeoutMinutes: 1,
    resources: { cpu: 0.5, memoryGB: 0.5 },
    region: 'us-west2',
    networkIsolation: 'ISOLATED',
  });
  await write('CREATED', { sandbox_id: sandbox.id, region: sandbox.region });
  const active = await Sandbox.list();
  assert.ok(active.some(item => item.id === sandbox.id), 'created sandbox not found in independent list');
  // The payload contains only a generated UUID and fixed ASCII characters.
  const command = `printf '%s' '${payload.trimEnd()}' | sha256sum`;
  const result = await sandbox.exec(command, { timeoutSec: 20, maxOutputBytes: 4096 });
  assert.equal(result.exitCode, 0);
  assert.equal(result.timedOut, false);
  assert.equal(result.truncated, false);
  assert.equal(result.stdout.trim().split(/\s+/)[0], createHash('sha256').update(payload.trimEnd()).digest('hex'));
  await write('EXECUTION_VERIFIED', {
    sandbox_id: sandbox.id,
    payload_sha256: digest,
    command_output_sha256: result.stdout.trim().split(/\s+/)[0],
    exit_code: result.exitCode,
  });
} catch (error) {
  executionError = error;
  await write('EXECUTION_FAILED', { sandbox_id: sandbox?.id ?? null, error_name: error?.name ?? 'UnknownError' });
} finally {
  if (sandbox) {
    try {
      await sandbox.destroy();
      await write('DESTROY_REQUEST_ACCEPTED', { sandbox_id: sandbox.id });
      const remaining = await Sandbox.list();
      if (remaining.some(item => item.id === sandbox.id)) {
        throw new Error('sandbox remains in active list');
      }
      await write('TEARDOWN_VERIFIED', { sandbox_id: sandbox.id, active_match_count: 0 });
    } catch (error) {
      await write('TEARDOWN_UNCERTAIN', { sandbox_id: sandbox.id, error_name: error?.name ?? 'UnknownError' });
      throw error;
    }
  } else {
    await write('CREATE_OUTCOME_UNCERTAIN', { idle_timeout_minutes: 1 });
  }
}
if (executionError) throw executionError;
