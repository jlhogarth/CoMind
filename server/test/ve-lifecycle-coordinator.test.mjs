import assert from 'node:assert/strict';
import test from 'node:test';

const { VeLifecycleCoordinator, VeLifecycleError } = await import('../dist/ve-lifecycle-coordinator.js');

const PROFILE_ID = '11111111-1111-4111-8111-111111111111';
const VE_ACTOR_ID = '22222222-2222-4222-8222-222222222222';
const REQUESTER_ID = '33333333-3333-4333-8333-333333333333';
const DECISION_ID = '55555555-5555-4555-8555-555555555555';

function harness({ state = 'active', resources = [], authorization = {} } = {}) {
  const calls = [];
  const audits = [];
  const profile = { profile_id: PROFILE_ID, actor_id: VE_ACTOR_ID, status: state };
  let currentAction = 'suspend';
  const queryFn = async (sql, params = []) => {
    calls.push({ sql, params });
    if (sql.includes("action IN ('ve.lifecycle.completed', 've.lifecycle.partial')")) return { rows: [{ count: 0 }] };
    if (sql.includes('FROM comind.cm_foundry_agent_profile') && sql.includes('SELECT')) return { rows: [{ ...profile }] };
    if (sql.includes('FROM comind.cm_foundry_authorization_decision')) return { rows: [{
      authorization_request_id: '66666666-6666-4666-8666-666666666666', requesting_actor_id: REQUESTER_ID,
      capability_code: `ve.lifecycle.${currentAction}`, authority_level: 'C2', environment: 'isolated',
      target_kind: 'foundry_agent_profile', target_ref: PROFILE_ID, request_status: 'approved',
      request_expires_at: '2099-01-01T00:00:00.000Z', decision: 'approved', effective_until: '2099-01-01T00:00:00.000Z',
      ...authorization,
    }] };
    if (sql.includes('UPDATE comind.cm_foundry_agent_profile')) {
      if (profile.status !== params[1]) return { rows: [] };
      profile.status = params[2];
      return { rows: [{ profile_id: profile.profile_id }] };
    }
    if (sql.includes('UPDATE comind.cm_foundry_capability_grant')) return { rows: [{ grant_id: 'g1' }] };
    if (sql.includes('UPDATE comind.cm_foundry_authorization_request')) return { rows: [{ authorization_request_id: 'a1' }] };
    if (sql.includes('FROM comind.cm_actor_external_resource') && sql.includes('SELECT')) return { rows: resources };
    if (sql.includes('UPDATE comind.cm_actor_external_resource')) return { rows: [{ external_resource_id: params[0] }] };
    if (sql.includes('INSERT INTO comind.cm_audit_log')) { audits.push({ action: params[1], details: JSON.parse(params[3]) }); return { rows: [] }; }
    throw new Error(`Unexpected SQL: ${sql}`);
  };
  return { queryFn, profile, calls, audits, setAction(action) { currentAction = action; } };
}

const baseInput = Object.freeze({ profileId: PROFILE_ID, requestedByActorId: REQUESTER_ID,
  authorizationDecisionId: DECISION_ID, reason: 'test transition', idempotencyKey: 've-test-1' });

async function transition(coordinator, harnessValue, action, input = baseInput) {
  harnessValue.setAction(action);
  return coordinator.transition(action, input);
}

test('suspend fail-closes Foundry before external resource reconciliation', async () => {
  const resources = [{ external_resource_id: '44444444-4444-4444-8444-444444444444', provider: 'google', resource_type: 'mailbox', external_subject: 've@example.test', lifecycle_status: 'active' }];
  const h = harness({ resources });
  const adapterCalls = [];
  const coordinator = new VeLifecycleCoordinator(h.queryFn, { google: { async suspend(resource) { adapterCalls.push(`suspend:${resource.externalSubject}`); }, async retire() {} } });
  const result = await transition(coordinator, h, 'suspend');
  assert.equal(result.status, 'succeeded');
  assert.equal(h.profile.status, 'suspended');
  assert.deepEqual(adapterCalls, ['suspend:ve@example.test']);
  const authCheck = h.calls.findIndex((call) => call.sql.includes('FROM comind.cm_foundry_authorization_decision'));
  const profileUpdate = h.calls.findIndex((call) => call.sql.includes('UPDATE comind.cm_foundry_agent_profile'));
  const resourceSelect = h.calls.findIndex((call) => call.sql.includes('FROM comind.cm_actor_external_resource'));
  assert.ok(authCheck >= 0 && authCheck < profileUpdate, 'authorization must precede mutation');
  assert.ok(profileUpdate < resourceSelect, 'profile must fail-close before provider work');
  assert.equal(h.audits[0].details.authorization_decision_id, DECISION_ID);
});

