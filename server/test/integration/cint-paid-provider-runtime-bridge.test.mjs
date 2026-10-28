import assert from 'node:assert/strict';
import { after, test } from 'node:test';

const { closePool, query } = await import('../../dist/db.js');
const {
  CurrentRuntimeProviderBudgetAuthority,
} = await import('../../dist/providers/current-runtime-provider-budget-authority.js');
const { CurrentRuntimePaidApiLedger } = await import(
  '../../dist/providers/current-runtime-paid-api-ledger.js'
);
const {
  buildOpenAIProviderExecutionEnvelope,
  executeGovernedOpenAIProviderExecutionEnvelope,
} = await import('../../dist/providers/openai-execution.js');
const { openAIProviderSuccessMetadata } = await import('../../dist/providers/openai.js');
const {
  DeterministicProviderInputTokenCounter,
} = await import('../../dist/providers/provider-execution-envelope.js');

const bindingId = process.env.COMIND_CINT_FINOPS_BINDING_ID;
const conversationId = process.env.COMIND_CINT_FINOPS_CONVERSATION_ID;
const proposalId = process.env.COMIND_CINT_FINOPS_PROPOSAL_ID;
const fixtureAvailable = Boolean(bindingId && conversationId && proposalId);

if (fixtureAvailable) {
  after(async () => {
    await closePool();
  });
}

function assistantRequest() {
  return {
    conversationId,
    messages: [
      { role: 'system', content: 'Synthetic CINT-FINOPS-003 integration proof.' },
      { role: 'user', content: 'Return one deterministic synthetic response.' },
    ],
  };
}

function options() {
  return {
    model: 'gpt-6-luna',
    processingMode: 'standard',
    executionRole: 'root',
    attemptNumber: 1,
    reasoningEffort: 'low',
    maxOutputTokens: 512,
    timeoutMs: 30000,
    maxRetries: 0,
  };
}

async function executeSynthetic(providerCalls) {
  const envelope = buildOpenAIProviderExecutionEnvelope(assistantRequest(), options());
  const budgetAuthority = new CurrentRuntimeProviderBudgetAuthority(query, bindingId);
  const paidExecutionLedger = new CurrentRuntimePaidApiLedger(query, {
    proposalId,
    bindingId,
  });

  const result = await executeGovernedOpenAIProviderExecutionEnvelope(
    {
      async create(providerRequest) {
        providerCalls.push(providerRequest);
        assert.strictEqual(providerRequest, envelope.request);
        return {
          id: 'resp-cint-finops-003-integration-1',
          model: 'gpt-6-luna',
          status: 'completed',
          usage: {
            input_tokens: 100,
            input_tokens_details: { cached_tokens: 20 },
            output_tokens: 20,
            output_tokens_details: { reasoning_tokens: 5 },
            total_tokens: 120,
          },
        };
      },
    },
    envelope,
    new DeterministicProviderInputTokenCounter(
      (countedEnvelope) => {
        assert.strictEqual(countedEnvelope, envelope);
        return 100;
      },
      'deterministic-cint-finops-003-counter'
    ),
    budgetAuthority,
    paidExecutionLedger
  );

  return { envelope, budgetAuthority, paidExecutionLedger, result };
}

