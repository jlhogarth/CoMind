import assert from 'node:assert/strict';
import test from 'node:test';

const {
  executeGovernedProviderExecution,
  providerExecutionReservationIdempotencyKey,
} = await import('../dist/providers/governed-provider-execution.js');
const {
  DeterministicProviderInputTokenCounter,
  createProviderExecutionEnvelope,
} = await import('../dist/providers/provider-execution-envelope.js');

function envelope(overrides = {}) {
  return createProviderExecutionEnvelope({
    provider: 'openai',
    requestedModel: 'gpt-6-luna',
    canonicalModel: 'gpt-6-luna',
    processingMode: 'standard',
    executionRole: overrides.executionRole ?? 'root',
    attemptNumber: overrides.attemptNumber ?? 1,
    timeoutMs: 30000,
    maxRetries: overrides.maxRetries ?? 0,
    request: {
      model: 'gpt-6-luna',
      input: [{ role: 'user', content: 'Govern this exact provider execution.' }],
      reasoning: { effort: 'low' },
      store: false,
      max_output_tokens: 512,
    },
  });
}

function quote(overrides = {}) {
  return {
    provider: 'openai',
    quotable: true,
    maximum_exposure_usd: 0.000273,
    currency: 'USD',
    failure_reason: null,
    rate_card_version: 'test-rate-card',
    ...overrides,
  };
}

function authority(handler) {
  return {
    async reserveProviderExecution(request) {
      return handler(request);
    },
  };
}

test('governed execution binds count quote reservation and exact provider execution to one envelope', async () => {
  const exactEnvelope = envelope();
  const events = [];
  let reservationRequest;
  let executedEnvelope;

  const result = await executeGovernedProviderExecution({
    envelope: exactEnvelope,
    inputTokenCounter: new DeterministicProviderInputTokenCounter((countedEnvelope) => {
      events.push('count');
      assert.strictEqual(countedEnvelope, exactEnvelope);
      return 137;
    }, 'deterministic-governed-test'),
    exposureQuoter: {
      quoteExposure(quotedEnvelope, preflight) {
        events.push('quote');
        assert.strictEqual(quotedEnvelope, exactEnvelope);
        assert.equal(preflight.envelope_fingerprint, exactEnvelope.fingerprint);
        assert.equal(preflight.input_tokens, 137);
        return quote();
      },
    },
    budgetAuthority: authority(async (request) => {
      events.push('reserve');
      reservationRequest = request;
      return {
        reservation_id: '42',
        approved: true,
        reservation_status: 'reserved',
        decision_reason: 'approved',
        idempotent: false,
      };
    }),
    operationName: 'responses.create',
    async execute(executionEnvelope) {
      events.push('execute');
      executedEnvelope = executionEnvelope;
      return { id: 'resp-governed-1' };
    },
  });

  assert.deepEqual(events, ['count', 'quote', 'reserve', 'execute']);
  assert.strictEqual(executedEnvelope, exactEnvelope);
  assert.strictEqual(executedEnvelope.request, exactEnvelope.request);
  assert.deepEqual(result.response, { id: 'resp-governed-1' });
  assert.equal(result.receipt.envelope_fingerprint, exactEnvelope.fingerprint);
  assert.equal(result.receipt.execution_role, 'root');
  assert.equal(result.receipt.input_token_preflight.input_tokens, 137);
  assert.equal(result.receipt.exposure_quote.maximum_exposure_usd, 0.000273);
  assert.equal(result.receipt.reservation.reservation_id, '42');
  assert.equal(
    result.receipt.reservation.idempotency_key,
    providerExecutionReservationIdempotencyKey(exactEnvelope)
  );
  assert.deepEqual(reservationRequest, {
    provider: 'openai',
    operation_name: 'responses.create',
    execution_role: 'root',
    envelope_fingerprint: exactEnvelope.fingerprint,
    idempotency_key: providerExecutionReservationIdempotencyKey(exactEnvelope),
    maximum_exposure_usd: 0.000273,
    currency: 'USD',
  });
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.receipt), true);
  assert.equal(Object.isFrozen(result.receipt.reservation), true);
});

test('governed execution rejects automatic provider retries before token counting or reservation', async () => {
  let counted = false;
  let reserved = false;
  let executed = false;

  await assert.rejects(
    executeGovernedProviderExecution({
      envelope: envelope({ maxRetries: 1 }),
      inputTokenCounter: new DeterministicProviderInputTokenCounter(() => {
        counted = true;
        return 1;
      }),
      exposureQuoter: { quoteExposure: () => quote() },
      budgetAuthority: authority(async () => {
        reserved = true;
        throw new Error('must not reserve');
      }),
      operationName: 'responses.create',
      async execute() {
        executed = true;
      },
    }),
    /max_retries=0/
  );

  assert.equal(counted, false);
  assert.equal(reserved, false);
  assert.equal(executed, false);
});

