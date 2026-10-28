import { QueryFunction } from '../db.js';
import {
  GovernedProviderBudgetAuthority,
  GovernedProviderExecutionReceipt,
  GovernedProviderReservation,
  GovernedProviderReservationRequest,
  ProviderExposureQuote,
} from './governed-provider-execution.js';

interface RuntimeReservationRow {
  reservation_id: string | null;
  approved: boolean;
  reservation_status: string | null;
  decision_reason: string | null;
  idempotent: boolean;
}

export interface CurrentRuntimeMessageSettlementResult {
  readonly reservation_id: string;
  readonly usage_event_id: string | null;
  readonly reservation_status: string;
  readonly accounted_cost: string | null;
  readonly idempotent: boolean;
  readonly telemetry_locator: string;
  readonly paid_execution_id?: string;
  readonly internal_receipt_id?: string;
  readonly internal_receipt_number?: string;
  readonly paid_execution_actual_expense?: string;
  readonly provider_status?: string;
  readonly paid_execution_idempotent?: boolean;
}

interface RuntimeSettlementRow {
  reservation_id: string;
  usage_event_id: string | null;
  reservation_status: string;
  accounted_cost: string | null;
  idempotent: boolean;
}

interface RuntimePaidReconciliationRow {
  execution_id: string;
  usage_event_id: string | null;
  receipt_id: string;
  receipt_number: string;
  actual_expense: string;
  provider_status: string;
  idempotent: boolean;
}

