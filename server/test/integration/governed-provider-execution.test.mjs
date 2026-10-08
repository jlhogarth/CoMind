import assert from 'node:assert/strict';
import { after, test } from 'node:test';

const { closePool, query } = await import('../../dist/db.js');
const {
  CurrentRuntimeProviderBudgetAuthority,
} = await import('../../dist/providers/current-runtime-provider-budget-authority.js');
const {
  buildOpenAIProviderExecutionEnvelope,
  executeGovernedOpenAIProviderExecutionEnvelope,
} = await import('../../dist/providers/openai-execution.js');
const { openAIProviderSuccessMetadata } = await import('../../dist/providers/openai.js');
const {
  DeterministicProviderInputTokenCounter,
} = await import('../../dist/providers/provider-execution-envelope.js');

const bindingId = process.env.COMIND_TEST_BINDING_ID;
const conversationId = process.env.COMIND_TEST_CONVERSATION_ID;

if (!bindingId || !conversationId) {
  throw new Error('Governed provider integration fixture identifiers are required');
}

after(async () => {
  await closePool();
});

function assistantRequest() {
  return {
    conversationId,
    messages: [
      { role: 'system', content: 'Synthetic governed integration proof.' },
      { role: 'user', content: 'Return a deterministic synthetic response.' },
    ],
  };
}

function options(executionRole, attemptNumber = 1) {
  return {
    model: 'gpt-6-luna',
    processingMode: 'standard',
    executionRole,
    attemptNumber,
    reasoningEffort: 'low',
    maxOutputTokens: 512,
    timeoutMs: 30000,
    maxRetries: 0,
  };
}

async function executeRole(role, providerCalls) {
  const envelope = buildOpenAIProviderExecutionEnvelope(
    assistantRequest(),
    options(role)
  );
  const budgetAuthority = new CurrentRuntimeProviderBudgetAuthority(query, bindingId);
  const result = await executeGovernedOpenAIProviderExecutionEnvelope(
    {
      async create(providerRequest) {
        providerCalls.push({ role, providerRequest });
        assert.strictEqual(providerRequest, envelope.request);
        return {
          id: `resp-issue68-${role}-attempt-1`,
          model: 'gpt-6-luna',
          usage: {
            input_tokens: 100,
            output_tokens: 20,
            total_tokens: 120,
          },
        };
      },
    },
    envelope,
    new DeterministicProviderInputTokenCounter((countedEnvelope) => {
      assert.strictEqual(countedEnvelope, envelope);
      return 100;
    }, 'deterministic-issue68-integration-counter'),
    budgetAuthority
  );

  return {
    envelope,
    budgetAuthority,
    result,
    telemetry: openAIProviderSuccessMetadata(
      result.response,
      envelope,
      1,
      result.receipt
    ),
  };
}

