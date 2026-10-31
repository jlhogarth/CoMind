import assert from 'node:assert/strict';
import test from 'node:test';

const {
  ConversationGovernanceBindingError,
  resolveConversationExecutionGovernance,
  toRulebookExecutionBaseContext,
} = await import('../dist/providers/conversation-governance-binding.js');

const conversationId = '11111111-1111-4111-8111-111111111111';

function validGovernance(overrides = {}) {
  return {
    conversation_id: conversationId,
    asset_key: `conversation:${conversationId}`,
    classification_key: 'INTERNAL',
    classification_rank: 10,
    purpose: 'assistant-response',
    tenant_key: 'org:22222222-2222-4222-8222-222222222222',
    project_scope_key: 'project:33333333-3333-4333-8333-333333333333',
    source_tenant: 'org:22222222-2222-4222-8222-222222222222',
    target_tenant: 'org:22222222-2222-4222-8222-222222222222',
    source_project: 'project:33333333-3333-4333-8333-333333333333',
    target_project: 'project:33333333-3333-4333-8333-333333333333',
    destination_key: 'OPENAI-API',
    human_approved: true,
    egress_review_state: 'approved',
    egress_reviewed_at: '2026-10-29T04:00:00.000Z',
    egress_review_expires_at: '2026-10-29T05:00:00.000Z',
    ...overrides,
  };
}

test('conversation governance resolver reads one authoritative database result and preserves only static governance context', async () => {
  const calls = [];
  const resolved = await resolveConversationExecutionGovernance(async (sql, params) => {
    calls.push({ sql, params });
    return { rows: [{ governance: validGovernance() }] };
  }, {
    governanceProjectKey: 'COMIND',
    conversationId,
    destinationKey: 'OPENAI-API',
  });

  assert.equal(resolved.classification_key, 'INTERNAL');
  assert.equal(resolved.classification_rank, 10);
  assert.equal(resolved.human_approved, true);
  assert.equal(Object.isFrozen(resolved), true);
  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /resolve_conversation_execution_governance/);
  assert.deepEqual(calls[0].params, ['COMIND', conversationId, 'OPENAI-API']);

  assert.deepEqual(toRulebookExecutionBaseContext(resolved), {
    asset_key: `conversation:${conversationId}`,
    purpose: 'assistant-response',
    tenant_key: 'org:22222222-2222-4222-8222-222222222222',
    source_tenant: 'org:22222222-2222-4222-8222-222222222222',
    target_tenant: 'org:22222222-2222-4222-8222-222222222222',
    source_project: 'project:33333333-3333-4333-8333-333333333333',
    target_project: 'project:33333333-3333-4333-8333-333333333333',
    human_approved: true,
  });
});

test('conversation governance resolver rejects identity or scope drift', async () => {
  for (const governance of [
    validGovernance({ conversation_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }),
    validGovernance({ destination_key: 'OTHER' }),
    validGovernance({ target_tenant: 'org:other' }),
    validGovernance({ target_project: 'project:other' }),
    validGovernance({ asset_key: 'conversation:wrong' }),
  ]) {
    await assert.rejects(
      resolveConversationExecutionGovernance(async () => ({ rows: [{ governance }] }), {
        governanceProjectKey: 'COMIND',
        conversationId,
        destinationKey: 'OPENAI-API',
      }),
      (error) => error instanceof ConversationGovernanceBindingError
        && error.code === 'conversation_governance_result_invalid'
    );
  }
});

test('conversation governance resolver rejects approval without expiry and inconsistent review state', async () => {
  await assert.rejects(
    resolveConversationExecutionGovernance(async () => ({
      rows: [{ governance: validGovernance({ egress_review_expires_at: null }) }],
    }), {
      governanceProjectKey: 'COMIND', conversationId, destinationKey: 'OPENAI-API',
    }),
    (error) => error instanceof ConversationGovernanceBindingError
      && error.code === 'conversation_governance_result_invalid'
      && /expiry/.test(error.message)
  );

  await assert.rejects(
    resolveConversationExecutionGovernance(async () => ({
      rows: [{ governance: validGovernance({ human_approved: false }) }],
    }), {
      governanceProjectKey: 'COMIND', conversationId, destinationKey: 'OPENAI-API',
    }),
    (error) => error instanceof ConversationGovernanceBindingError
      && /inconsistent/.test(error.message)
  );
});

test('conversation governance resolver rejects undeclared result fields including raw-sensitive drift', async () => {
  await assert.rejects(
    resolveConversationExecutionGovernance(async () => ({
      rows: [{ governance: validGovernance({ prompt: 'must not cross the governance boundary' }) }],
    }), {
      governanceProjectKey: 'COMIND', conversationId, destinationKey: 'OPENAI-API',
    }),
    (error) => error instanceof ConversationGovernanceBindingError
      && error.code === 'conversation_governance_result_invalid'
      && /unsupported keys: prompt/.test(error.message)
  );
});

test('conversation governance resolver fails closed on invalid input or database failure', async () => {
  await assert.rejects(
    resolveConversationExecutionGovernance(async () => ({ rows: [] }), {
      governanceProjectKey: 'COMIND', conversationId: 'not-a-uuid', destinationKey: 'OPENAI-API',
    }),
    (error) => error instanceof ConversationGovernanceBindingError
      && error.code === 'conversation_governance_input_invalid'
  );

  await assert.rejects(
    resolveConversationExecutionGovernance(async () => { throw new Error('db unavailable'); }, {
      governanceProjectKey: 'COMIND', conversationId, destinationKey: 'OPENAI-API',
    }),
    (error) => error instanceof ConversationGovernanceBindingError
      && error.code === 'conversation_governance_unavailable'
  );
});