function requiredText(value: string, field: string) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${field} must be a non-empty string`);
  }
  return value;
}

function expectedReservationIdempotencyKey(fingerprint: string) {
  requiredText(fingerprint, 'envelope fingerprint');
  return `provider-execution:${fingerprint}`;
}

export function currentRuntimeTelemetryLocatorForExecutionRole(role: string) {
  switch (role) {
    case 'root':
      return 'root';
    case 'draft':
    case 'verifier':
    case 'repair':
      return `quality_gate.passes.${role}`;
    default:
      throw new Error(`Unsupported provider execution role for message settlement: ${role}`);
  }
}

export class CurrentRuntimeProviderBudgetAuthority implements GovernedProviderBudgetAuthority {
  constructor(
    private readonly queryFn: QueryFunction,
    private readonly bindingId: string
  ) {
    requiredText(bindingId, 'bindingId');
  }

  async reserveProviderExecution(
    request: GovernedProviderReservationRequest
  ): Promise<GovernedProviderReservation> {
    if (request.currency !== 'USD') {
      throw new Error('Current runtime paid-provider budget authority requires USD exposure');
    }
    const expectedKey = expectedReservationIdempotencyKey(request.envelope_fingerprint);
    if (request.idempotency_key !== expectedKey) {
      throw new Error('Provider reservation idempotency key does not match envelope fingerprint');
    }

    const result = await this.queryFn<RuntimeReservationRow>(
      `SELECT
         reservation_id::text AS reservation_id,
         approved,
         reservation_status,
         decision_reason,
         idempotent
       FROM comind.cm_reserve_paid_provider_execution(
         $1::uuid,
         $2::text,
         $3::text,
         $4::text,
         $5::text,
         $6::numeric
       )`,
      [
        this.bindingId,
        request.provider,
        request.operation_name,
        request.execution_role,
        request.idempotency_key,
        request.maximum_exposure_usd,
      ]
    );

    if (result.rows.length !== 1) {
      throw new Error('Current runtime provider reservation returned an ambiguous row count');
    }
    const row = result.rows[0];
    if (
      typeof row.approved !== 'boolean' ||
      typeof row.idempotent !== 'boolean' ||
      (row.reservation_id !== null && typeof row.reservation_id !== 'string')
    ) {
      throw new Error('Current runtime provider reservation returned malformed authority data');
    }

    return Object.freeze({
      reservation_id: row.reservation_id,
      approved: row.approved,
      reservation_status: row.reservation_status,
      decision_reason: row.decision_reason,
      idempotent: row.idempotent,
    });
  }

  async settlePersistedMessageExecution<TQuote extends ProviderExposureQuote>(
    receipt: GovernedProviderExecutionReceipt<TQuote>,
    messageId: string
  ): Promise<CurrentRuntimeMessageSettlementResult> {
    requiredText(messageId, 'messageId');
    const expectedKey = expectedReservationIdempotencyKey(receipt.envelope_fingerprint);
    if (receipt.reservation.idempotency_key !== expectedKey) {
      throw new Error('Governed execution receipt reservation identity is inconsistent');
    }

    const telemetryLocator = currentRuntimeTelemetryLocatorForExecutionRole(
      receipt.execution_role
    );
    const result = await this.queryFn<RuntimeSettlementRow>(
      `SELECT
         reservation_id::text AS reservation_id,
         usage_event_id::text AS usage_event_id,
         reservation_status,
         accounted_cost::text AS accounted_cost,
         idempotent
       FROM comind.cm_finalize_paid_provider_message_execution(
         $1::bigint,
         $2::uuid,
         $3::text,
         $4::text
       )`,
      [
        receipt.reservation.reservation_id,
        messageId,
        telemetryLocator,
        'governed_provider_message_settlement',
      ]
    );

    if (result.rows.length !== 1) {
      throw new Error('Current runtime provider settlement returned an ambiguous row count');
    }
    const row = result.rows[0];
    if (row.reservation_id !== receipt.reservation.reservation_id) {
      throw new Error('Current runtime provider settlement returned a conflicting reservation identity');
    }
    if (
      typeof row.reservation_status !== 'string' ||
      row.reservation_status.length === 0 ||
      typeof row.idempotent !== 'boolean'
    ) {
      throw new Error('Current runtime provider settlement returned malformed authority data');
    }

    const baseResult = {
      reservation_id: row.reservation_id,
      usage_event_id: row.usage_event_id,
      reservation_status: row.reservation_status,
      accounted_cost: row.accounted_cost,
      idempotent: row.idempotent,
      telemetry_locator: telemetryLocator,
    } as const;

    if (!receipt.paid_execution) {
      return Object.freeze(baseResult);
    }

    requiredText(receipt.paid_execution.execution_id, 'paid execution id');
    const paidResult = await this.queryFn<RuntimePaidReconciliationRow>(
      `SELECT
         execution_id::text AS execution_id,
         usage_event_id::text AS usage_event_id,
         receipt_id::text AS receipt_id,
         receipt_number,
         actual_expense::text AS actual_expense,
         provider_status,
         idempotent
       FROM comind.cm_reconcile_paid_api_execution_from_message(
         $1::uuid,
         $2::uuid,
         $3::text
       )`,
      [receipt.paid_execution.execution_id, messageId, telemetryLocator]
    );

    if (paidResult.rows.length !== 1) {
      throw new Error('Paid API reconciliation returned an ambiguous row count');
    }
    const paidRow = paidResult.rows[0];
    if (paidRow.execution_id !== receipt.paid_execution.execution_id) {
      throw new Error('Paid API reconciliation returned a conflicting execution identity');
    }
    if (
      row.usage_event_id !== null &&
      paidRow.usage_event_id !== null &&
      paidRow.usage_event_id !== row.usage_event_id
    ) {
      throw new Error('Paid API reconciliation returned a conflicting FinOps usage identity');
    }
    requiredText(paidRow.receipt_id, 'internal API receipt id');
    requiredText(paidRow.receipt_number, 'internal API receipt number');
    requiredText(paidRow.actual_expense, 'paid execution actual expense');
    requiredText(paidRow.provider_status, 'paid execution provider status');
    if (typeof paidRow.idempotent !== 'boolean') {
      throw new Error('Paid API reconciliation returned malformed idempotency data');
    }

    return Object.freeze({
      ...baseResult,
      paid_execution_id: paidRow.execution_id,
      internal_receipt_id: paidRow.receipt_id,
      internal_receipt_number: paidRow.receipt_number,
      paid_execution_actual_expense: paidRow.actual_expense,
      provider_status: paidRow.provider_status,
      paid_execution_idempotent: paidRow.idempotent,
    });
  }
}
