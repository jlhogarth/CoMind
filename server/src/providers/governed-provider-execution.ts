import {
  ProviderExecutionEnvelope,
  ProviderInputTokenCounter,
  ProviderInputTokenPreflight,
  assertProviderExecutionEnvelopeIntegrity,
  assertProviderInputTokenPreflight,
  preflightProviderInputTokens,
} from './provider-execution-envelope.js';

export interface ProviderExposureQuote {
  readonly provider: string;
  readonly quotable: boolean;
  readonly maximum_exposure_usd: number | null;
  readonly currency: string;
  readonly failure_reason: string | null;
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
  readonly inputTokenCounter: ProviderInputTokenCounter<TRequest>;
  readonly exposureQuoter: ProviderExposureQuoter<TRequest, TQuote>;
  readonly budgetAuthority: GovernedProviderBudgetAuthority;
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

function frozenReceipt<TQuote extends ProviderExposureQuote>(
  envelope: ProviderExecutionEnvelope<object>,
  operationName: string,
  preflight: ProviderInputTokenPreflight,
  quote: TQuote,
  idempotencyKey: string,
  reservation: GovernedProviderReservation & {
    reservation_id: string;
    reservation_status: string;
  }
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

  const receipt = frozenReceipt(
    envelope,
    input.operationName,
    preflight,
    quote,
    idempotencyKey,
    reservation
  );

  assertProviderExecutionEnvelopeIntegrity(envelope);
  const response = await input.execute(envelope);

  return Object.freeze({ response, receipt });
}
