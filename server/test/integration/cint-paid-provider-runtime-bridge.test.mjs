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

function assertSameMoney(actual, expected, label) {
  const actualNumber = Number(actual);
  const expectedNumber = Number(expected);
  assert.ok(Number.isFinite(actualNumber), `${label} actual value must be numeric`);
  assert.ok(Number.isFinite(expectedNumber), `${label} expected value must be numeric`);
  assert.equal(actualNumber, expectedNumber, label);
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
  'CINT paid runtime bridge preserves FinOps settlement across reconciliation failure and recovers without a second provider call or cost event',
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

    let reconciliationAttempts = 0;
    const postSettlementFailureQuery = async (text, params) => {
      if (text.includes('cm_reconcile_paid_api_execution_from_message')) {
        reconciliationAttempts += 1;
        throw new Error('synthetic post-settlement CINT reconciliation outage');
      }
      return query(text, params);
    };
    const interruptedBudgetAuthority = new CurrentRuntimeProviderBudgetAuthority(
      postSettlementFailureQuery,
      bindingId
    );

    await assert.rejects(
      interruptedBudgetAuthority.settlePersistedMessageExecution(
        first.result.receipt,
        messageId
      ),
      /synthetic post-settlement CINT reconciliation outage/
    );
    assert.equal(reconciliationAttempts, 1);
    assert.equal(providerCalls.length, 1);

    const interruptedEvidence = await query(
      `SELECT
         cr.status AS reservation_status,
         cr.finalized_cost::text AS finalized_cost,
         e.execution_status,
         (SELECT COUNT(*)::int
            FROM public.comind_usage_events u
           WHERE u.reservation_id = e.reservation_id
             AND u.meter_code = 'provider_execution') AS usage_event_count,
         (SELECT COUNT(*)::int
            FROM comind.cm_api_cost_receipt r
           WHERE r.execution_id = e.execution_id) AS receipt_count,
         (SELECT COUNT(*)::int
            FROM comind.cm_unattributed_paid_usage_v x
           WHERE x.reservation_id = e.reservation_id) AS unattributed_count,
         (SELECT COUNT(*)::int
            FROM comind.cm_paid_api_reconciliation_pending_v x
           WHERE x.execution_id = e.execution_id) AS reconciliation_pending_count
       FROM comind.cm_paid_api_execution e
       JOIN public.comind_cost_reservations cr ON cr.id = e.reservation_id
       WHERE e.execution_id = $1::uuid`,
      [first.result.receipt.paid_execution.execution_id]
    );

    assert.equal(interruptedEvidence.rows.length, 1);
    assert.equal(interruptedEvidence.rows[0].reservation_status, 'finalized');
    assert.ok(Number(interruptedEvidence.rows[0].finalized_cost) > 0);
    assert.equal(interruptedEvidence.rows[0].execution_status, 'running');
    assert.equal(interruptedEvidence.rows[0].usage_event_count, 1);
    assert.equal(interruptedEvidence.rows[0].receipt_count, 0);
    assert.equal(interruptedEvidence.rows[0].unattributed_count, 0);
    assert.equal(interruptedEvidence.rows[0].reconciliation_pending_count, 1);

    const callsBeforeRecovery = providerCalls.length;
    const settlement = await first.budgetAuthority.settlePersistedMessageExecution(
      first.result.receipt,
      messageId
    );

    assert.equal(providerCalls.length, callsBeforeRecovery);
    assert.equal(settlement.reservation_status, 'finalized');
    assert.ok(Number(settlement.accounted_cost) > 0);
    assert.equal(settlement.telemetry_locator, 'root');
    assert.equal(settlement.idempotent, true);
    assert.equal(
      settlement.paid_execution_id,
      first.result.receipt.paid_execution.execution_id
    );
    assert.match(settlement.internal_receipt_number, /^COMIND-API-[0-9]{8}-[0-9]{10}$/);
    assertSameMoney(
      settlement.paid_execution_actual_expense,
      settlement.accounted_cost,
      'recovered paid execution cost must equal authoritative FinOps cost'
    );
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
           WHERE x.reservation_id = e.reservation_id) AS unattributed_count,
         (SELECT COUNT(*)::int
            FROM comind.cm_paid_api_reconciliation_pending_v x
           WHERE x.execution_id = e.execution_id) AS reconciliation_pending_count
       FROM comind.cm_paid_api_execution e
       JOIN comind.cm_api_cost_receipt r ON r.execution_id = e.execution_id
       WHERE e.execution_id = $1::uuid`,
      [first.result.receipt.paid_execution.execution_id]
    );

    const { actual_expense: actualExpense, receipt_cost: receiptCost, ...stableEvidence } =
      evidence.rows[0];
    assertSameMoney(
      actualExpense,
      settlement.accounted_cost,
      'persisted execution cost must equal authoritative FinOps cost'
    );
    assertSameMoney(
      receiptCost,
      settlement.accounted_cost,
      'internal receipt cost must equal authoritative FinOps cost'
    );
    assert.deepEqual(stableEvidence, {
      execution_status: 'reconciled',
      input_tokens: '100',
      cached_input_tokens: '20',
      output_tokens: '20',
      reasoning_tokens: '5',
      total_tokens: '120',
      provider_execution_fingerprint: first.envelope.fingerprint,
      receipt_number: settlement.internal_receipt_number,
      drive_sync_status: 'pending',
      usage_event_count: 1,
      receipt_count: 1,
      unattributed_count: 0,
      reconciliation_pending_count: 0,
    });

    const settlementReplay = await first.budgetAuthority.settlePersistedMessageExecution(
      first.result.receipt,
      messageId
    );
    assert.equal(settlementReplay.idempotent, true);
    assert.equal(settlementReplay.paid_execution_idempotent, true);
    assert.equal(settlementReplay.internal_receipt_number, settlement.internal_receipt_number);
    assertSameMoney(
      settlementReplay.paid_execution_actual_expense,
      settlement.accounted_cost,
      'replayed reconciliation cost must remain stable'
    );
    assert.equal(providerCalls.length, callsBeforeRecovery);

    const callsBeforeReplay = providerCalls.length;
    await assert.rejects(
      executeSynthetic(providerCalls),
      /Existing reservation is no longer spendable|recovery must resolve the existing attempt|request limit .* exhausted/
    );
    assert.equal(providerCalls.length, callsBeforeReplay);

    const finalCounts = await query(
      `SELECT
         (SELECT COUNT(*)::int FROM comind.cm_paid_api_execution WHERE proposal_id = $1::uuid) AS execution_count,
         (SELECT COUNT(*)::int
            FROM comind.cm_api_cost_receipt r
            JOIN comind.cm_paid_api_execution e ON e.execution_id = r.execution_id
           WHERE e.proposal_id = $1::uuid) AS receipt_count,
         (SELECT COUNT(*)::int
            FROM public.comind_usage_events u
            JOIN comind.cm_paid_api_execution e ON e.reservation_id = u.reservation_id
           WHERE e.proposal_id = $1::uuid
             AND u.meter_code = 'provider_execution') AS usage_event_count,
         (SELECT COUNT(*)::int
            FROM comind.cm_paid_api_reconciliation_pending_v x
           WHERE x.proposal_id = $1::uuid) AS reconciliation_pending_count`,
      [proposalId]
    );
    assert.deepEqual(finalCounts.rows[0], {
      execution_count: 1,
      receipt_count: 1,
      usage_event_count: 1,
      reconciliation_pending_count: 0,
    });
  }
);
