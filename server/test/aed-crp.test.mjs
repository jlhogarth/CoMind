import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createEnvelope, dispatchReturn, sha256 } from '../dist/return-protocol/core.js';
import { createOpenAIAdapter, returnMessage } from '../dist/return-protocol/openai-adapter.js';
import { buildReturnFallbackService } from '../dist/return-protocol/fallback-service.js';
import { createFoundryReturnAuthority } from '../dist/return-protocol/authority.js';

const origin = (id, conversationId, ownerBinding) => ({ originId: id,
  surface: 'openai_api', conversationId, ownerBinding, workKey: 'CBE-004', authorityRef: 'test-authority' });

function envelopeFor(source, options = {}) {
  return createEnvelope({ origin: source, executionId: options.executionId ?? randomUUID(),
    recoveryId: randomUUID(), lease: { taskId: randomUUID(), leaseToken: randomUUID(),
      fencingEpoch: 1, workerInstanceId: 'test-worker' },
    contextArtifactRef: 'private://context', contextDigest: sha256('context'),
    resultArtifactRef: 'private://result', resultText: options.resultText ?? 'Verified recovery result',
    adapter: 'openai_api', authorizationRef: 'test-clear', clearApproved: true,
    expiresAt: new Date(Date.now() + 60_000).toISOString(), ...options });
}

class Store {
  rows = new Map();
  logical = new Map();
  async stage(envelope) {
    const duplicate = this.logical.get(envelope.logicalKey);
    if (duplicate) return this.rows.get(duplicate);
    const row = { envelope, state: 'QUEUED', attemptCount: 0, providerItemId: null,
      receiptDigest: null, lastReason: null };
    this.logical.set(envelope.logicalKey, envelope.returnId);
    this.rows.set(envelope.returnId, row);
    return row;
  }
  async get(id) { return this.rows.get(id) ?? null; }
  async claim(id, workerId) {
    const row = this.rows.get(id);
    if (!row || !['QUEUED', 'DELIVERY_UNCERTAIN'].includes(row.state)) return null;
    const fromState = row.state;
    row.state = 'DISPATCHING'; row.attemptCount++;
    return { record: row, fromState, claimToken: `${workerId}:${row.attemptCount}` };
  }
  async transition(id, workerId, token, state, evidence) {
    const row = this.rows.get(id);
    assert.equal(token, `${workerId}:${row.attemptCount}`);
    row.state = state; row.providerItemId = evidence.itemId ?? null;
    row.receiptDigest = evidence.receiptDigest ?? null; row.lastReason = evidence.reason ?? null;
    return row;
  }
}

function provider() {
  const items = new Map();
  let creates = 0;
  return {
    items, get creates() { return creates; },
    async *list(conversationId) { yield* items.get(conversationId) ?? []; },
    async create(conversationId, text) {
      creates++;
      const item = { id: randomUUID(), type: 'message', role: 'user', status: 'completed',
        content: [{ type: 'input_text', text }] };
      items.set(conversationId, [...(items.get(conversationId) ?? []), item]);
      return item;
    },
    async retrieve(conversationId, id) { return items.get(conversationId)?.find(item => item.id === id); },
  };
}

function authority(origins, options = {}) {
  return { async resolveOrigin(id) { return origins.get(id) ?? null; },
    async verifyLease() { return options.lease ?? true; },
    async verifyClear() { return options.clear ?? true; } };
}

