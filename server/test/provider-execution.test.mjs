import assert from 'node:assert/strict';
import test from 'node:test';

const {
  assertProviderExecutionEnvelopeIntegrity,
  countProviderExecutionInputTokens,
  createProviderExecutionEnvelope,
  validateProviderInputTokenCount,
} = await import('../dist/provider-execution.js');

function executionEnvelope(overrides = {}, requestOverrides = {}) {
  return createProviderExecutionEnvelope({
    provider: 'openai',
    requestedModel: 'gpt-6-luna',
    canonicalModel: 'gpt-6-luna',
    processingMode: 'standard',
    executionRole: 'root',
    timeoutMs: 30000,
    maxRetries: 2,
    request: {
      model: 'gpt-6-luna',
      input: [
        { role: 'system', content: 'Be precise.' },
        { role: 'user', content: 'Explain the contract.' },
      ],
      store: false,
      reasoning: { effort: 'low' },
      max_output_tokens: 512,
      ...requestOverrides,
    },
    ...overrides,
  });
}

test('provider execution envelope is deeply immutable and detached from caller-owned data', () => {
  const input = [
    { role: 'system', content: 'Be precise.' },
    { role: 'user', content: 'Original request.' },
  ];
  const reasoning = { effort: 'low' };
  const envelope = executionEnvelope({}, { input, reasoning });
  const fingerprint = envelope.fingerprint;

  input[1].content = 'Mutated caller value.';
  input.push({ role: 'user', content: 'Added after construction.' });
  reasoning.effort = 'high';

  assert.equal(envelope.request.input.length, 2);
  assert.equal(envelope.request.input[1].content, 'Original request.');
  assert.equal(envelope.request.reasoning.effort, 'low');
  assert.equal(envelope.fingerprint, fingerprint);
  assert.equal(Object.isFrozen(envelope), true);
  assert.equal(Object.isFrozen(envelope.request), true);
  assert.equal(Object.isFrozen(envelope.request.input), true);
  assert.equal(Object.isFrozen(envelope.request.input[0]), true);
  assert.equal(Object.isFrozen(envelope.request.reasoning), true);

  assert.throws(() => {
    envelope.request.input[1].content = 'Direct mutation.';
  }, TypeError);
  assert.throws(() => {
    envelope.request.input.push({ role: 'user', content: 'Direct append.' });
  }, TypeError);
  assert.equal(envelope.request.input[1].content, 'Original request.');
  assert.equal(envelope.fingerprint, fingerprint);
});

test('equivalent envelope data has a deterministic fingerprint independent of object key order', () => {
  const first = executionEnvelope();
  const second = createProviderExecutionEnvelope({
    maxRetries: 2,
    timeoutMs: 30000,
    executionRole: 'root',
    processingMode: 'standard',
    canonicalModel: 'gpt-6-luna',
    requestedModel: 'gpt-6-luna',
    provider: 'openai',
    request: {
      store: false,
      max_output_tokens: 512,
      reasoning: { effort: 'low' },
      input: [
        { content: 'Be precise.', role: 'system' },
        { content: 'Explain the contract.', role: 'user' },
      ],
      model: 'gpt-6-luna',
    },
  });

  assert.equal(first.fingerprint, second.fingerprint);
  assertProviderExecutionEnvelopeIntegrity(first);
  assertProviderExecutionEnvelopeIntegrity(second);
});

test('material execution changes produce distinct fingerprints', () => {
  const base = executionEnvelope();
  const changed = [
    executionEnvelope({ requestedModel: 'gpt-6-luna-snapshot' }),
    executionEnvelope({ canonicalModel: 'gpt-6-luna-other' }),
    executionEnvelope({ processingMode: 'fast' }),
    executionEnvelope({ executionRole: 'draft' }),
    executionEnvelope({ executionRole: 'verifier' }),
    executionEnvelope({ executionRole: 'repair' }),
    executionEnvelope({ timeoutMs: 15000 }),
    executionEnvelope({ maxRetries: 0 }),
    executionEnvelope({}, { model: 'gpt-6-luna-snapshot' }),
    executionEnvelope({}, { reasoning: { effort: 'high' } }),
    executionEnvelope({}, { max_output_tokens: 1024 }),
    executionEnvelope({}, {
      input: [
        { role: 'system', content: 'Be precise.' },
        { role: 'user', content: 'Changed provider input.' },
      ],
    }),
  ];

  for (const candidate of changed) {
    assert.notEqual(candidate.fingerprint, base.fingerprint);
  }
});

test('integrity validation rejects reconstructed drift with a stale fingerprint', () => {
  const envelope = executionEnvelope();
  const drifted = {
    ...envelope,
    processing_mode: 'fast',
  };

  assert.throws(
    () => assertProviderExecutionEnvelopeIntegrity(drifted),
    /fingerprint mismatch/
  );
});

test('trustworthy token preflight binds the count to the exact envelope fingerprint', async () => {
  const envelope = executionEnvelope({ executionRole: 'verifier' });
  const counter = {
    async countInputTokens(received) {
      assert.strictEqual(received, envelope);
      return {
        provider: received.provider,
        envelope_fingerprint: received.fingerprint,
        input_tokens: 321,
        source: 'deterministic-test-counter',
      };
    },
  };

  const result = await countProviderExecutionInputTokens(envelope, counter);
  assert.deepEqual(result, {
    provider: 'openai',
    envelope_fingerprint: envelope.fingerprint,
    input_tokens: 321,
    source: 'deterministic-test-counter',
  });
  assert.equal(Object.isFrozen(result), true);
});

test('token preflight fails closed when count is unavailable', async () => {
  const envelope = executionEnvelope();
  const counter = {
    async countInputTokens() {
      throw new Error('Synthetic token counter unavailable');
    },
  };

  await assert.rejects(
    countProviderExecutionInputTokens(envelope, counter),
    /token counter unavailable/
  );
});

test('token preflight rejects provider, fingerprint, source, and numeric drift', () => {
  const envelope = executionEnvelope();
  const valid = {
    provider: 'openai',
    envelope_fingerprint: envelope.fingerprint,
    input_tokens: 100,
    source: 'deterministic-test-counter',
  };

  assert.throws(
    () => validateProviderInputTokenCount(envelope, { ...valid, provider: 'other' }),
    /provider does not match/
  );
  assert.throws(
    () => validateProviderInputTokenCount(envelope, {
      ...valid,
      envelope_fingerprint: `sha256:${'0'.repeat(64)}`,
    }),
    /fingerprint/
  );
  assert.throws(
    () => validateProviderInputTokenCount(envelope, { ...valid, source: '   ' }),
    /source must be a non-empty string/
  );

  for (const inputTokens of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(
      () => validateProviderInputTokenCount(envelope, { ...valid, input_tokens: inputTokens }),
      /non-negative safe integer/
    );
  }
});

test('envelope construction rejects non-JSON and invalid execution policy inputs', () => {
  assert.throws(
    () => executionEnvelope({ timeoutMs: 0 }),
    /timeout_ms must be a positive safe integer/
  );
  assert.throws(
    () => executionEnvelope({ maxRetries: -1 }),
    /max_retries must be a non-negative safe integer/
  );
  assert.throws(
    () => executionEnvelope({}, { temperature: Number.NaN }),
    /non-finite number/
  );
  assert.throws(
    () => executionEnvelope({}, { invalid: undefined }),
    /contains undefined/
  );
  assert.throws(
    () => executionEnvelope({}, { invalid: new Date() }),
    /non-plain object/
  );
});
