import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const envModuleUrl = new URL('../dist/env.js', import.meta.url).href;
const importScript = `await import(${JSON.stringify(envModuleUrl)});`;

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
        OPENAI_API_KEY: '',
        ...overrides,
      },
    }
  );
}

function processOutput(result) {
  return `${result.stderr}\n${result.stdout}`;
}

test('environment accepts disabled assistant provider without an OpenAI API key', () => {
  const result = importEnvironment({});
  assert.equal(result.status, 0, result.stderr);
});

test('environment rejects enabled OpenAI provider without an API key', () => {
  const result = importEnvironment({ ASSISTANT_PROVIDER: 'openai' });
  assert.notEqual(result.status, 0);
  assert.match(processOutput(result), /OPENAI_API_KEY/);
  assert.match(processOutput(result), /required when ASSISTANT_PROVIDER=openai/);
});

test('environment accepts enabled OpenAI provider with bounded configuration', () => {
  const result = importEnvironment({
    ASSISTANT_PROVIDER: 'openai',
    OPENAI_API_KEY: 'test-key-used-only-for-environment-validation',
    OPENAI_MODEL: 'gpt-6-luna',
    OPENAI_REASONING_EFFORT: 'low',
    OPENAI_MAX_OUTPUT_TOKENS: '256',
    ASSISTANT_MAX_HISTORY_MESSAGES: '12',
    OPENAI_TIMEOUT_MS: '15000',
    OPENAI_MAX_RETRIES: '1',
  });
  assert.equal(result.status, 0, result.stderr);
});

test('environment accepts metered quality gate only with an enabled provider', () => {
  const accepted = importEnvironment({
    ASSISTANT_PROVIDER: 'openai',
    ASSISTANT_QUALITY_GATE: 'metered',
    ASSISTANT_QUALITY_VERIFIER_FAILURE_FALLBACK: 'return_draft',
    OPENAI_API_KEY: 'test-key-used-only-for-environment-validation',
  });
  assert.equal(accepted.status, 0, accepted.stderr);

  const rejected = importEnvironment({ ASSISTANT_QUALITY_GATE: 'metered' });
  assert.notEqual(rejected.status, 0);
  assert.match(processOutput(rejected), /ASSISTANT_QUALITY_GATE/);
  assert.match(processOutput(rejected), /requires an enabled assistant provider/);
});

test('environment rejects unsupported quality gate configuration', () => {
  const invalidGate = importEnvironment({ ASSISTANT_QUALITY_GATE: 'always_verify' });
  assert.notEqual(invalidGate.status, 0);
  assert.match(processOutput(invalidGate), /ASSISTANT_QUALITY_GATE/);

  const invalidFallback = importEnvironment({
    ASSISTANT_QUALITY_VERIFIER_FAILURE_FALLBACK: 'ignore',
  });
  assert.notEqual(invalidFallback.status, 0);
  assert.match(processOutput(invalidFallback), /ASSISTANT_QUALITY_VERIFIER_FAILURE_FALLBACK/);
});

test('environment rejects an output-token bound above the configured maximum', () => {
  const result = importEnvironment({
    ASSISTANT_PROVIDER: 'openai',
    OPENAI_API_KEY: 'test-key-used-only-for-environment-validation',
    OPENAI_MAX_OUTPUT_TOKENS: '8193',
  });
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
  const result = importEnvironment({
    ASSISTANT_PROVIDER: 'openai',
    OPENAI_API_KEY: 'test-key-used-only-for-environment-validation',
    OPENAI_TIMEOUT_MS: '999',
    OPENAI_MAX_RETRIES: '6',
  });
  assert.notEqual(result.status, 0);
  assert.match(processOutput(result), /OPENAI_TIMEOUT_MS/);
  assert.match(processOutput(result), /OPENAI_MAX_RETRIES/);
});
