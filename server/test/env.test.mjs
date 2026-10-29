import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const envModuleUrl = new URL('../dist/env.js', import.meta.url).href;
const importScript = `await import(${JSON.stringify(envModuleUrl)});`;
const bindingId = '11111111-1111-4111-8111-111111111111';
const proposalId = '22222222-2222-4222-8222-222222222222';

function governedOpenAIEnvironment(overrides = {}) {
  return {
    ASSISTANT_PROVIDER: 'openai',
    OPENAI_API_KEY: 'test-key-used-only-for-environment-validation',
    OPENAI_PAID_API_BINDING_ID: bindingId,
    OPENAI_PAID_API_PROPOSAL_ID: proposalId,
    OPENAI_MAX_RETRIES: '0',
    ...overrides,
  };
}

function importEnvironment(overrides) {
  return spawnSync(
    process.execPath,
    ['--input-type=module', '--eval', importScript],
    {
      cwd: new URL('..', import.meta.url),
      encoding: 'utf8',
      env: {
        ...process.env,
        DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/comind_test',
        ASSISTANT_PROVIDER: 'disabled',
        ASSISTANT_QUALITY_GATE: 'disabled',
        ASSISTANT_QUALITY_VERIFIER_FAILURE_FALLBACK: 'block',
        ASSISTANT_QUALITY_VERIFIER_MAX_OUTPUT_TOKENS: '256',
        OPENAI_API_KEY: '',
        OPENAI_PAID_API_BINDING_ID: '',
        OPENAI_PAID_API_PROPOSAL_ID: '',
        ...overrides,
      },
    }
  );
}

function processOutput(result) {
  return `${result.stderr}\n${result.stdout}`;
}

test('environment accepts disabled assistant provider without OpenAI paid authority', () => {
  const result = importEnvironment({});
  assert.equal(result.status, 0, result.stderr);
});

test('environment rejects enabled OpenAI provider without an API key', () => {
  const result = importEnvironment(governedOpenAIEnvironment({ OPENAI_API_KEY: '' }));
  assert.notEqual(result.status, 0);
  assert.match(processOutput(result), /OPENAI_API_KEY/);
  assert.match(processOutput(result), /required when ASSISTANT_PROVIDER=openai/);
});

test('environment rejects enabled OpenAI provider without durable paid authority identities', () => {
  const missingBinding = importEnvironment(
    governedOpenAIEnvironment({ OPENAI_PAID_API_BINDING_ID: '' })
  );
  assert.notEqual(missingBinding.status, 0);
  assert.match(processOutput(missingBinding), /OPENAI_PAID_API_BINDING_ID/);

  const missingProposal = importEnvironment(
    governedOpenAIEnvironment({ OPENAI_PAID_API_PROPOSAL_ID: '' })
  );
  assert.notEqual(missingProposal.status, 0);
  assert.match(processOutput(missingProposal), /OPENAI_PAID_API_PROPOSAL_ID/);

  const malformed = importEnvironment(
    governedOpenAIEnvironment({ OPENAI_PAID_API_BINDING_ID: 'not-a-uuid' })
  );
  assert.notEqual(malformed.status, 0);
  assert.match(processOutput(malformed), /OPENAI_PAID_API_BINDING_ID/);
});

test('environment accepts enabled OpenAI provider only with bounded governed configuration', () => {
  const result = importEnvironment(governedOpenAIEnvironment({
    OPENAI_MODEL: 'gpt-6-luna',
    OPENAI_REASONING_EFFORT: 'low',
    OPENAI_MAX_OUTPUT_TOKENS: '256',
    ASSISTANT_MAX_HISTORY_MESSAGES: '12',
    OPENAI_TIMEOUT_MS: '15000',
  }));
  assert.equal(result.status, 0, result.stderr);
});

test('environment rejects automatic retries for normal governed assistant execution', () => {
  const result = importEnvironment(governedOpenAIEnvironment({
    OPENAI_MAX_RETRIES: '1',
  }));
  assert.notEqual(result.status, 0);
  assert.match(processOutput(result), /OPENAI_MAX_RETRIES/);
  assert.match(processOutput(result), /retries require fresh authority/);
});

test('environment accepts metered quality gate only with an enabled governed provider', () => {
  const accepted = importEnvironment(governedOpenAIEnvironment({
    ASSISTANT_QUALITY_GATE: 'metered',
    ASSISTANT_QUALITY_VERIFIER_FAILURE_FALLBACK: 'return_draft',
    ASSISTANT_QUALITY_VERIFIER_MAX_OUTPUT_TOKENS: '128',
  }));
  assert.equal(accepted.status, 0, accepted.stderr);

  const rejected = importEnvironment({ ASSISTANT_QUALITY_GATE: 'metered' });
  assert.notEqual(rejected.status, 0);
  assert.match(processOutput(rejected), /ASSISTANT_QUALITY_GATE/);
  assert.match(processOutput(rejected), /requires an enabled assistant provider/);
});

test('environment rejects unsupported quality gate configuration and verifier budgets', () => {
  const invalidGate = importEnvironment({ ASSISTANT_QUALITY_GATE: 'always_verify' });
  assert.notEqual(invalidGate.status, 0);
  assert.match(processOutput(invalidGate), /ASSISTANT_QUALITY_GATE/);

  const invalidFallback = importEnvironment({
    ASSISTANT_QUALITY_VERIFIER_FAILURE_FALLBACK: 'ignore',
  });
  assert.notEqual(invalidFallback.status, 0);
  assert.match(processOutput(invalidFallback), /ASSISTANT_QUALITY_VERIFIER_FAILURE_FALLBACK/);

  for (const invalidBudget of ['63', '1025']) {
    const result = importEnvironment({
      ASSISTANT_QUALITY_VERIFIER_MAX_OUTPUT_TOKENS: invalidBudget,
    });
    assert.notEqual(result.status, 0);
    assert.match(processOutput(result), /ASSISTANT_QUALITY_VERIFIER_MAX_OUTPUT_TOKENS/);
  }
});

test('environment rejects an output-token bound above the configured maximum', () => {
  const result = importEnvironment(governedOpenAIEnvironment({
    OPENAI_MAX_OUTPUT_TOKENS: '8193',
  }));
  assert.notEqual(result.status, 0);
  assert.match(processOutput(result), /OPENAI_MAX_OUTPUT_TOKENS/);
});

test('environment rejects a zero assistant history budget', () => {
  const result = importEnvironment({
    ASSISTANT_MAX_HISTORY_MESSAGES: '0',
  });
  assert.notEqual(result.status, 0);
  assert.match(processOutput(result), /ASSISTANT_MAX_HISTORY_MESSAGES/);
});

test('environment rejects OpenAI timeout and retry budgets outside bounds', () => {
  const result = importEnvironment(governedOpenAIEnvironment({
    OPENAI_TIMEOUT_MS: '999',
    OPENAI_MAX_RETRIES: '6',
  }));
  assert.notEqual(result.status, 0);
  assert.match(processOutput(result), /OPENAI_TIMEOUT_MS/);
  assert.match(processOutput(result), /OPENAI_MAX_RETRIES/);
});