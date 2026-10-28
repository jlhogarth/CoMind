import assert from 'node:assert/strict';
import test from 'node:test';

const { CurrentRuntimeProviderBudgetAuthority } = await import(
  '../dist/providers/current-runtime-provider-budget-authority.js'
);

const fingerprint = `sha256:${'a'.repeat(64)}`;

function receipt() {
  return {
    schema_version: 1,
    provider: 'openai',
    operation_name: 'responses.create',
    execution_role: 'root',
    envelope_fingerprint: fingerprint,
    input_token_preflight: {
      provider: 'openai',
      counter: 'deterministic-test',
      envelope_fingerprint: fingerprint,
      input_tokens: 100,
    },
    exposure_quote: {
      provider: 'openai',
      quotable: true,
      maximum_exposure_usd: 0.0002685,
      currency: 'USD',
      failure_reason: null,
      max_input_tokens: 100,
      max_output_tokens: 512,
    },
    reservation: {
      reservation_id: '73',
      idempotency_key: `provider-execution:${fingerprint}`,
      reservation_status: 'reserved',
      idempotent: false,
    },
    paid_execution: {
      execution_id: '22222222-2222-4222-8222-222222222222',
      execution_status: 'running',
      idempotent: false,
    },
  };
}

test('message settlement reconciles FinOps first and then CINT paid execution receipt', async () => {
  const calls = [];
  const adapter = new CurrentRuntimeProviderBudgetAuthority(
    async (text, params) => {
      calls.push({ text, params });
      if (/cm_finalize_paid_provider_message_execution/.test(text)) {
        return {
          rows: [{
            reservation_id: '73',
            usage_event_id: '91',
            reservation_status: 'finalized',
            accounted_cost: '0.000020000000',
            idempotent: false,
          }],
        };
      }
      if (/cm_reconcile_paid_api_execution_from_message/.test(text)) {
        return {
          rows: [{
            execution_id: '22222222-2222-4222-8222-222222222222',
            usage_event_id: '91',
            receipt_id: '55555555-5555-4555-8555-555555555555',
            receipt_number: 'COMIND-API-20261028-0000000001',
            actual_expense: '0.000020000000',
            provider_status: 'succeeded',
            idempotent: false,
          }],
        };
      }
      throw new Error('Unexpected query');
    },
    '33333333-3333-4333-8333-333333333333'
  );

  const result = await adapter.settlePersistedMessageExecution(
    receipt(),
    '44444444-4444-4444-8444-444444444444'
  );

  assert.equal(calls.length, 2);
  assert.match(calls[0].text, /cm_finalize_paid_provider_message_execution/);
  assert.match(calls[1].text, /cm_reconcile_paid_api_execution_from_message/);
  assert.deepEqual(calls[1].params, [
    '22222222-2222-4222-8222-222222222222',
    '44444444-4444-4444-8444-444444444444',
    'root',
  ]);
  assert.deepEqual(result, {
    reservation_id: '73',
    usage_event_id: '91',
    reservation_status: 'finalized',
    accounted_cost: '0.000020000000',
    idempotent: false,
    telemetry_locator: 'root',
    paid_execution_id: '22222222-2222-4222-8222-222222222222',
    internal_receipt_id: '55555555-5555-4555-8555-555555555555',
    internal_receipt_number: 'COMIND-API-20261028-0000000001',
    paid_execution_actual_expense: '0.000020000000',
    provider_status: 'succeeded',
    paid_execution_idempotent: false,
  });
});

test('message settlement fails closed if CINT reconciliation points at a different FinOps usage event', async () => {
  let call = 0;
  const adapter = new CurrentRuntimeProviderBudgetAuthority(
    async () => {
      call += 1;
      if (call === 1) {
        return {
          rows: [{
            reservation_id: '73',
            usage_event_id: '91',
            reservation_status: 'finalized',
            accounted_cost: '0.000020000000',
            idempotent: false,
          }],
        };
      }
      return {
        rows: [{
          execution_id: '22222222-2222-4222-8222-222222222222',
          usage_event_id: '92',
          receipt_id: '55555555-5555-4555-8555-555555555555',
          receipt_number: 'COMIND-API-20261028-0000000001',
          actual_expense: '0.000020000000',
          provider_status: 'succeeded',
          idempotent: false,
        }],
      };
    },
    '33333333-3333-4333-8333-333333333333'
  );

  await assert.rejects(
    adapter.settlePersistedMessageExecution(
      receipt(),
      '44444444-4444-4444-8444-444444444444'
    ),
    /conflicting FinOps usage identity/
  );
});
