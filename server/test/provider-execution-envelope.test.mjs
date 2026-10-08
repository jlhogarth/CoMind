import assert from 'node:assert/strict';
import test from 'node:test';

const {
  DeterministicProviderInputTokenCounter,
  assertProviderExecutionEnvelopeIntegrity,
  assertProviderInputTokenPreflight,
  createProviderExecutionEnvelope,
  preflightProviderInputTokens,
} = await import('../dist/providers/provider-execution-envelope.js');

function makeEnvelope(overrides = {}) {
  const request = overrides.request ?? {
    model: 'gpt-6-luna',
    input: [{ role: 'user', content: 'Hello' }],
    store: false,
    reasoning: { effort: 'low' },
    max_output_tokens: 512,
  };

  return createProviderExecutionEnvelope({
    provider: overrides.provider ?? 'openai',
    requestedModel: overrides.requestedModel ?? 'gpt-6-luna',
    canonicalModel: overrides.canonicalModel === undefined ? 'gpt-6-luna' : overrides.canonicalModel,
    processingMode: overrides.processingMode ?? 'standard',
    executionRole: overrides.executionRole ?? 'root',
    timeoutMs: overrides.timeoutMs ?? 30000,
    maxRetries: overrides.maxRetries ?? 2,
    request,
  });
}

test('provider execution envelope is deeply immutable and detached from caller-owned input', () => {
  const input = [{ role: 'user', content: 'Original' }];
  const request = {
    model: 'gpt-6-luna',
    input,
    store: false,
    reasoning: { effort: 'low' },
    max_output_tokens: 512,
  };
  const envelope = makeEnvelope({ request });

  input[0].content = 'Caller mutation';
  request.reasoning.effort = 'high';
  request.max_output_tokens = 1024;

  assert.equal(envelope.request.input[0].content, 'Original');
  assert.equal(envelope.request.reasoning.effort, 'low');
  assert.equal(envelope.request.max_output_tokens, 512);
  assert.equal(Object.isFrozen(envelope), true);
  assert.equal(Object.isFrozen(envelope.request), true);
  assert.equal(Object.isFrozen(envelope.request.input), true);
  assert.equal(Object.isFrozen(envelope.request.input[0]), true);
  assert.equal(Object.isFrozen(envelope.request.reasoning), true);

  assert.throws(() => {
    envelope.request.input[0].content = 'Direct mutation';
  }, TypeError);
  assert.equal(envelope.request.input[0].content, 'Original');
  assertProviderExecutionEnvelopeIntegrity(envelope);
});

test('equivalent envelope data has a deterministic fingerprint independent of object key insertion order', () => {
  const first = makeEnvelope();
  const second = makeEnvelope({
    request: {
      max_output_tokens: 512,
      reasoning: { effort: 'low' },
      store: false,
      input: [{ content: 'Hello', role: 'user' }],
      model: 'gpt-6-luna',
    },
  });

  assert.equal(first.fingerprint, second.fingerprint);
  assert.match(first.fingerprint, /^sha256:[0-9a-f]{64}$/);
});

test('material execution identity changes produce different fingerprints', () => {
  const baseline = makeEnvelope();
  const variants = [
    makeEnvelope({ requestedModel: 'gpt-6-luna-2026-09-22' }),
    makeEnvelope({ canonicalModel: null }),
    makeEnvelope({ processingMode: 'fast' }),
    makeEnvelope({ executionRole: 'verifier' }),
    makeEnvelope({ timeoutMs: 31000 }),
    makeEnvelope({ maxRetries: 1 }),
    makeEnvelope({
      request: {
        ...baseline.request,
        max_output_tokens: 513,
      },
    }),
    makeEnvelope({
      request: {
        ...baseline.request,
        reasoning: { effort: 'high' },
      },
    }),
    makeEnvelope({
      request: {
        ...baseline.request,
        input: [{ role: 'user', content: 'Different input' }],
      },
    }),
  ];

  for (const variant of variants) {
    assert.notEqual(variant.fingerprint, baseline.fingerprint);
  }
});

test('root draft verifier and repair remain independently attributable', () => {
  const roles = ['root', 'draft', 'verifier', 'repair'];
  const envelopes = roles.map((executionRole) => makeEnvelope({ executionRole }));

  assert.deepEqual(envelopes.map((envelope) => envelope.execution_role), roles);
  assert.equal(new Set(envelopes.map((envelope) => envelope.fingerprint)).size, roles.length);
});

test('preflight binds a trustworthy deterministic input count to the exact envelope fingerprint', async () => {
  const envelope = makeEnvelope();
  const counter = new DeterministicProviderInputTokenCounter(
    (countedEnvelope) => {
      assert.strictEqual(countedEnvelope, envelope);
      return 137;
    },
    'deterministic-test-counter'
  );

  const preflight = await preflightProviderInputTokens(envelope, counter);

  assert.deepEqual(preflight, {
    provider: 'openai',
    counter: 'deterministic-test-counter',
    envelope_fingerprint: envelope.fingerprint,
    input_tokens: 137,
  });
  assert.equal(Object.isFrozen(preflight), true);
  assert.equal(assertProviderInputTokenPreflight(envelope, preflight), 137);
});

test('preflight fails closed for unavailable or malformed input-token counts', async () => {
  const envelope = makeEnvelope();
  const invalidCounts = [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1, undefined];

  for (const invalid of invalidCounts) {
    const counter = {
      name: 'invalid-test-counter',
      async countInputTokens() {
        return invalid;
      },
    };
    await assert.rejects(
      preflightProviderInputTokens(envelope, counter),
      /non-negative safe integer/
    );
  }

  const unavailable = {
    name: 'unavailable-test-counter',
    async countInputTokens() {
      throw new Error('Token count unavailable');
    },
  };
  await assert.rejects(preflightProviderInputTokens(envelope, unavailable), /Token count unavailable/);
});

test('preflight rejects execution-envelope drift after counting', async () => {
  const envelope = makeEnvelope();
  const preflight = await preflightProviderInputTokens(
    envelope,
    new DeterministicProviderInputTokenCounter(() => 42, 'deterministic-test-counter')
  );

  const changed = [
    makeEnvelope({ requestedModel: 'gpt-6-luna-2026-09-22' }),
    makeEnvelope({ canonicalModel: null }),
    makeEnvelope({ processingMode: 'fast' }),
    makeEnvelope({ executionRole: 'repair' }),
    makeEnvelope({ timeoutMs: 45000 }),
    makeEnvelope({ maxRetries: 0 }),
    makeEnvelope({
      request: {
        ...envelope.request,
        max_output_tokens: 1024,
      },
    }),
    makeEnvelope({
      request: {
        ...envelope.request,
        reasoning: { effort: 'medium' },
      },
    }),
    makeEnvelope({
      request: {
        ...envelope.request,
        input: [{ role: 'user', content: 'Changed after count' }],
      },
    }),
  ];

  for (const driftedEnvelope of changed) {
    assert.throws(
      () => assertProviderInputTokenPreflight(driftedEnvelope, preflight),
      /fingerprint mismatch/
    );
  }
});

test('forged envelope content retaining an old fingerprint fails integrity verification', () => {
  const envelope = makeEnvelope();
  const forged = {
    ...envelope,
    request: {
      ...envelope.request,
      max_output_tokens: 4096,
    },
  };

  assert.throws(
    () => assertProviderExecutionEnvelopeIntegrity(forged),
    /fingerprint mismatch/
  );
});
