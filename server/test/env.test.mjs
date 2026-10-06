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
        OPENAI_API_KEY: '',
        ...overrides,
      },
    }
  );
}

test('environment accepts disabled assistant provider without an OpenAI API key', () => {
  const result = importEnvironment({});
  assert.equal(result.status, 0, result.stderr);
});

test('environment rejects enabled OpenAI provider without an API key', () => {
  const result = importEnvironment({ ASSISTANT_PROVIDER: 'openai' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /OPENAI_API_KEY/);
  assert.match(result.stderr, /required when ASSISTANT_PROVIDER=openai/);
});

test('environment accepts enabled OpenAI provider with bounded configuration', () => {
  const result = importEnvironment({
    ASSISTANT_PROVIDER: 'openai',
    OPENAI_API_KEY: 'test-key-used-only-for-environment-validation',
    OPENAI_MODEL: 'gpt-6-luna',
    OPENAI_REASONING_EFFORT: 'low',
    OPENAI_MAX_OUTPUT_TOKENS: '256',
  });
  assert.equal(result.status, 0, result.stderr);
});

test('environment rejects an output-token bound above the configured maximum', () => {
  const result = importEnvironment({
    ASSISTANT_PROVIDER: 'openai',
    OPENAI_API_KEY: 'test-key-used-only-for-environment-validation',
    OPENAI_MAX_OUTPUT_TOKENS: '8193',
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /OPENAI_MAX_OUTPUT_TOKENS/);
});