test('two concurrent origins remain isolated; destination tampering and revocation are rejected', async () => {
  const a = origin(randomUUID(), 'conv_originA', 'owner-A');
  const b = origin(randomUUID(), 'conv_originB', 'owner-B');
  const origins = new Map([[a.originId, a], [b.originId, b]]);
  const store = new Store(); const client = provider();
  const ea = envelopeFor(a); const eb = envelopeFor(b);
  await Promise.all([store.stage(ea), store.stage(eb)]);
  const [ra, rb] = await Promise.all([
    dispatchReturn({ returnId: ea.returnId, workerId: 'A', store, authority: authority(origins),
      adapter: createOpenAIAdapter(client, 'owner-A') }),
    dispatchReturn({ returnId: eb.returnId, workerId: 'B', store, authority: authority(origins),
      adapter: createOpenAIAdapter(client, 'owner-B') }),
  ]);
  assert.equal(ra.state, 'RECEIPT_VERIFIED'); assert.equal(rb.state, 'RECEIPT_VERIFIED');
  assert.equal(client.creates, 2);
  assert.equal(client.items.get(a.conversationId)[0].content[0].text, returnMessage(ea));
  assert.equal(client.items.get(b.conversationId)[0].content[0].text, returnMessage(eb));

  const wrong = envelopeFor(a);
  await store.stage(wrong);
  const rejected = await dispatchReturn({ returnId: wrong.returnId, workerId: 'C', store,
    authority: authority(origins), adapter: createOpenAIAdapter(client, 'owner-B') });
  assert.equal(rejected.state, 'AUTHORIZATION_REJECTED');
  assert.equal(client.creates, 2);

  const revoked = envelopeFor(b);
  await store.stage(revoked); origins.delete(b.originId);
  const result = await dispatchReturn({ returnId: revoked.returnId, workerId: 'D', store,
    authority: authority(origins), adapter: createOpenAIAdapter(client, 'owner-B') });
  assert.equal(result.state, 'AUTHORIZATION_REJECTED');
});

test('ambiguous send is reconciled from provider readback without duplicate submission', async () => {
  const source = origin(randomUUID(), 'conv_recovery', 'owner-A');
  const payload = envelopeFor(source); const store = new Store(); await store.stage(payload);
  const client = provider();
  const interrupted = { ...client, async create(id, text) { await client.create(id, text);
    throw new Error('connection lost after write'); } };
  const auth = authority(new Map([[source.originId, source]]));
  const first = await dispatchReturn({ returnId: payload.returnId, workerId: 'first', store, authority: auth,
    adapter: createOpenAIAdapter(interrupted, 'owner-A') });
  assert.equal(first.state, 'DELIVERY_UNCERTAIN'); assert.equal(client.creates, 1);
  const second = await dispatchReturn({ returnId: payload.returnId, workerId: 'second', store, authority: auth,
    adapter: createOpenAIAdapter(client, 'owner-A') });
  assert.equal(second.state, 'RECEIPT_VERIFIED'); assert.equal(client.creates, 1);
  assert.equal(second.receiptDigest, sha256(returnMessage(payload)));
});

test('readback outage and absent receipt after ambiguity cannot trigger a blind resend', async () => {
  const source = origin(randomUUID(), 'conv_uncertain', 'owner-A');
  const payload = envelopeFor(source); const store = new Store(); await store.stage(payload);
  const client = provider();
  const auth = authority(new Map([[source.originId, source]]));
  const down = { ...client, async *list() { throw new Error('network down'); } };
  const first = await dispatchReturn({ returnId: payload.returnId, workerId: 'first', store, authority: auth,
    adapter: createOpenAIAdapter(down, 'owner-A') });
  assert.equal(first.state, 'DELIVERY_UNCERTAIN'); assert.equal(client.creates, 0);
  const second = await dispatchReturn({ returnId: payload.returnId, workerId: 'second', store, authority: auth,
    adapter: createOpenAIAdapter(client, 'owner-A') });
  assert.equal(second.state, 'DELIVERY_UNCERTAIN'); assert.equal(client.creates, 0);
});

test('logical return key prevents a second staged delivery', async () => {
  const source = origin(randomUUID(), 'conv_duplicate', 'owner-A');
  const first = envelopeFor(source);
  const second = createEnvelope({ ...first, origin: source, resultText: first.resultText,
    clearApproved: true, returnId: randomUUID() });
  const store = new Store();
  assert.equal((await store.stage(first)).envelope.returnId,
    (await store.stage(second)).envelope.returnId);
});