test('isolated runtime proves count quote reserve execute persist settle and replay safety', async () => {
  const providerCalls = [];
  const roles = {};
  for (const role of ['root', 'draft', 'verifier', 'repair']) {
    roles[role] = await executeRole(role, providerCalls);
  }

  assert.equal(providerCalls.length, 4);
  assert.equal(new Set(Object.values(roles).map((value) => value.envelope.fingerprint)).size, 4);
  for (const value of Object.values(roles)) {
    assert.equal(value.result.receipt.input_token_preflight.input_tokens, 100);
    assert.equal(value.result.receipt.exposure_quote.max_input_tokens, 100);
    assert.equal(value.result.receipt.exposure_quote.max_output_tokens, 512);
    assert.equal(value.result.receipt.exposure_quote.maximum_exposure_usd, 0.0002685);
    assert.equal(value.result.receipt.reservation.reservation_status, 'reserved');
    assert.equal(value.result.receipt.reservation.idempotent, false);
    assert.equal(value.telemetry.request_fingerprint, value.envelope.fingerprint);
    assert.equal(value.telemetry.attempt_number, 1);
    assert.equal(value.telemetry.max_retries, 0);
    assert.equal(value.telemetry.cost.estimated_cost_usd, 0.00002);
    assert.equal(
      value.telemetry.governed_execution.reservation.reservation_id,
      value.result.receipt.reservation.reservation_id
    );
  }

  const rootMessage = await query(
    `INSERT INTO comind.cm_message (conv_id, role, content, meta)
     VALUES ($1::uuid, 'assistant', $2::text, $3::jsonb)
     RETURNING msg_id::text AS msg_id, meta`,
    [conversationId, 'Synthetic governed root response', JSON.stringify(roles.root.telemetry)]
  );
  const rootMessageId = rootMessage.rows[0].msg_id;

  const qualityMetadata = {
    ...roles.draft.telemetry,
    quality_gate: {
      risk: { level: 'high', reasons: ['integration_proof'] },
      verdict: 'revise',
      issue_categories: [],
      outcome: 'repaired',
      passes: [
        { role: 'draft', ...roles.draft.telemetry },
        { role: 'verifier', ...roles.verifier.telemetry },
        { role: 'repair', ...roles.repair.telemetry },
        { role: 'final', source_role: 'repair' },
      ],
    },
  };
  const qualityMessage = await query(
    `INSERT INTO comind.cm_message (conv_id, role, content, meta)
     VALUES ($1::uuid, 'assistant', $2::text, $3::jsonb)
     RETURNING msg_id::text AS msg_id, meta`,
    [conversationId, 'Synthetic governed repaired response', JSON.stringify(qualityMetadata)]
  );
  const qualityMessageId = qualityMessage.rows[0].msg_id;

  assert.equal(
    rootMessage.rows[0].meta.governed_execution.envelope_fingerprint,
    roles.root.envelope.fingerprint
  );
  const persistedPasses = qualityMessage.rows[0].meta.quality_gate.passes;
  for (const role of ['draft', 'verifier', 'repair']) {
    const persisted = persistedPasses.find((item) => item.role === role);
    assert.ok(persisted);
    assert.equal(persisted.attempt_number, 1);
    assert.equal(
      persisted.governed_execution.envelope_fingerprint,
      roles[role].envelope.fingerprint
    );
    assert.equal(
      persisted.governed_execution.reservation.reservation_id,
      roles[role].result.receipt.reservation.reservation_id
    );
  }

  const rootSettlement = await roles.root.budgetAuthority.settlePersistedMessageExecution(
    roles.root.result.receipt,
    rootMessageId
  );
  assert.equal(rootSettlement.reservation_status, 'finalized');
  assert.equal(rootSettlement.accounted_cost, '0.000020000000');
  assert.equal(rootSettlement.telemetry_locator, 'root');

  for (const role of ['draft', 'verifier', 'repair']) {
    const settlement = await roles[role].budgetAuthority.settlePersistedMessageExecution(
      roles[role].result.receipt,
      qualityMessageId
    );
    assert.equal(settlement.reservation_status, 'finalized');
    assert.equal(settlement.accounted_cost, '0.000020000000');
    assert.equal(settlement.telemetry_locator, `quality_gate.passes.${role}`);
  }

  const settlementReplay = await roles.root.budgetAuthority.settlePersistedMessageExecution(
    roles.root.result.receipt,
    rootMessageId
  );
  assert.equal(settlementReplay.idempotent, true);
  assert.equal(settlementReplay.reservation_id, rootSettlement.reservation_id);

  const callsBeforeExecutionReplay = providerCalls.length;
  await assert.rejects(
    executeGovernedOpenAIProviderExecutionEnvelope(
      {
        async create(providerRequest) {
          providerCalls.push({ role: 'root-replay', providerRequest });
          return { id: 'must-not-execute', model: 'gpt-6-luna' };
        },
      },
      roles.root.envelope,
      new DeterministicProviderInputTokenCounter(
        () => 100,
        'deterministic-issue68-integration-counter'
      ),
      roles.root.budgetAuthority
    ),
    /recovery must resolve the existing attempt/
  );
  assert.equal(providerCalls.length, callsBeforeExecutionReplay);

  const accounting = await query(
    `SELECT
       e.actual_cost::text AS actual_cost,
       e.reserved_cost::text AS reserved_cost,
       (SELECT COUNT(*)::int
          FROM public.comind_cost_reservations r
         WHERE r.envelope_id = e.id) AS reservation_count,
       (SELECT COUNT(*)::int
          FROM public.comind_usage_events u
         WHERE u.envelope_id = e.id) AS usage_count,
       (SELECT COUNT(*)::int
          FROM comind.cm_budget_authority_telemetry t
          JOIN comind.cm_budget_authority_reservation ar
            ON ar.reservation_id = t.reservation_id
         WHERE ar.binding_id = $1::uuid) AS telemetry_count
     FROM public.comind_workflow_cost_envelopes e
     JOIN comind.cm_budget_authority_binding b ON b.envelope_id = e.id
     WHERE b.binding_id = $1::uuid`,
    [bindingId]
  );

  assert.deepEqual(accounting.rows[0], {
    actual_cost: '0.000080000000',
    reserved_cost: '0.000000000000',
    reservation_count: 4,
    usage_count: 4,
    telemetry_count: 4,
  });
});
