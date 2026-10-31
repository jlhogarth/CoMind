import {
  ProviderExecutionEnvelope,
  ProviderInputTokenCounter,
  ProviderInputTokenPreflight,
  assertProviderExecutionEnvelopeIntegrity,
  assertProviderInputTokenPreflight,
  preflightProviderInputTokens,
} from './provider-execution-envelope.js';
import {
  RequiredRulebookExecutionPreflight,
  runRequiredRulebookExecutionPreflight,
} from './rulebook-execution-preflight.js';

export interface ProviderExposureQuote {
  readonly provider: string;
  readonly quotable: boolean;
  readonly maximum_exposure_usd: number | null;
  readonly currency: string;
  readonly failure_reason: string | null;
  readonly max_input_tokens?: number | null;
  readonly max_output_tokens?: number | null;
}

export interface ProviderExposureQuoter<
  TRequest extends object,
  TQuote extends ProviderExposureQuote = ProviderExposureQuote,
> {
  quoteExposure(
    envelope: ProviderExecutionEnvelope<TRequest>,
    preflight: ProviderInputTokenPreflight
  ): TQuote | Promise<TQuote>;
}

export interface GovernedProviderReservationRequest {
  readonly provider: string;
  readonly operation_name: string;
  readonly execution_role: string;
  readonly envelope_fingerprint: string;
  readonly idempotency_key: string;
  readonly maximum_exposure_usd: number;
  readonly currency: string;
}

export interface GovernedProviderReservation {
  readonly reservation_id: string | null;
  readonly approved: boolean;
  readonly reservation_status: string | null;
  readonly decision_reason: string | null;
  readonly idempotent: boolean;
}

export interface GovernedProviderBudgetAuthority {
  reserveProviderExecution(
    request: GovernedProviderReservationRequest
  ): Promise<GovernedProviderReservation>;
}

export interface GovernedPaidExecutionAdmission {
  readonly execution_id: string;
  readonly execution_status: string;
  readonly idempotent: boolean;
}

export interface GovernedPaidExecutionAdmissionRequest<
  TRequest extends object,
  TQuote extends ProviderExposureQuote = ProviderExposureQuote,
> {
  readonly envelope: ProviderExecutionEnvelope<TRequest>;
  readonly operation_name: string;
  readonly input_token_preflight: ProviderInputTokenPreflight;
  readonly exposure_quote: TQuote;
  readonly reservation: {
    readonly reservation_id: string;
    readonly idempotency_key: string;
    readonly reservation_status: string;
  };
  readonly requested_tool_calls: number;
}

export interface GovernedPaidExecutionFailureRequest {
  readonly execution_id: string;
  readonly failure_code: string;
  readonly failure_report: string;
}

export interface GovernedPaidExecutionLedger {
  admitProviderExecution<
    TRequest extends object,
    TQuote extends ProviderExposureQuote = ProviderExposureQuote,
  >(
    request: GovernedPaidExecutionAdmissionRequest<TRequest, TQuote>
  ): Promise<GovernedPaidExecutionAdmission>;

  recordProviderExecutionFailure(
    request: GovernedPaidExecutionFailureRequest
  ): Promise<GovernedPaidExecutionAdmission>;
}

export interface GovernedProviderExecutionReceipt<
  TQuote extends ProviderExposureQuote = ProviderExposureQuote,
> {
  readonly schema_version: 1;
  readonly provider: string;
  readonly operation_name: string;
  readonly execution_role: string;
  readonly envelope_fingerprint: string;
  readonly input_token_preflight: ProviderInputTokenPreflight;
  readonly exposure_quote: TQuote;
  readonly reservation: {
    readonly reservation_id: string;
    readonly idempotency_key: string;
    readonly reservation_status: string;
    readonly idempotent: boolean;
  };
  readonly paid_execution?: {
    readonly execution_id: string;
    readonly execution_status: string;
    readonly idempotent: boolean;
  };
}

export interface GovernedProviderExecutionResult<
  TResponse,
  TQuote extends ProviderExposureQuote = ProviderExposureQuote,
> {
  readonly response: TResponse;
  readonly receipt: GovernedProviderExecutionReceipt<TQuote>;
}

export interface GovernedProviderExecutionInput<
  TRequest extends object,
  TResponse,
  TQuote extends ProviderExposureQuote = ProviderExposureQuote,
