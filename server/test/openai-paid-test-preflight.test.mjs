import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  interpretGuardrailPayload,
  runPaidTestPreflight,
  validatePaidTestRuntime,
} from '../../scripts/openai_paid_test_preflight.mjs';

const safeConfig = {
  model: 'gpt-6-luna',
  reasoningEffort: 'low',
  maxOutputTokens: '128',
  timeoutMs: '30000',
  maxRetries: '0',
  maxRequestsPerDispatch: '1',
  qualityGate: 'disabled',
};

function response(payload, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    async json() {
      return payload;
    },
  };
}

test('paid smoke runtime accepts the bounded policy', () => {
  assert.deepEqual(validatePaidTestRuntime(safeConfig), {
    model: 'gpt-6-luna',
    reasoningEffort: 'low',
    maxOutputTokens: 128,
    timeoutMs: 30000,
    maxRetries: 0,
    maxRequestsPerDispatch: 1,
    qualityGate: 'disabled',
  });
});

test('paid smoke runtime rejects extra retries and oversized output', () => {
  assert.throws(
    () => validatePaidTestRuntime({ ...safeConfig, maxRetries: '1' }),
    /OPENAI_MAX_RETRIES must be 0/
  );
  assert.throws(
    () => validatePaidTestRuntime({ ...safeConfig, maxOutputTokens: '129' }),
    /OPENAI_MAX_OUTPUT_TOKENS must be between 1 and 128/
  );
});

test('guardrail allow proceeds', () => {
  assert.deepEqual(
    interpretGuardrailPayload({ decision: 'allow', pause_paid_tests: false, reasons: ['Within policy.'] }),
    { decision: 'allow', proceed: true, reasons: ['Within policy.'] }
  );
});

test('guardrail warn is visible but permitted for the manual smoke', () => {
  assert.deepEqual(
    interpretGuardrailPayload({ decision: 'warn', pause_paid_tests: false, reasons: ['Near budget.'] }),
    { decision: 'warn', proceed: true, reasons: ['Near budget.'] }
  );
});

test('guardrail pause blocks paid smoke', () => {
  assert.throws(
    () => interpretGuardrailPayload({ decision: 'pause', pause_paid_tests: true, reasons: ['Budget reached.'] }),
    /Paid OpenAI smoke paused by spending guardrail: Budget reached\./
  );
});

test('malformed or inconsistent guardrail state fails closed', () => {
  assert.throws(
    () => interpretGuardrailPayload({ decision: 'allow', pause_paid_tests: true, reasons: [] }),
    /decision and pause_paid_tests disagree/
  );
  assert.throws(
    () => interpretGuardrailPayload({ decision: 'mystery', pause_paid_tests: false, reasons: [] }),
    /unknown decision/
  );
});

test('preflight fails closed when guardrail is unavailable', async () => {
  await assert.rejects(
    () => runPaidTestPreflight({
      baseUrl: 'http://127.0.0.1:3000',
      config: safeConfig,
      fetchImpl: async () => {
        throw new Error('connection refused');
      },
    }),
    /Spending guardrail preflight is unavailable: connection refused/
  );
});

test('preflight rejects non-success guardrail HTTP responses', async () => {
  await assert.rejects(
    () => runPaidTestPreflight({
      baseUrl: 'http://127.0.0.1:3000',
      config: safeConfig,
      fetchImpl: async () => response({}, { ok: false, status: 503 }),
    }),
    /Spending guardrail preflight failed with HTTP 503/
  );
});

test('smoke script runs preflight before the assistant provider trigger', async () => {
  const scriptUrl = new URL('../../scripts/verify_openai_live.sh', import.meta.url);
  const script = await readFile(scriptUrl, 'utf8');
  const preflightIndex = script.indexOf('openai_paid_test_preflight.mjs');
  const providerTriggerIndex = script.indexOf('/assistant-response');
  assert.notEqual(preflightIndex, -1, 'preflight invocation must exist');
  assert.notEqual(providerTriggerIndex, -1, 'assistant provider trigger must exist');
  assert.ok(preflightIndex < providerTriggerIndex, 'preflight must run before the assistant provider trigger');
});
