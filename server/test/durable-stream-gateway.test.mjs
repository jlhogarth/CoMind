import assert from 'node:assert/strict';
import test from 'node:test';

import { DurableStreamGateway } from '../dist/durable-stream-gateway.js';

const event = (sequence, type = 'response.output_text.delta') => ({
  provider: 'openai',
  providerEndpoint: 'responses.create',
  providerEventType: type,
  providerSequenceNumber: sequence,
  providerResponseId: 'resp-cfr002b',
  observedAt: '2026-10-31T00:00:00.000Z',
  stage: 'direct',
  payload: { sequence },
});

const receipt = sequence => ({
  acquisitionObservationId: `obs-${sequence}`,
  normalizationId: `norm-${sequence}`,
  normalizationStatus: 'normalized',
  normalizationClass: 'provider_event',
});

test('CFR-002B persists each provider event before downstream delivery', async () => {
  const order = [];
  const gateway = new DurableStreamGateway(
    async input => {
      order.push(`persist:${input.localSequence}`);
      return receipt(input.localSequence);
    },
    async delivery => {
      order.push(`deliver:${delivery.localSequence}`);
      assert.equal(delivery.receipt.acquisitionObservationId, `obs-${delivery.localSequence}`);
    }
  );

  await gateway.accept({ conversationId: 'conv', generationId: 'gen', event: event(7) });
  await gateway.accept({ conversationId: 'conv', generationId: 'gen', event: event(8) });

  assert.deepEqual(order, ['persist:1', 'deliver:1', 'persist:2', 'deliver:2']);
});

test('CFR-002B delivery interruption cannot erase already persisted evidence', async () => {
  const persisted = [];
  const gateway = new DurableStreamGateway(
    async input => {
      persisted.push(input.event.providerSequenceNumber);
      return receipt(input.localSequence);
    },
    async () => {
      throw new Error('client disconnected');
    }
  );

  await assert.rejects(
    gateway.accept({ conversationId: 'conv', generationId: 'gen', event: event(11) }),
    /client disconnected/
  );
  assert.deepEqual(persisted, [11]);
});

test('CFR-002B persistence failure prevents downstream delivery', async () => {
  let deliveries = 0;
  const gateway = new DurableStreamGateway(
    async () => { throw new Error('durability unavailable'); },
    async () => { deliveries += 1; }
  );

  await assert.rejects(
    gateway.accept({ conversationId: 'conv', generationId: 'gen', event: event(12) }),
    /durability unavailable/
  );
  assert.equal(deliveries, 0);
});

test('CFR-002B preserves duplicate and out-of-order provider sequence evidence', async () => {
  const writes = [];
  const gateway = new DurableStreamGateway(
    async input => {
      writes.push({ local: input.localSequence, provider: input.event.providerSequenceNumber });
      return receipt(input.localSequence);
    },
    async () => undefined
  );

  await gateway.accept({ conversationId: 'conv', generationId: 'gen', event: event(9) });
  await gateway.accept({ conversationId: 'conv', generationId: 'gen', event: event(9) });
  await gateway.accept({ conversationId: 'conv', generationId: 'gen', event: event(8) });

  assert.deepEqual(writes, [
    { local: 1, provider: 9 },
    { local: 2, provider: 9 },
    { local: 3, provider: 8 },
  ]);
});
