import assert from 'node:assert/strict';
import test from 'node:test';

const { DurableConversationRecovery } = await import('../dist/conversation-stream-recovery.js');

function receipt(localSequence, overrides = {}) {
  return {
    generationId: '77777777-7777-4777-8777-777777777779',
    localSequence,
    providerEventType: 'response.output_text.delta',
    providerSequenceNumber: localSequence,
    providerResponseId: 'response-recovery-001',
    ...overrides,
  };
}

test('replays only durable events after the client acknowledgement without inference', async () => {
  let reads = 0;
  const recovery = new DurableConversationRecovery(async () => {
    reads += 1;
    return [receipt(1), receipt(2), receipt(3)];
  });
  const result = await recovery.resume(receipt(1).generationId, 1);
  assert.equal(reads, 1);
  assert.deepEqual(result.receipts.map((item) => item.localSequence), [2, 3]);
  assert.equal(result.nextLocalSequence, 4);
  assert.equal(result.interruption, null);
});

test('restart is idempotent when the durable reader returns already acknowledged events', async () => {
  const recovery = new DurableConversationRecovery(async () => [receipt(1), receipt(2), receipt(3)]);
  const first = await recovery.resume(receipt(1).generationId, 1);
  const restarted = await recovery.resume(receipt(1).generationId, 2);
  assert.deepEqual(first.receipts.map((item) => item.localSequence), [2, 3]);
  assert.deepEqual(restarted.receipts.map((item) => item.localSequence), [3]);
});

test('duplicate durable identities do not produce duplicate downstream replay', async () => {
  const recovery = new DurableConversationRecovery(async () => [receipt(2), receipt(2), receipt(3)]);
  const result = await recovery.resume(receipt(1).generationId, 1);
  assert.deepEqual(result.receipts.map((item) => item.localSequence), [2, 3]);
  assert.equal(result.interruption, 'duplicate_replay');
});

test('out-of-order durable reads are deterministically ordered before replay', async () => {
  const recovery = new DurableConversationRecovery(async () => [receipt(3), receipt(1), receipt(2)]);
  const result = await recovery.resume(receipt(1).generationId, 0);
  assert.deepEqual(result.receipts.map((item) => item.localSequence), [1, 2, 3]);
  assert.equal(result.interruption, null);
});

test('durable sequence gaps fail closed instead of fabricating missing events', async () => {
  const recovery = new DurableConversationRecovery(async () => [receipt(2), receipt(4)]);
  const result = await recovery.resume(receipt(1).generationId, 1);
  assert.deepEqual(result.receipts.map((item) => item.localSequence), [2]);
  assert.equal(result.interruption, 'unrecoverable_gap');
  assert.equal(result.nextLocalSequence, 3);
});

test('foreign generation receipts are never replayed into the requested generation', async () => {
  const recovery = new DurableConversationRecovery(async () => [
    receipt(1, { generationId: '88888888-8888-4888-8888-888888888889' }),
    receipt(1),
  ]);
  const result = await recovery.resume(receipt(1).generationId, 0);
  assert.equal(result.receipts.length, 1);
  assert.equal(result.receipts[0].generationId, receipt(1).generationId);
});