test('fallback HTTP read and recipient receipt enforce owner and integrity', async () => {
  const source = origin(randomUUID(), 'conv_test', 'owner-A');
  const payload = envelopeFor(source, { adapter: 'comind_fallback' });
  const row = { envelope: payload, state: 'QUEUED', receiptDigest: null };
  const tokenA = 'a'.repeat(48); const tokenB = 'b'.repeat(48);
  const principals = [
    { id: 'owner-A', token: tokenA, projects: ['COMIND'], expiresAt: '2099-01-01T00:00:00Z' },
    { id: 'owner-B', token: tokenB, projects: ['COMIND'], expiresAt: '2099-01-01T00:00:00Z' },
  ];
  const store = {
    async readFallback(id, owner) {
      if (id !== payload.returnId || owner !== 'owner-A') throw new Error('not found');
      return row;
    },
    async acknowledgeFallback(id, owner, digest) {
      if (id !== payload.returnId || owner !== 'owner-A' || digest !== payload.resultDigest)
        throw new Error('not found');
      row.state = 'ACKNOWLEDGED'; row.receiptDigest = digest; return row;
    },
  };
  const app = buildReturnFallbackService({ store, loadPrincipals: async () => principals });
  const url = `/v1/aed/returns/${payload.returnId}`;
  try {
    assert.equal((await app.inject({ method: 'GET', url })).statusCode, 401);
    assert.equal((await app.inject({ method: 'GET', url,
      headers: { authorization: `Bearer ${tokenB}` } })).statusCode, 404);
    const read = await app.inject({ method: 'GET', url,
      headers: { authorization: `Bearer ${tokenA}` } });
    assert.equal(read.statusCode, 200);
    assert.equal(read.json().resultDigest, sha256(read.json().resultText));
    assert.equal((await app.inject({ method: 'POST', url: `${url}/receipt`,
      headers: { authorization: `Bearer ${tokenA}` },
      payload: { resultDigest: sha256('wrong') } })).statusCode, 404);
    const ack = await app.inject({ method: 'POST', url: `${url}/receipt`,
      headers: { authorization: `Bearer ${tokenA}` },
      payload: { resultDigest: payload.resultDigest } });
    assert.equal(ack.json().state, 'ACKNOWLEDGED');
  } finally { await app.close(); }
});

test('Foundry authority rejects stale lease and requires the injected CLEAR resolver', async () => {
  const source = origin(randomUUID(), 'conv_lease', 'owner-A');
  const payload = envelopeFor(source); const store = new Store(); await store.stage(payload);
  const authority = createFoundryReturnAuthority({
    store: { async resolveOrigin() { return source; } },
    query: async () => ({ rows: [{ state: 'leased', worker_instance_id: 'test-worker',
      lease_token: payload.lease.leaseToken, fencing_epoch: 0,
      lease_expires_at: new Date(Date.now() + 60_000) }] }),
    verifyClear: async () => true,
  });
  const result = await dispatchReturn({ returnId: payload.returnId, workerId: 'worker', store,
    authority, adapter: createOpenAIAdapter(provider(), 'owner-A') });
  assert.equal(result.state, 'AUTHORIZATION_REJECTED');
  assert.equal(result.lastReason, 'lease_invalid');

  const second = envelopeFor(source); await store.stage(second);
  const clearDenied = createFoundryReturnAuthority({
    store: { async resolveOrigin() { return source; } },
    query: async () => ({ rows: [{ state: 'leased', worker_instance_id: 'test-worker',
      lease_token: second.lease.leaseToken, fencing_epoch: 1,
      lease_expires_at: new Date(Date.now() + 60_000) }] }),
    verifyClear: async () => false,
  });
  const denied = await dispatchReturn({ returnId: second.returnId, workerId: 'worker', store,
    authority: clearDenied, adapter: createOpenAIAdapter(provider(), 'owner-A') });
  assert.equal(denied.state, 'AUTHORIZATION_REJECTED');
  assert.equal(denied.lastReason, 'clear_invalid');
});
