import assert from 'node:assert/strict';
import test from 'node:test';

const { executeGovernedProviderExecution } = await import(
  '../dist/providers/governed-provider-execution.js'
);
const {
  DeterministicProviderInputTokenCounter,
  createProviderExecutionEnvelope,
} = await import('../dist/providers/provider-execution-envelope.js');

function makeEnvelope(attemptNumber = 1) {
  return createProviderExecutionEnvelope({
    provider: 'openai',
    requestedModel: 'gpt-6-luna',
    canonicalModel: 'gpt-6-luna',
    processingMode: 'standard',
    executionRole: 'root',
    attemptNumber,
    timeoutMs: 30000,
    maxRetries: 0,
    request: {
      model: 'gpt-6-luna',
      input: [{ role: 'user', content: 'Replay safety' }],
      store: false,
      reasoning: { effort: 'low' },
      max_output_tokens: 128,
    },
  });
}

function executionInput(envelope, reservation, executed) {
  return {
    envelope,
    inputTokenCounter: new DeterministicProviderInputTokenCounter(() => 9),
    exposureQuoter: {
      quoteExposure: () => ({
        provider: 'openai',
        quotable: true,
        maximum_exposure_usd: 0.0001,
        currency: 'USD',
        failure_reason: null,
      }),
    },
    budgetAuthority: {
      async reserveProviderExecution() {
        return reservation;
      },
    },
    operationName: 'responses.create',
    async execute() {
      executed.count += 1;
      return { id: `response-${executed.count}` };
    },
  };
}

test('an idempotent reservation replay cannot authorize a second provider call', async () => {
  const exactEnvelope = makeEnvelope(1);
  const executed = { count: 0 };

  await assert.rejects(
    executeGovernedProviderExecution(
      executionInput(
        exactEnvelope,
        {
          reservation_id: '81',
          approved: true,
          reservation_status: 'reserved',
          decision_reason: 'idempotent_replay',
          idempotent: true,
        },
        executed
      )
    ),
    /recovery must resolve the existing attempt/
  );

  assert.equal(executed.count, 0);
});

test('a separately authorized retry requires a new attempt envelope', async () => {
  const first = makeEnvelope(1);
  const retry = makeEnvelope(2);

  assert.notEqual(first.fingerprint, retry.fingerprint);
  assert.equal(first.max_retries, 0);
  assert.equal(retry.max_retries, 0);
});
