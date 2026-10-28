import { QueryFunction } from '../db.js';
import {
  GovernedPaidExecutionAdmission,
  GovernedPaidExecutionAdmissionRequest,
  GovernedPaidExecutionFailureRequest,
  GovernedPaidExecutionLedger,
  ProviderExposureQuote,
} from './governed-provider-execution.js';

interface RuntimePaidExecutionRow {
  execution_id: string;
  execution_status: string;
  idempotent: boolean;
}

function requiredText(value: string, field: string) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${field} must be a non-empty string`);
  }
  return value;
}

function optionalIdentity(value: string | null | undefined, field: string) {
  if (value == null) return null;
  return requiredText(value, field);
}

function safeNonNegativeInteger(value: number | null | undefined, field: string) {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new Error(`${field} must be a non-negative safe integer`);
  }
  return value as number;
}

function assertRuntimePaidExecutionRow(
  rows: RuntimePaidExecutionRow[],
  operation: string
): GovernedPaidExecutionAdmission {
  if (rows.length !== 1) {
    throw new Error(`${operation} returned an ambiguous row count`);
  }
  const row = rows[0];
  requiredText(row.execution_id, `${operation} execution_id`);
  requiredText(row.execution_status, `${operation} execution_status`);
  if (typeof row.idempotent !== 'boolean') {
    throw new Error(`${operation} returned malformed idempotency data`);
  }
  return Object.freeze({
    execution_id: row.execution_id,
    execution_status: row.execution_status,
    idempotent: row.idempotent,
  });
}

export interface CurrentRuntimePaidApiLedgerOptions {
  proposalId: string;
  bindingId: string;
  foundryExecutionContextId?: string | null;
  routingDecisionId?: string | null;
}

export class CurrentRuntimePaidApiLedger implements GovernedPaidExecutionLedger {
  private readonly proposalId: string;
  private readonly bindingId: string;
  private readonly foundryExecutionContextId: string | null;
  private readonly routingDecisionId: string | null;

  constructor(
    private readonly queryFn: QueryFunction,
    options: CurrentRuntimePaidApiLedgerOptions
  ) {
    this.proposalId = requiredText(options.proposalId, 'proposalId');
    this.bindingId = requiredText(options.bindingId, 'bindingId');
    this.foundryExecutionContextId = optionalIdentity(
      options.foundryExecutionContextId,
      'foundryExecutionContextId'
    );
    this.routingDecisionId = optionalIdentity(options.routingDecisionId, 'routingDecisionId');
  }

  async admitProviderExecution<
    TRequest extends object,
    TQuote extends ProviderExposureQuote = ProviderExposureQuote,
  >(
    request: GovernedPaidExecutionAdmissionRequest<TRequest, TQuote>
  ): Promise<GovernedPaidExecutionAdmission> {
    const maxOutputTokens = safeNonNegativeInteger(
      request.exposure_quote.max_output_tokens,
      'provider exposure quote max_output_tokens'
    );
    safeNonNegativeInteger(
      request.input_token_preflight.input_tokens,
      'input token preflight input_tokens'
    );
    safeNonNegativeInteger(request.requested_tool_calls, 'requested_tool_calls');

    const result = await this.queryFn<RuntimePaidExecutionRow>(
      `SELECT
         execution_id::text AS execution_id,
         execution_status,
         idempotent
       FROM comind.cm_admit_paid_api_execution(
         $1::uuid,
         $2::uuid,
         $3::bigint,
         $4::text,
         $5::text,
         $6::text,
         $7::integer,
         $8::bigint,
         $9::bigint,
         $10::integer,
         $11::integer,
         $12::uuid,
         $13::bigint
       )`,
      [
        this.proposalId,
        this.bindingId,
        request.reservation.reservation_id,
        request.envelope.provider,
        request.envelope.requested_model,
        request.envelope.fingerprint,
        request.envelope.attempt_number,
        request.input_token_preflight.input_tokens,
        maxOutputTokens,
        request.envelope.max_retries,
        request.requested_tool_calls,
        this.foundryExecutionContextId,
        this.routingDecisionId,
      ]
    );

    return assertRuntimePaidExecutionRow(result.rows, 'Current runtime paid execution admission');
  }

  async recordProviderExecutionFailure(
    request: GovernedPaidExecutionFailureRequest
  ): Promise<GovernedPaidExecutionAdmission> {
    requiredText(request.execution_id, 'paid execution id');
    requiredText(request.failure_code, 'paid execution failure code');
    requiredText(request.failure_report, 'paid execution failure report');

    const result = await this.queryFn<RuntimePaidExecutionRow>(
      `SELECT
         execution_id::text AS execution_id,
         execution_status,
         idempotent
       FROM comind.cm_fail_paid_api_execution(
         $1::uuid,
         $2::text,
         $3::text
       )`,
      [request.execution_id, request.failure_code, request.failure_report]
    );

    const row = assertRuntimePaidExecutionRow(
      result.rows,
      'Current runtime paid execution failure persistence'
    );
    if (row.execution_id !== request.execution_id || row.execution_status !== 'failed') {
      throw new Error('Paid execution failure persistence returned conflicting execution state');
    }
    return row;
  }
}
