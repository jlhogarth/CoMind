import assert from 'node:assert/strict';
import test from 'node:test';

const {
  CurrentRuntimeProviderBudgetAuthority,
  currentRuntimeTelemetryLocatorForExecutionRole,
} = await import('../dist/providers/current-runtime-provider-budget-authority.js');

const fingerprint = `sha256:${'a'.repeat(64)}`;
const idempotencyKey = `provider-execution:${fingerprint}`;

function receipt(role = 'root') {
  return {
    schema_version: 1,
    provider: 'openai',
    operation_name: 'responses.create',
    execution_role: role,
    envelope_fingerprint: fingerprint,
    input_token_preflight: {
      provider: 'openai',
      counter: 'deterministic-test',
      envelope_fingerprint: fingerprint,
      input_tokens: 42,
    },
    exposure_quote: {
      provider: 'openai',
      quotable: true,
      maximum_exposure_usd: 0.0005,
      currency: 'USD',
      failure_reason: null,
    },
    reservation: {
      reservation_id: '73',
      idempotency_key: idempotencyKey,
      reservation_status: 'reserved',
      idempotent: false,
    },
  };
}

test('current runtime reservation delegates exact governed identity and exposure to Issue 59', async () => {
  const calls = [];
  const adapter = new CurrentRuntimeProviderBudgetAuthority(
    async (text, params) => {
      calls.push({ text, params });
      return {
        rows: [{
          reservation_id: '73',
          approved: true,
          reservation_status: 'reserved',
          decision_reason: 'approved',
          idempotent: false,
        }],
      };
    },
    '11111111-1111-4111-8111-111111111111'
  );

  const result = await adapter.reserveProviderExecution({
    provider: 'openai',
    operation_name: 'responses.create',
    execution_role: 'draft',
    envelope_fingerprint: fingerprint,
    idempotency_key: idempotencyKey,
    maximum_exposure_usd: 0.0005,
    currency: 'USD',
  });

  assert.deepEqual(result, {
    reservation_id: '73',
    approved: true,
    reservation_status: 'reserved',
    decision_reason: 'approved',
    idempotent: false,
  });
  assert.equal(calls.length, 1);
  assert.match(calls[0].text, /comind[.]cm_reserve_paid_provider_execution/);
  assert.deepEqual(calls[0].params, [
    '11111111-1111-4111-8111-111111111111',
    'openai',
    'responses.create',
    'draft',
    idempotencyKey,
    0.0005,
  ]);
});

test('current runtime reservation rejects an idempotency identity that is not derived from the envelope', async () => {
  let queried = false;
  const adapter = new CurrentRuntimeProviderBudgetAuthority(
    async () => {
      queried = true;
      return { rows: [] };
    },
    '11111111-1111-4111-8111-111111111111'
  );

  await assert.rejects(
    adapter.reserveProviderExecution({
      provider: 'openai',
      operation_name: 'responses.create',
      execution_role: 'root',
      envelope_fingerprint: fingerprint,
      idempotency_key: 'provider-execution:wrong',
      maximum_exposure_usd: 0.0005,
      currency: 'USD',
    }),
    /does not match envelope fingerprint/
  );
  assert.equal(queried, false);
});

test('current runtime reservation fails closed on ambiguous authority rows', async () => {
  const adapter = new CurrentRuntimeProviderBudgetAuthority(
    async () => ({ rows: [] }),
    '11111111-1111-4111-8111-111111111111'
  );

  await assert.rejects(
    adapter.reserveProviderExecution({
      provider: 'openai',
      operation_name: 'responses.create',
      execution_role: 'root',
      envelope_fingerprint: fingerprint,
      idempotency_key: idempotencyKey,
      maximum_exposure_usd: 0.0005,
      currency: 'USD',
    }),
    /ambiguous row count/
  );
});

test('post-persistence settlement derives the Issue 62 telemetry locator from the reserved execution role', async () => {
  const roleLocators = {
    root: 'root',
    draft: 'quality_gate.passes.draft',
    verifier: 'quality_gate.passes.verifier',
    repair: 'quality_gate.passes.repair',
  };

  for (const [role, expectedLocator] of Object.entries(roleLocators)) {
    const calls = [];
    const adapter = new CurrentRuntimeProviderBudgetAuthority(
      async (text, params) => {
        calls.push({ text, params });
        return {
          rows: [{
            reservation_id: '73',
            usage_event_id: '91',
            reservation_status: 'finalized',
            accounted_cost: '0.000321000000',
            idempotent: false,
          }],
        };
      },
      '11111111-1111-4111-8111-111111111111'
    );

    const result = await adapter.settlePersistedMessageExecution(
      receipt(role),
      '22222222-2222-4222-8222-222222222222'
    );

    assert.equal(currentRuntimeTelemetryLocatorForExecutionRole(role), expectedLocator);
    assert.equal(result.telemetry_locator, expectedLocator);
    assert.equal(result.reservation_id, '73');
    assert.match(calls[0].text, /comind[.]cm_finalize_paid_provider_message_execution/);
    assert.deepEqual(calls[0].params, [
      '73',
      '22222222-2222-4222-8222-222222222222',
      expectedLocator,
      'governed_provider_message_settlement',
    ]);
  }
});

test('post-persistence settlement refuses unsupported roles before database mutation', async () => {
  let queried = false;
  const adapter = new CurrentRuntimeProviderBudgetAuthority(
    async () => {
      queried = true;
      return { rows: [] };
    },
    '11111111-1111-4111-8111-111111111111'
  );

  await assert.rejects(
    adapter.settlePersistedMessageExecution(
      receipt('unexpected-role'),
      '22222222-2222-4222-8222-222222222222'
    ),
    /Unsupported provider execution role/
  );
  assert.equal(queried, false);
});

test('post-persistence settlement rejects conflicting reservation identity returned by authority', async () => {
  const adapter = new CurrentRuntimeProviderBudgetAuthority(
    async () => ({
      rows: [{
        reservation_id: '74',
        usage_event_id: '91',
        reservation_status: 'finalized',
        accounted_cost: '0.000321000000',
        idempotent: false,
      }],
    }),
    '11111111-1111-4111-8111-111111111111'
  );

  await assert.rejects(
    adapter.settlePersistedMessageExecution(
      receipt('root'),
      '22222222-2222-4222-8222-222222222222'
    ),
    /conflicting reservation identity/
  );
});