> {
  readonly envelope: ProviderExecutionEnvelope<TRequest>;
  readonly rulebook: RequiredRulebookExecutionPreflight;
  readonly inputTokenCounter: ProviderInputTokenCounter<TRequest>;
  readonly exposureQuoter: ProviderExposureQuoter<TRequest, TQuote>;
  readonly budgetAuthority: GovernedProviderBudgetAuthority;
  readonly paidExecutionLedger?: GovernedPaidExecutionLedger;
  readonly requestedToolCalls?: number;
  readonly operationName: string;
  readonly execute: (envelope: ProviderExecutionEnvelope<TRequest>) => Promise<TResponse>;
}

function requiredText(value: string, field: string) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${field} must be a non-empty string`);
  }
  return value;
}

function validMonetaryExposure(value: number | null): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function validRequestedToolCalls(value: number) {
  return Number.isSafeInteger(value) && value >= 0;
}

export function providerExecutionReservationIdempotencyKey(
  envelope: ProviderExecutionEnvelope<object>
) {
  assertProviderExecutionEnvelopeIntegrity(envelope);
  return `provider-execution:${envelope.fingerprint}`;
}

function assertGovernedRetryAuthority(envelope: ProviderExecutionEnvelope<object>) {
  if (envelope.max_retries !== 0) {
    throw new Error(
      'Governed provider execution requires max_retries=0; every retry must be separately authorized'
    );
  }
}

function assertExposureQuote<TRequest extends object, TQuote extends ProviderExposureQuote>(
  envelope: ProviderExecutionEnvelope<TRequest>,
  preflight: ProviderInputTokenPreflight,
  quote: TQuote
) {
  assertProviderExecutionEnvelopeIntegrity(envelope);
  assertProviderInputTokenPreflight(envelope, preflight);
  if (quote.provider !== envelope.provider) {
    throw new Error('Provider exposure quote provider does not match the execution envelope');
  }
  requiredText(quote.currency, 'provider exposure quote currency');
  if (!quote.quotable || !validMonetaryExposure(quote.maximum_exposure_usd)) {
    const reason = quote.failure_reason ?? 'invalid_or_unquotable_exposure';
    throw new Error(`Provider execution exposure is not quotable: ${reason}`);
  }
  if (quote.failure_reason !== null) {
    throw new Error('Quotable provider exposure cannot contain a failure reason');
  }
  return quote.maximum_exposure_usd;
}

function assertReservation(
  reservation: GovernedProviderReservation
): asserts reservation is GovernedProviderReservation & {
  reservation_id: string;
  reservation_status: string;
} {
  if (typeof reservation.approved !== 'boolean' || typeof reservation.idempotent !== 'boolean') {
    throw new Error('Provider budget reservation returned an ambiguous decision');
  }
  if (!reservation.approved) {
    throw new Error(
      `Provider budget reservation was denied: ${reservation.decision_reason ?? 'unspecified'}`
    );
  }
  if (typeof reservation.reservation_id !== 'string' || reservation.reservation_id.length === 0) {
    throw new Error('Approved provider budget reservation is missing its durable reservation identity');
  }
  if (
    typeof reservation.reservation_status !== 'string' ||
    reservation.reservation_status.length === 0
  ) {
    throw new Error('Approved provider budget reservation is missing its durable status');
  }
  if (reservation.idempotent) {
    throw new Error(
      `Provider reservation ${reservation.reservation_id} already exists; recovery must resolve the existing attempt before any further provider execution`
    );
  }
}

function assertPaidExecutionAdmission(
  admission: GovernedPaidExecutionAdmission
): GovernedPaidExecutionAdmission {
  requiredText(admission.execution_id, 'paid execution id');
  requiredText(admission.execution_status, 'paid execution status');
  if (typeof admission.idempotent !== 'boolean') {
    throw new Error('Paid execution admission returned an ambiguous idempotency result');
  }
  if (admission.idempotent) {
    throw new Error(
      `Paid execution ${admission.execution_id} already exists; recovery must reconcile the existing attempt before any provider call`
    );
  }
  if (admission.execution_status !== 'running') {
    throw new Error(
      `Paid execution ${admission.execution_id} was not admitted into running state`
    );
  }
  return admission;
}

function providerFailureReport(error: unknown) {
  const name = error instanceof Error && error.name ? error.name : 'Error';
  const message = error instanceof Error ? error.message : String(error);
  return `Provider execution failed after paid-access admission. ${name}: ${message}`.slice(0, 4096);
}

function frozenReceipt<TQuote extends ProviderExposureQuote>(
  envelope: ProviderExecutionEnvelope<object>,
  operationName: string,
  preflight: ProviderInputTokenPreflight,
  quote: TQuote,
  idempotencyKey: string,
  reservation: GovernedProviderReservation & {
    reservation_id: string;
    reservation_status: string;
  },
  paidExecution?: GovernedPaidExecutionAdmission
): GovernedProviderExecutionReceipt<TQuote> {
  return Object.freeze({
    schema_version: 1 as const,
    provider: envelope.provider,
    operation_name: operationName,
    execution_role: envelope.execution_role,
    envelope_fingerprint: envelope.fingerprint,
    input_token_preflight: preflight,
    exposure_quote: quote,
    reservation: Object.freeze({
      reservation_id: reservation.reservation_id,
      idempotency_key: idempotencyKey,
      reservation_status: reservation.reservation_status,
      idempotent: reservation.idempotent,
    }),
    ...(paidExecution
      ? {
          paid_execution: Object.freeze({
            execution_id: paidExecution.execution_id,
            execution_status: paidExecution.execution_status,
            idempotent: paidExecution.idempotent,
          }),
        }
      : {}),
  });
}

export async function executeGovernedProviderExecution<
  TRequest extends object,
  TResponse,
  TQuote extends ProviderExposureQuote = ProviderExposureQuote,
>(
  input: GovernedProviderExecutionInput<TRequest, TResponse, TQuote>
): Promise<GovernedProviderExecutionResult<TResponse, TQuote>> {
  const { envelope } = input;
  assertProviderExecutionEnvelopeIntegrity(envelope);
  assertGovernedRetryAuthority(envelope);
  requiredText(input.operationName, 'operationName');
  const requestedToolCalls = input.requestedToolCalls ?? 0;
  if (!validRequestedToolCalls(requestedToolCalls)) {
    throw new Error('requestedToolCalls must be a non-negative safe integer');
  }

  await runRequiredRulebookExecutionPreflight(input.rulebook);
  assertProviderExecutionEnvelopeIntegrity(envelope);

  const preflight = await preflightProviderInputTokens(envelope, input.inputTokenCounter);
  assertProviderInputTokenPreflight(envelope, preflight);

  const quote = await input.exposureQuoter.quoteExposure(envelope, preflight);
  const maximumExposureUsd = assertExposureQuote(envelope, preflight, quote);

  const idempotencyKey = providerExecutionReservationIdempotencyKey(envelope);
  const reservationRequest = Object.freeze({
    provider: envelope.provider,
    operation_name: input.operationName,
    execution_role: envelope.execution_role,
    envelope_fingerprint: envelope.fingerprint,
    idempotency_key: idempotencyKey,
    maximum_exposure_usd: maximumExposureUsd,
    currency: quote.currency,
  });

  const reservation = await input.budgetAuthority.reserveProviderExecution(reservationRequest);
  assertProviderExecutionEnvelopeIntegrity(envelope);
  assertProviderInputTokenPreflight(envelope, preflight);
  assertReservation(reservation);

  let paidExecution: GovernedPaidExecutionAdmission | undefined;
  if (input.paidExecutionLedger) {
    paidExecution = assertPaidExecutionAdmission(
      await input.paidExecutionLedger.admitProviderExecution({
        envelope,
        operation_name: input.operationName,
        input_token_preflight: preflight,
        exposure_quote: quote,
        reservation: {
          reservation_id: reservation.reservation_id,
          idempotency_key: idempotencyKey,
          reservation_status: reservation.reservation_status,
        },
        requested_tool_calls: requestedToolCalls,
      })
    );
  }

  const receipt = frozenReceipt(
    envelope,
    input.operationName,
    preflight,
    quote,
    idempotencyKey,
    reservation,
    paidExecution
  );

  assertProviderExecutionEnvelopeIntegrity(envelope);
  try {
    const response = await input.execute(envelope);
    return Object.freeze({ response, receipt });
  } catch (providerError) {
    if (paidExecution && input.paidExecutionLedger) {
      try {
        await input.paidExecutionLedger.recordProviderExecutionFailure({
          execution_id: paidExecution.execution_id,
          failure_code: 'provider_call_failed',
          failure_report: providerFailureReport(providerError),
        });
      } catch (ledgerError) {
        throw new AggregateError(
          [providerError, ledgerError],
          'Provider execution failed and paid-execution failure persistence also failed'
        );
      }
    }
    throw providerError;
  }
}