test('governed execution fails closed before quote reservation or provider call when token counting fails', async () => {
  let quoted = false;
  let reserved = false;
  let executed = false;

  await assert.rejects(
    executeGovernedProviderExecution({
      envelope: envelope(),
      inputTokenCounter: {
        name: 'unavailable-counter',
        async countInputTokens() {
          throw new Error('exact token count unavailable');
        },
      },
      exposureQuoter: {
        quoteExposure() {
          quoted = true;
          return quote();
        },
      },
      budgetAuthority: authority(async () => {
        reserved = true;
        throw new Error('must not reserve');
      }),
      operationName: 'responses.create',
      async execute() {
        executed = true;
      },
    }),
    /exact token count unavailable/
  );

  assert.equal(quoted, false);
  assert.equal(reserved, false);
  assert.equal(executed, false);
});

test('governed execution fails closed before reservation or provider call when exposure is unquotable', async () => {
  let reserved = false;
  let executed = false;

  await assert.rejects(
    executeGovernedProviderExecution({
      envelope: envelope(),
      inputTokenCounter: new DeterministicProviderInputTokenCounter(() => 12),
      exposureQuoter: {
        quoteExposure() {
          return quote({
            quotable: false,
            maximum_exposure_usd: null,
            failure_reason: 'unknown_model',
          });
        },
      },
      budgetAuthority: authority(async () => {
        reserved = true;
        throw new Error('must not reserve');
      }),
      operationName: 'responses.create',
      async execute() {
        executed = true;
      },
    }),
    /unknown_model/
  );

  assert.equal(reserved, false);
  assert.equal(executed, false);
});

test('governed execution refuses provider execution when durable reservation is denied', async () => {
  let executed = false;

  await assert.rejects(
    executeGovernedProviderExecution({
      envelope: envelope(),
      inputTokenCounter: new DeterministicProviderInputTokenCounter(() => 12),
      exposureQuoter: { quoteExposure: () => quote() },
      budgetAuthority: authority(async () => ({
        reservation_id: null,
        approved: false,
        reservation_status: null,
        decision_reason: 'hard_limit_exceeded',
        idempotent: false,
      })),
      operationName: 'responses.create',
      async execute() {
        executed = true;
      },
    }),
    /hard_limit_exceeded/
  );

  assert.equal(executed, false);
});

test('governed execution refuses ambiguous approved reservations without durable identity', async () => {
  let executed = false;

  await assert.rejects(
    executeGovernedProviderExecution({
      envelope: envelope(),
      inputTokenCounter: new DeterministicProviderInputTokenCounter(() => 12),
      exposureQuoter: { quoteExposure: () => quote() },
      budgetAuthority: authority(async () => ({
        reservation_id: null,
        approved: true,
        reservation_status: 'reserved',
        decision_reason: null,
        idempotent: false,
      })),
      operationName: 'responses.create',
      async execute() {
        executed = true;
      },
    }),
    /missing its durable reservation identity/
  );

  assert.equal(executed, false);
});

test('attempt number is part of the immutable envelope and reservation identity', () => {
  const firstAttempt = envelope({ attemptNumber: 1 });
  const secondAttempt = envelope({ attemptNumber: 2 });

  assert.equal(firstAttempt.attempt_number, 1);
  assert.equal(secondAttempt.attempt_number, 2);
  assert.notEqual(firstAttempt.fingerprint, secondAttempt.fingerprint);
  assert.notEqual(
    providerExecutionReservationIdempotencyKey(firstAttempt),
    providerExecutionReservationIdempotencyKey(secondAttempt)
  );
});

test('the same immutable provider attempt always yields the same reservation idempotency key', () => {
  const exactEnvelope = envelope({ executionRole: 'repair', attemptNumber: 3 });
  assert.equal(
    providerExecutionReservationIdempotencyKey(exactEnvelope),
    providerExecutionReservationIdempotencyKey(exactEnvelope)
  );
  assert.match(
    providerExecutionReservationIdempotencyKey(exactEnvelope),
    /^provider-execution:sha256:[0-9a-f]{64}$/
  );
});

test('root draft verifier and repair receive distinct governed reservation identities', () => {
  const roles = ['root', 'draft', 'verifier', 'repair'];
  const keys = roles.map((executionRole) =>
    providerExecutionReservationIdempotencyKey(envelope({ executionRole }))
  );

  assert.equal(new Set(keys).size, roles.length);
});
