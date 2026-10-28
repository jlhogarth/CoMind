import assert from 'node:assert/strict';
import test from 'node:test';

const { CurrentRuntimePaidApiLedger } = await import(
  '../dist/providers/current-runtime-paid-api-ledger.js'
);

const fingerprint = `sha256:${'a'.repeat(64)}`;

function admissionRequest(overrides = {}) {
  return {
    envelope: {
      provider: 'openai',
      requested_model: 'gpt-6-luna',
      fingerprint,
      attempt_number: 1,
      max_retries: 0,
    },
    operation_name: 'responses.create',
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
    },
    requested_tool_calls: 0,
    ...overrides,
  };
}

test('current runtime paid ledger admits exact proposal/binding/reservation/provider identity', async () => {
  const calls = [];
  const ledger = new CurrentRuntimePaidApiLedger(
    async (text, params) => {
      calls.push({ text, params });
      return {
        rows: [{
          execution_id: '22222222-2222-4222-8222-222222222222',
          execution_status: 'running',
          idempotent: false,
        }],
      };
    },
    {
      proposalId: '11111111-1111-4111-8111-111111111111',
      bindingId: '33333333-3333-4333-8333-333333333333',
      foundryExecutionContextId: '44444444-4444-4444-8444-444444444444',
      routingDecisionId: '91',
    }
  );

  const result = await ledger.admitProviderExecution(admissionRequest());

  assert.deepEqual(result, {
    execution_id: '22222222-2222-4222-8222-222222222222',
    execution_status: 'running',
    idempotent: false,
  });
  assert.equal(calls.length, 1);
  assert.match(calls[0].text, /comind[.]cm_admit_paid_api_execution/);
  assert.deepEqual(calls[0].params, [
    '11111111-1111-4111-8111-111111111111',
    '33333333-3333-4333-8333-333333333333',
    '73',
    'openai',
    'gpt-6-luna',
    fingerprint,
    1,
    100,
    512,
    0,
    0,
    '44444444-4444-4444-8444-444444444444',
    '91',
  ]);
});

test('current runtime paid ledger rejects missing bounded output-token quote before persistence', async () => {
  let queried = false;
  const ledger = new CurrentRuntimePaidApiLedger(
    async () => {
      queried = true;
      return { rows: [] };
    },
    {
      proposalId: '11111111-1111-4111-8111-111111111111',
      bindingId: '33333333-3333-4333-8333-333333333333',
    }
  );

  await assert.rejects(
    ledger.admitProviderExecution(admissionRequest({
      exposure_quote: {
        provider: 'openai',
        quotable: true,
        maximum_exposure_usd: 0.0002685,
        currency: 'USD',
        failure_reason: null,
        max_input_tokens: 100,
        max_output_tokens: null,
      },
    })),
    /max_output_tokens must be a non-negative safe integer/
  );
  assert.equal(queried, false);
});

test('current runtime paid ledger persists fail-closed execution evidence', async () => {
  const calls = [];
  const ledger = new CurrentRuntimePaidApiLedger(
    async (text, params) => {
      calls.push({ text, params });
      return {
        rows: [{
          execution_id: '22222222-2222-4222-8222-222222222222',
          execution_status: 'failed',
          idempotent: false,
        }],
      };
    },
    {
      proposalId: '11111111-1111-4111-8111-111111111111',
      bindingId: '33333333-3333-4333-8333-333333333333',
    }
  );

  const result = await ledger.recordProviderExecutionFailure({
    execution_id: '22222222-2222-4222-8222-222222222222',
    failure_code: 'provider_call_failed',
    failure_report: 'Synthetic provider call failed after admission.',
  });

  assert.equal(result.execution_status, 'failed');
  assert.match(calls[0].text, /comind[.]cm_fail_paid_api_execution/);
  assert.deepEqual(calls[0].params, [
    '22222222-2222-4222-8222-222222222222',
    'provider_call_failed',
    'Synthetic provider call failed after admission.',
  ]);
});