test('lifecycle transition rejects an authorization for another actor before mutation', async () => {
  const h = harness({ authorization: { requesting_actor_id: '77777777-7777-4777-8777-777777777777' } });
  const coordinator = new VeLifecycleCoordinator(h.queryFn);
  await assert.rejects(() => transition(coordinator, h, 'suspend'), (error) => error instanceof VeLifecycleError && error.code === 'authorization_scope_mismatch');
  assert.ok(!h.calls.some((call) => call.sql.includes('UPDATE comind.cm_foundry_agent_profile')));
});

test('lifecycle transition rejects wrong capability, target, or authority before mutation', async () => {
  for (const authorization of [
    { capability_code: 've.lifecycle.retire' },
    { target_ref: '88888888-8888-4888-8888-888888888888' },
    { authority_level: 'C1' },
  ]) {
    const h = harness({ authorization });
    const coordinator = new VeLifecycleCoordinator(h.queryFn);
    await assert.rejects(() => transition(coordinator, h, 'suspend'), (error) => error instanceof VeLifecycleError && error.code === 'authorization_scope_mismatch');
    assert.ok(!h.calls.some((call) => call.sql.includes('UPDATE comind.cm_foundry_agent_profile')));
  }
});

test('expired lifecycle authorization is rejected before mutation', async () => {
  const h = harness({ authorization: { effective_until: '2020-01-01T00:00:00.000Z' } });
  const coordinator = new VeLifecycleCoordinator(h.queryFn);
  await assert.rejects(() => transition(coordinator, h, 'suspend'), (error) => error instanceof VeLifecycleError && error.code === 'authorization_expired');
  assert.ok(!h.calls.some((call) => call.sql.includes('UPDATE comind.cm_foundry_agent_profile')));
});

test('suspend remains fail-closed and records partial when provider adapter is unavailable', async () => {
  const h = harness({ resources: [{ external_resource_id: '44444444-4444-4444-8444-444444444444', provider: 'unknown_provider', resource_type: 'account', external_subject: 'subject-1', lifecycle_status: 'active' }] });
  const coordinator = new VeLifecycleCoordinator(h.queryFn);
  const result = await transition(coordinator, h, 'suspend');
  assert.equal(result.status, 'partial'); assert.equal(h.profile.status, 'suspended');
  assert.equal(result.steps.at(-1).errorCode, 'adapter_unavailable'); assert.equal(h.audits.at(-1).action, 've.lifecycle.partial');
});

test('activation is blocked if a suspended external resource cannot be resumed', async () => {
  const h = harness({ state: 'suspended', resources: [{ external_resource_id: '44444444-4444-4444-8444-444444444444', provider: 'google', resource_type: 'mailbox', external_subject: 've@example.test', lifecycle_status: 'suspended' }] });
  const coordinator = new VeLifecycleCoordinator(h.queryFn, { google: { async suspend() {}, async retire() {} } });
  const result = await transition(coordinator, h, 'activate');
  assert.equal(result.status, 'partial'); assert.equal(h.profile.status, 'suspended'); assert.equal(result.steps[0].errorCode, 'adapter_unavailable');
});

test('retire revokes grants and pending authorizations without deleting provenance', async () => {
  const h = harness({ state: 'active' }); const coordinator = new VeLifecycleCoordinator(h.queryFn);
  const result = await transition(coordinator, h, 'retire');
  assert.equal(result.status, 'succeeded'); assert.equal(h.profile.status, 'retired');
  assert.ok(h.calls.some((call) => call.sql.includes('UPDATE comind.cm_foundry_capability_grant')));
  assert.ok(h.calls.some((call) => call.sql.includes('UPDATE comind.cm_foundry_authorization_request')));
  assert.ok(!h.calls.some((call) => /DELETE\s+FROM/i.test(call.sql)));
});

test('illegal lifecycle transition is rejected before authorization lookup or mutation', async () => {
  const h = harness({ state: 'retired' }); const coordinator = new VeLifecycleCoordinator(h.queryFn);
  await assert.rejects(() => transition(coordinator, h, 'activate'), (error) => error instanceof VeLifecycleError && error.code === 'transition_not_allowed');
  assert.ok(!h.calls.some((call) => call.sql.includes('FROM comind.cm_foundry_authorization_decision')));
  assert.ok(!h.calls.some((call) => call.sql.includes('UPDATE comind.cm_foundry_agent_profile')));
});
