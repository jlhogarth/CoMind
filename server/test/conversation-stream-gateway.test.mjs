import assert from 'node:assert/strict';
import test from 'node:test';

const { DurableConversationStreamGateway } = await import('../dist/conversation-stream-gateway.js');

function event(overrides = {}) {
  return {
    provider: 'synthetic-provider',
    providerEventType: 'response.output_text.delta',
    providerSequenceNumber: 7,
    providerResponseId: 'response-001',
    observedAt: '2026-10-31T21:00:00.000Z',
    stage: 'direct',
    payload: { delta: 'bounded synthetic text' },
    ...overrides,
  };
}

function input(overrides = {}) {
  return {
    generationId: '66666666-6666-4666-8666-666666666669',
    localSequence: 1,
    event: event(),
    ...overrides,
  };
}

test('persists before downstream delivery eligibility', async () => {
  const order = [];
  const gateway = new DurableConversationStreamGateway(
    async () => { order.push('persist'); },
    async () => { order.push('deliver'); }
  );
  await gateway.accept(input());
  assert.deepEqual(order, ['persist', 'deliver']);
});

test('does not deliver when durable persistence fails', async () => {
  let delivered = false;
  const gateway = new DurableConversationStreamGateway(
    async () => { throw new Error('synthetic persistence failure'); },
    async () => { delivered = true; }
  );
  await assert.rejects(gateway.accept(input()), /synthetic persistence failure/);
  assert.equal(delivered, false);
});

test('client disconnect cannot roll back an accepted durable event', async () => {
  let persisted = 0;
  const gateway = new DurableConversationStreamGateway(
    async () => { persisted += 1; },
    async () => { throw new Error('synthetic client disconnect'); }
  );
  const receipt = await gateway.accept(input());
  assert.equal(persisted, 1);
  assert.equal(receipt.localSequence, 1);
  assert.equal(receipt.providerSequenceNumber, 7);
});

test('duplicate and out-of-order provider identities remain visible to the durable writer', async () => {
  const observed = [];
  const gateway = new DurableConversationStreamGateway(async (accepted) => {
    observed.push([accepted.localSequence, accepted.event.providerSequenceNumber]);
  });
  await gateway.accept(input({ localSequence: 1, event: event({ providerSequenceNumber: 9 }) }));
  await gateway.accept(input({ localSequence: 2, event: event({ providerSequenceNumber: 9 }) }));
  await gateway.accept(input({ localSequence: 3, event: event({ providerSequenceNumber: 4 }) }));
  assert.deepEqual(observed, [[1, 9], [2, 9], [3, 4]]);
});

test('gateway keeps no restart-critical acknowledgement state', async () => {
  const durableLedger = [];
  const persist = async (accepted) => { durableLedger.push(accepted.localSequence); };
  const firstProcess = new DurableConversationStreamGateway(persist);
  await firstProcess.accept(input({ localSequence: 1 }));
  const restartedProcess = new DurableConversationStreamGateway(persist);
  await restartedProcess.accept(input({ localSequence: 2 }));
  assert.deepEqual(durableLedger, [1, 2]);
});
