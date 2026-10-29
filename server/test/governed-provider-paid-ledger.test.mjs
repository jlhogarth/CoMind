import assert from 'node:assert/strict';
import test from 'node:test';

const { executeGovernedProviderExecution: executeGovernedProviderExecutionRaw } = await import(
  '../dist/providers/governed-provider-execution.js'
);
const {
  createProviderExecutionEnvelope,
  DeterministicProviderInputTokenCounter,
} = await import('../dist/providers/provider-execution-envelope.js');
const { rulebookProviderInput } = await import('./support/rulebook-execution-preflight.mjs');

function executeGovernedProviderExecution(input) {
  return executeGovernedProviderExecutionRaw({
    ...input,
    rulebook: input.rulebook ?? rulebookProviderInput(),
  });
}

function envelope() {
  return createProviderExecutionEnvelope({
    provider: 'synthetic',
    requestedModel: 'synthetic-model',
    canonicalModel: 'synthetic-model',
    processingMode: 'standard',
    executionRole: 'root',
    attemptNumber: 1,
    timeoutMs: 30000,
    maxRetries: 0,
    request: {
      max_output_tokens: 50,
      input: 'synthetic',
    },
  });
}

function baseInput(executionEnvelope, paidExecutionLedger, execute) {
  return {
    envelope: executionEnvelope,
    inputTokenCounter: new DeterministicProviderInputTokenCounter(
      () => 25,
      'synthetic-paid-ledger-test-counter'
    ),
    exposureQuoter: {
      quoteExposure() {
        return {
          provider: 'synthetic',
          quotable: true,
          maximum_exposure_usd: 0.0005,
          currency: 'USD',
          failure_reason: null,
          max_input_tokens: 25,
          max_output_tokens: 50,
        };
      },
    },
    budgetAuthority: {
      async reserveProviderExecution() {
        return {
          reservation_id: '73',
          approved: true,
          reservation_status: 'reserved',
          decision_reason: 'synthetic approval',
          idempotent: false,
        };
      },
    },
    paidExecutionLedger,
    requestedToolCalls: 0,
    operationName: 'synthetic.create',
    execute,
  };
}

test('paid execution admission completes before provider execution begins', async () => {
  const events = [];
  const executionEnvelope = envelope();
  const paidExecutionLedger = {
    async admitProviderExecution(request) {
      events.push('admitted');
      assert.strictEqual(request.envelope, executionEnvelope);
      assert.equal(request.input_token_preflight.input_tokens, 25);
      assert.equal(request.exposure_quote.max_output_tokens, 50);
      assert.equal(request.reservation.reservation_id, '73');
      return {
        execution_id: '11111111-1111-4111-8111-111111111111',
        execution_status: 'running',
        idempotent: false,
      };
    },
    async recordProviderExecutionFailure() {
      events.push('failure');
      throw new Error('unexpected failure persistence');
    },
  };

  const result = await executeGovernedProviderExecution(
    baseInput(executionEnvelope, paidExecutionLedger, async () => {
      events.push('provider');
      assert.deepEqual(events, ['admitted', 'provider']);
      return { ok: true };
    })
  );

  assert.deepEqual(events, ['admitted', 'provider']);
  assert.equal(result.receipt.paid_execution.execution_id, '11111111-1111-4111-8111-111111111111');
  assert.equal(result.receipt.paid_execution.execution_status, 'running');
});

test('provider failure after admission persists paid execution failure before rethrow', async () => {
  const events = [];
  const executionEnvelope = envelope();
  const providerError = new Error('synthetic provider unavailable');
  const paidExecutionLedger = {
    async admitProviderExecution() {
      events.push('admitted');
      return {
        execution_id: '11111111-1111-4111-8111-111111111111',
        execution_status: 'running',
        idempotent: false,
      };
    },
    async recordProviderExecutionFailure(request) {
      events.push('failure-persisted');
      assert.equal(request.execution_id, '11111111-1111-4111-8111-111111111111');
      assert.equal(request.failure_code, 'provider_call_failed');
      assert.match(request.failure_report, /synthetic provider unavailable/);
      return {
        execution_id: request.execution_id,
        execution_status: 'failed',
        idempotent: false,
      };
    },
  };

  await assert.rejects(
    executeGovernedProviderExecution(
      baseInput(executionEnvelope, paidExecutionLedger, async () => {
        events.push('provider');
        throw providerError;
      })
    ),
    (error) => error === providerError
  );

  assert.deepEqual(events, ['admitted', 'provider', 'failure-persisted']);
});

test('provider failure plus failure-persistence failure is surfaced as aggregate failure', async () => {
  const executionEnvelope = envelope();
  const providerError = new Error('synthetic provider failure');
  const persistenceError = new Error('synthetic ledger failure');
  const paidExecutionLedger = {
    async admitProviderExecution() {
      return {
        execution_id: '11111111-1111-4111-8111-111111111111',
        execution_status: 'running',
        idempotent: false,
      };
    },
    async recordProviderExecutionFailure() {
      throw persistenceError;
    },
  };

  await assert.rejects(
    executeGovernedProviderExecution(
      baseInput(executionEnvelope, paidExecutionLedger, async () => {
        throw providerError;
      })
    ),
    (error) => {
      assert.ok(error instanceof AggregateError);
      assert.match(error.message, /failure persistence also failed/);
      assert.deepEqual(error.errors, [providerError, persistenceError]);
      return true;
    }
  );
});
