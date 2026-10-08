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
}

interface RuntimeSettlementRow {
  reservation_id: string;
  usage_event_id: string | null;
  reservation_status: string;
  accounted_cost: string | null;
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

    return Object.freeze({
      reservation_id: row.reservation_id,
      usage_event_id: row.usage_event_id,
      reservation_status: row.reservation_status,
      accounted_cost: row.accounted_cost,
      idempotent: row.idempotent,
      telemetry_locator: telemetryLocator,
    });
  }
}