test(
  'CINT paid runtime bridge admits before synthetic provider execution and reconciles one immutable receipt after persisted settlement',
  { skip: !fixtureAvailable },
  async () => {
    const providerCalls = [];
    const first = await executeSynthetic(providerCalls);

    assert.equal(providerCalls.length, 1);
    assert.ok(first.result.receipt.paid_execution);
    assert.equal(first.result.receipt.paid_execution.execution_status, 'running');
    assert.equal(first.result.receipt.paid_execution.idempotent, false);
    assert.equal(first.result.receipt.input_token_preflight.input_tokens, 100);
    assert.equal(first.result.receipt.exposure_quote.max_output_tokens, 512);

    const telemetry = openAIProviderSuccessMetadata(
      first.result.response,
      first.envelope,
      1,
      first.result.receipt
    );

    assert.equal(
      telemetry.governed_execution.paid_execution.execution_id,
      first.result.receipt.paid_execution.execution_id
    );

    const message = await query(
      `INSERT INTO comind.cm_message (conv_id, role, content, meta)
       VALUES ($1::uuid, 'assistant', $2::text, $3::jsonb)
       RETURNING msg_id::text AS msg_id`,
      [
        conversationId,
        'Synthetic CINT paid runtime bridge response. No external provider call occurred.',
        JSON.stringify(telemetry),
      ]
    );
    const messageId = message.rows[0].msg_id;

    const settlement = await first.budgetAuthority.settlePersistedMessageExecution(
      first.result.receipt,
      messageId
    );

    assert.equal(settlement.reservation_status, 'finalized');
    assert.equal(settlement.accounted_cost, '0.000020000000');
    assert.equal(settlement.telemetry_locator, 'root');
    assert.equal(
      settlement.paid_execution_id,
      first.result.receipt.paid_execution.execution_id
    );
    assert.match(settlement.internal_receipt_number, /^COMIND-API-[0-9]{8}-[0-9]{10}$/);
    assert.equal(settlement.paid_execution_actual_expense, '0.000020000000');
    assert.equal(settlement.provider_status, 'succeeded');
    assert.equal(settlement.paid_execution_idempotent, false);

    const evidence = await query(
      `SELECT
         e.execution_status,
         e.actual_expense::text AS actual_expense,
         e.actual_input_tokens::text AS input_tokens,
         e.actual_cached_input_tokens::text AS cached_input_tokens,
         e.actual_output_tokens::text AS output_tokens,
         e.actual_reasoning_tokens::text AS reasoning_tokens,
         e.actual_total_tokens::text AS total_tokens,
         e.provider_execution_fingerprint,
         r.receipt_number,
         r.actual_cost::text AS receipt_cost,
         r.drive_sync_status,
         (SELECT COUNT(*)::int
            FROM public.comind_usage_events u
           WHERE u.reservation_id = e.reservation_id
             AND u.meter_code = 'provider_execution') AS usage_event_count,
         (SELECT COUNT(*)::int
            FROM comind.cm_api_cost_receipt rr
           WHERE rr.execution_id = e.execution_id) AS receipt_count,
         (SELECT COUNT(*)::int
            FROM comind.cm_unattributed_paid_usage_v x
           WHERE x.reservation_id = e.reservation_id) AS unattributed_count
       FROM comind.cm_paid_api_execution e
       JOIN comind.cm_api_cost_receipt r ON r.execution_id = e.execution_id
       WHERE e.execution_id = $1::uuid`,
      [first.result.receipt.paid_execution.execution_id]
    );

    assert.deepEqual(evidence.rows[0], {
      execution_status: 'reconciled',
      actual_expense: '0.000020000000',
      input_tokens: '100',
      cached_input_tokens: '20',
      output_tokens: '20',
      reasoning_tokens: '5',
      total_tokens: '120',
      provider_execution_fingerprint: first.envelope.fingerprint,
      receipt_number: settlement.internal_receipt_number,
      receipt_cost: '0.000020000000',
      drive_sync_status: 'pending',
      usage_event_count: 1,
      receipt_count: 1,
      unattributed_count: 0,
    });

    const settlementReplay = await first.budgetAuthority.settlePersistedMessageExecution(
      first.result.receipt,
      messageId
    );
    assert.equal(settlementReplay.idempotent, true);
    assert.equal(settlementReplay.paid_execution_idempotent, true);
    assert.equal(settlementReplay.internal_receipt_number, settlement.internal_receipt_number);

    const callsBeforeReplay = providerCalls.length;
    await assert.rejects(
      executeSynthetic(providerCalls),
      /recovery must resolve the existing attempt|request limit .* exhausted/
    );
    assert.equal(providerCalls.length, callsBeforeReplay);

    const finalCounts = await query(
      `SELECT
         (SELECT COUNT(*)::int FROM comind.cm_paid_api_execution WHERE proposal_id = $1::uuid) AS execution_count,
         (SELECT COUNT(*)::int
            FROM comind.cm_api_cost_receipt r
            JOIN comind.cm_paid_api_execution e ON e.execution_id = r.execution_id
           WHERE e.proposal_id = $1::uuid) AS receipt_count`,
      [proposalId]
    );
    assert.deepEqual(finalCounts.rows[0], { execution_count: 1, receipt_count: 1 });
  }
);
