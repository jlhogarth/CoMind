import test from 'node:test';
import assert from 'node:assert/strict';
import { promoteChatgptSuccessorBinding } from '../dist/browser-executor/chatgpt-successor-registry.js';

const predecessorBindingEventId = '22222222-2222-4222-8222-222222222222';
const workItemId = '33333333-3333-4333-8333-333333333333';
const successorBindingEventId = '44444444-4444-4444-8444-444444444444';
const successorUrl = 'https://chatgpt.com/c/55555555-5555-4555-8555-555555555555';

function input(overrides = {}) {
  return {
    workKey: 'AED-005',
    continuityId: 'aed-005-recovery-001',
    successorConversationUrl: successorUrl,
    expectedPredecessorBindingEventId: predecessorBindingEventId,
    predecessorConversationRefSha256: 'a'.repeat(64),
    registeredBy: 'aed-005-successor',
    ...overrides,
  };
}

function fakeClient(options = {}) {
  const calls = [];
  return {
    calls,
    async query(text, params = []) {
      calls.push({ text, params });
      if (text === 'BEGIN' || text === 'COMMIT' || text === 'ROLLBACK') return { rows: [] };
      if (text.includes('pg_advisory_xact_lock')) return { rows: [{}] };
      if (text.includes('FROM comind_pm.pm_work_items')) {
        return { rows: options.workItemMissing ? [] : [{ id: workItemId, title: 'AED-005 successor continuity' }] };
      }
      if (text.includes('FROM comind_pm.pm_lane_conversation_binding_events') && text.includes('ORDER BY')) {
        return {
          rows: [{
            id: options.currentBindingId ?? predecessorBindingEventId,
            event_type: options.currentEventType ?? 'bound',
            external_conversation_id: '11111111-1111-4111-8111-111111111111',
            registered_conversation_url: 'https://chatgpt.com/c/11111111-1111-4111-8111-111111111111',
          }],
        };
      }
      if (text.includes('count(*)::int AS bound_count')) {
        return { rows: [{ bound_count: options.boundCount ?? 1 }] };
      }
      if (text.includes('comind_pm.bind_lane_conversation')) {
        if (options.bindThrows) throw new Error('bind failed');
        return {
          rows: [{
            binding: {
              status: 'active',
              bindingEventId: successorBindingEventId,
              supersedesEventId: predecessorBindingEventId,
              created: true,
            },
          }],
        };
      }
      throw new Error(`Unexpected query: ${text}`);
    },
  };
}

test('promotes a verified successor only when the expected predecessor is still current', async () => {
  const client = fakeClient();
  const result = await promoteChatgptSuccessorBinding(client, input());
  assert.equal(result.promoted, true);
  assert.equal(result.bindingEventId, successorBindingEventId);
  assert.equal(result.supersedesEventId, predecessorBindingEventId);
  assert.equal(result.conversationGeneration, 2);
  assert.equal(result.desiredTitle, 'CoMind AED-005 #002');
  assert.match(result.successorConversationRefSha256, /^[a-f0-9]{64}$/);

  const bindCall = client.calls.find((call) => call.text.includes('comind_pm.bind_lane_conversation'));
  assert.ok(bindCall);
  assert.equal(bindCall.params[0], 'AED-005');
  assert.equal(bindCall.params[2], successorUrl);
  assert.equal(bindCall.params[5], 'aed-005:aed-005-recovery-001:successor-binding');
  const metadata = JSON.parse(bindCall.params[6]);
  assert.equal(metadata.conversationGeneration, 2);
  assert.equal(metadata.desiredTitle, 'CoMind AED-005 #002');
  assert.equal(metadata.expectedPredecessorBindingEventId, predecessorBindingEventId);
  assert.equal(client.calls.at(-1).text, 'COMMIT');
});

test('stale recovery cannot supersede a newer active conversation binding', async () => {
  const client = fakeClient({ currentBindingId: '66666666-6666-4666-8666-666666666666' });
  const result = await promoteChatgptSuccessorBinding(client, input());
  assert.equal(result.promoted, false);
  assert.equal(result.reason, 'successor_registry_predecessor_changed');
  assert.equal(result.recoverable, false);
  assert.equal(client.calls.some((call) => call.text.includes('comind_pm.bind_lane_conversation')), false);
  assert.equal(client.calls.at(-1).text, 'ROLLBACK');
});

test('inactive predecessor cannot be superseded', async () => {
  const client = fakeClient({ currentEventType: 'retired' });
  const result = await promoteChatgptSuccessorBinding(client, input());
  assert.equal(result.promoted, false);
  assert.equal(result.reason, 'successor_registry_predecessor_inactive');
  assert.equal(client.calls.at(-1).text, 'ROLLBACK');
});

test('invalid successor identity is rejected before a transaction starts', async () => {
  const client = fakeClient();
  const result = await promoteChatgptSuccessorBinding(client, input({ successorConversationUrl: 'https://untrusted.host.invalid/not-chatgpt' }));
  assert.equal(result.promoted, false);
  assert.equal(result.reason, 'successor_registry_identity_invalid');
  assert.equal(client.calls.length, 0);
});

test('registry mutation failure rolls back and remains recoverable', async () => {
  const client = fakeClient({ bindThrows: true });
  const result = await promoteChatgptSuccessorBinding(client, input());
  assert.equal(result.promoted, false);
  assert.equal(result.reason, 'successor_registry_promotion_failed');
  assert.equal(result.recoverable, true);
  assert.equal(client.calls.at(-1).text, 'ROLLBACK');
});
