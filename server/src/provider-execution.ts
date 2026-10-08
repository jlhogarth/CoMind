import { createHash } from 'node:crypto';

export const PROVIDER_EXECUTION_ENVELOPE_VERSION = 'provider-execution-envelope-v1';

export type ProviderExecutionRole = 'root' | 'draft' | 'verifier' | 'repair';

export interface ProviderExecutionEnvelope<TRequest extends object> {
  readonly version: typeof PROVIDER_EXECUTION_ENVELOPE_VERSION;
  readonly provider: string;
  readonly requested_model: string;
  readonly canonical_model: string | null;
  readonly processing_mode: string;
  readonly execution_role: ProviderExecutionRole;
  readonly timeout_ms: number;
  readonly max_retries: number;
  readonly request: Readonly<TRequest>;
  readonly fingerprint: string;
}

export interface ProviderExecutionEnvelopeInput<TRequest extends object> {
  provider: string;
  requestedModel: string;
  canonicalModel: string | null;
  processingMode: string;
  executionRole: ProviderExecutionRole;
  timeoutMs: number;
  maxRetries: number;
  request: TRequest;
}

export interface ProviderInputTokenCount {
  readonly provider: string;
  readonly envelope_fingerprint: string;
  readonly input_tokens: number;
  readonly source: string;
}

export interface ProviderInputTokenCounter<
  TRequest extends object,
  TEnvelope extends ProviderExecutionEnvelope<TRequest> = ProviderExecutionEnvelope<TRequest>,
> {
  countInputTokens(envelope: TEnvelope): Promise<ProviderInputTokenCount>;
}

const EXECUTION_ROLES = new Set<ProviderExecutionRole>(['root', 'draft', 'verifier', 'repair']);
const SENSITIVE_REQUEST_KEYS = new Set([
  'api_key',
  'apikey',
  'authorization',
  'password',
  'client_secret',
  'clientsecret',
  'access_token',
  'accesstoken',
  'refresh_token',
  'refreshtoken',
  'credential',
  'credentials',
]);

function requiredString(value: string, field: string) {
  const normalized = value.trim();
  if (!normalized) throw new Error(`Provider execution ${field} must be a non-empty string`);
  return normalized;
}

function requiredPositiveSafeInteger(value: number, field: string) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`Provider execution ${field} must be a positive safe integer`);
  }
  return value;
}

function requiredNonNegativeSafeInteger(value: number, field: string) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`Provider execution ${field} must be a non-negative safe integer`);
  }
  return value;
}

function normalizeJsonValue(value: unknown, path: string): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error(`Provider execution envelope contains a non-finite number at ${path}`);
    }
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((entry, index) => normalizeJsonValue(entry, `${path}[${index}]`));
  }

  if (typeof value !== 'object') {
    throw new Error(`Provider execution envelope contains a non-JSON value at ${path}`);
  }

  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error(`Provider execution envelope contains a non-plain object at ${path}`);
  }

  const normalized: Record<string, unknown> = {};
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    const entry = (value as Record<string, unknown>)[key];
    if (entry === undefined) {
      throw new Error(`Provider execution envelope contains undefined at ${path}.${key}`);
    }
    normalized[key] = normalizeJsonValue(entry, `${path}.${key}`);
  }
  return normalized;
}

function assertNoTopLevelCredentials(request: object) {
  for (const key of Object.keys(request)) {
    if (SENSITIVE_REQUEST_KEYS.has(key.toLowerCase())) {
      throw new Error(`Provider execution request must not contain credential field ${key}`);
    }
  }
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function fingerprintMaterial<TRequest extends object>(
  envelope: Omit<ProviderExecutionEnvelope<TRequest>, 'fingerprint'>
) {
  return {
    version: envelope.version,
    provider: envelope.provider,
    requested_model: envelope.requested_model,
    canonical_model: envelope.canonical_model,
    processing_mode: envelope.processing_mode,
    execution_role: envelope.execution_role,
    timeout_ms: envelope.timeout_ms,
    max_retries: envelope.max_retries,
    request: envelope.request,
  };
}

function fingerprintFromMaterial(material: unknown) {
  const canonical = JSON.stringify(normalizeJsonValue(material, '$'));
  return `sha256:${createHash('sha256').update(canonical).digest('hex')}`;
}

export function createProviderExecutionEnvelope<TRequest extends object>(
  input: ProviderExecutionEnvelopeInput<TRequest>
): ProviderExecutionEnvelope<TRequest> {
  const provider = requiredString(input.provider, 'provider');
  const requestedModel = requiredString(input.requestedModel, 'requested model');
  const processingMode = requiredString(input.processingMode, 'processing mode');
  const canonicalModel = input.canonicalModel === null
    ? null
    : requiredString(input.canonicalModel, 'canonical model');

  if (!EXECUTION_ROLES.has(input.executionRole)) {
    throw new Error('Provider execution role is unsupported');
  }

  assertNoTopLevelCredentials(input.request);
  const normalizedRequest = normalizeJsonValue(input.request, '$.request') as TRequest;
  const material = {
    version: PROVIDER_EXECUTION_ENVELOPE_VERSION,
    provider,
    requested_model: requestedModel,
    canonical_model: canonicalModel,
    processing_mode: processingMode,
    execution_role: input.executionRole,
    timeout_ms: requiredPositiveSafeInteger(input.timeoutMs, 'timeout_ms'),
    max_retries: requiredNonNegativeSafeInteger(input.maxRetries, 'max_retries'),
    request: normalizedRequest,
  } as const;

  const envelope: ProviderExecutionEnvelope<TRequest> = {
    ...material,
    fingerprint: fingerprintFromMaterial(material),
  };

  return deepFreeze(envelope);
}

export function providerExecutionFingerprint<TRequest extends object>(
  envelope: ProviderExecutionEnvelope<TRequest>
) {
  const { fingerprint: _fingerprint, ...material } = envelope;
  return fingerprintFromMaterial(fingerprintMaterial(material));
}

export function assertProviderExecutionEnvelopeIntegrity<TRequest extends object>(
  envelope: ProviderExecutionEnvelope<TRequest>
) {
  const expected = providerExecutionFingerprint(envelope);
  if (envelope.fingerprint !== expected) {
    throw new Error('Provider execution envelope fingerprint mismatch');
  }
  return envelope;
}

export function validateProviderInputTokenCount<TRequest extends object>(
  envelope: ProviderExecutionEnvelope<TRequest>,
  result: ProviderInputTokenCount
): ProviderInputTokenCount {
  assertProviderExecutionEnvelopeIntegrity(envelope);

  if (result.provider !== envelope.provider) {
    throw new Error('Provider input-token count provider does not match the execution envelope');
  }
  if (result.envelope_fingerprint !== envelope.fingerprint) {
    throw new Error('Provider input-token count does not match the execution envelope fingerprint');
  }
  if (!Number.isSafeInteger(result.input_tokens) || result.input_tokens < 0) {
    throw new Error('Provider input-token count must be a non-negative safe integer');
  }
  requiredString(result.source, 'input-token count source');

  return deepFreeze({ ...result });
}

export async function countProviderExecutionInputTokens<
  TRequest extends object,
  TEnvelope extends ProviderExecutionEnvelope<TRequest>,
>(
  envelope: TEnvelope,
  counter: ProviderInputTokenCounter<TRequest, TEnvelope>
): Promise<ProviderInputTokenCount> {
  assertProviderExecutionEnvelopeIntegrity(envelope);
  const result = await counter.countInputTokens(envelope);
  return validateProviderInputTokenCount(envelope, result);
}
