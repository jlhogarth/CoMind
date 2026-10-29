import assert from 'node:assert/strict';
import test from 'node:test';

const { VeLifecycleCoordinator, VeLifecycleError } = await import('../dist/ve-lifecycle-coordinator.js');

function harness({ state = 'active', resources = [] } = {}) {
  const calls = [];
  const audits = [];
  const profile = { profile_id: '11111111-1111-4111-8111-111111111111', actor_id: '22222222-2222-4222-8222-222222222222', status: state };
  const queryFn = async (sql, params = []) => {
    calls.push({ sql, params });
    if (sql.includes("action IN ('ve.lifecycle.completed', 've.lifecycle.partial')")) return { rows: [{ count: 0 }] };
    if (sql.includes('FROM comind.cm_foundry_agent_profile') && sql.includes('SELECT')) return { rows: [{ ...profile }] };
    if (sql.includes('UPDATE comind.cm_foundry_agent_profile')) {
      if (profile.status !== params[1]) return { rows: [] };
      profile.status = params[2];
      return { rows: [{ profile_id: profile.profile_id }] };
    }
    if (sql.includes('UPDATE comind.cm_foundry_capability_grant')) return { rows: [{ grant_id: 'g1' }] };
    if (sql.includes('UPDATE comind.cm_foundry_authorization_request')) return { rows: [{ authorization_request_id: 'a1' }] };
    if (sql.includes('FROM comind.cm_actor_external_resource') && sql.includes('SELECT')) return { rows: resources };
    if (sql.includes('UPDATE comind.cm_actor_external_resource')) return { rows: [{ external_resource_id: params[0] }] };
    if (sql.includes('INSERT INTO comind.cm_audit_log')) {
      audits.push({ action: params[1], details: JSON.parse(params[3]) });
      return { rows: [] };
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  };
  return { queryFn, profile, calls, audits };
}

const baseInput = Object.freeze({
  profileId: '11111111-1111-4111-8111-111111111111',
  requestedByActorId: '33333333-3333-4333-8333-333333333333',
  reason: 'test transition',
  idempotencyKey: 've-test-1',
});

test('suspend fail-closes Foundry before external resource reconciliation', async () => {
  const resources = [{
    external_resource_id: '44444444-4444-4444-8444-444444444444',
    provider: 'google',
    resource_type: 'mailbox',
    external_subject: 've@example.test',
    lifecycle_status: 'active',
  }];
  const h = harness({ resources });
  const adapterCalls = [];
  const coordinator = new VeLifecycleCoordinator(h.queryFn, {
    google: {
      async suspend(resource) { adapterCalls.push(`suspend:${resource.externalSubject}`); },
      async retire() {},
    },
  });

  const result = await coordinator.transition('suspend', baseInput);
  assert.equal(result.status, 'succeeded');
  assert.equal(h.profile.status, 'suspended');
  assert.deepEqual(adapterCalls, ['suspend:ve@example.test']);
  const profileUpdate = h.calls.findIndex((call) => call.sql.includes('UPDATE comind.cm_foundry_agent_profile'));
  const resourceSelect = h.calls.findIndex((call) => call.sql.includes('FROM comind.cm_actor_external_resource'));
  assert.ok(profileUpdate >= 0 && profileUpdate < resourceSelect, 'profile must fail-close before provider work');
  assert.deepEqual(h.audits.map((entry) => entry.action), ['ve.lifecycle.started', 've.lifecycle.completed']);
});

test('suspend remains fail-closed and records partial when provider adapter is unavailable', async () => {
  const h = harness({ resources: [{
    external_resource_id: '44444444-4444-4444-8444-444444444444',
    provider: 'unknown_provider',
    resource_type: 'account',
    external_subject: 'subject-1',
    lifecycle_status: 'active',
  }] });
  const coordinator = new VeLifecycleCoordinator(h.queryFn);
  const result = await coordinator.transition('suspend', baseInput);
  assert.equal(result.status, 'partial');
  assert.equal(h.profile.status, 'suspended');
  assert.equal(result.steps.at(-1).errorCode, 'adapter_unavailable');
  assert.equal(h.audits.at(-1).action, 've.lifecycle.partial');
});

test('activation is blocked if a suspended external resource cannot be resumed', async () => {
  const h = harness({ state: 'suspended', resources: [{
    external_resource_id: '44444444-4444-4444-8444-444444444444',
    provider: 'google',
    resource_type: 'mailbox',
    external_subject: 've@example.test',
    lifecycle_status: 'suspended',
  }] });
  const coordinator = new VeLifecycleCoordinator(h.queryFn, {
    google: { async suspend() {}, async retire() {} },
  });
  const result = await coordinator.transition('activate', baseInput);
  assert.equal(result.status, 'partial');
  assert.equal(h.profile.status, 'suspended');
  assert.equal(result.steps[0].errorCode, 'adapter_unavailable');
});

test('retire revokes grants and pending authorizations without deleting provenance', async () => {
  const h = harness({ state: 'active' });
  const coordinator = new VeLifecycleCoordinator(h.queryFn);
  const result = await coordinator.transition('retire', baseInput);
  assert.equal(result.status, 'succeeded');
  assert.equal(h.profile.status, 'retired');
  assert.ok(h.calls.some((call) => call.sql.includes('UPDATE comind.cm_foundry_capability_grant')));
  assert.ok(h.calls.some((call) => call.sql.includes('UPDATE comind.cm_foundry_authorization_request')));
  assert.ok(!h.calls.some((call) => /DELETE\s+FROM/i.test(call.sql)));
});

test('illegal lifecycle transition is rejected before mutation', async () => {
  const h = harness({ state: 'retired' });
  const coordinator = new VeLifecycleCoordinator(h.queryFn);
  await assert.rejects(
    () => coordinator.transition('activate', baseInput),
    (error) => error instanceof VeLifecycleError && error.code === 'transition_not_allowed'
  );
  assert.ok(!h.calls.some((call) => call.sql.includes('UPDATE comind.cm_foundry_agent_profile')));
});
