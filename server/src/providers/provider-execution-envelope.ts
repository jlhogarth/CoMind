import { createHash } from 'node:crypto';

export type ProviderExecutionRole = 'root' | 'draft' | 'verifier' | 'repair';

export interface ProviderExecutionEnvelope<TRequest extends object> {
  readonly schema_version: 1;
  readonly provider: string;
  readonly requested_model: string;
  readonly canonical_model: string | null;
  readonly processing_mode: string;
  readonly execution_role: ProviderExecutionRole;
  readonly timeout_ms: number;
  readonly max_retries: number;
  readonly request: TRequest;
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

export interface ProviderInputTokenCounter<TRequest extends object> {
  readonly name: string;
  countInputTokens(envelope: ProviderExecutionEnvelope<TRequest>): Promise<number>;
}

export interface ProviderInputTokenPreflight {
  readonly provider: string;
  readonly counter: string;
  readonly envelope_fingerprint: string;
  readonly input_tokens: number;
}

type CanonicalValue =
  | null
  | boolean
  | number
  | string
  | CanonicalValue[]
  | { [key: string]: CanonicalValue };

const EXECUTION_ROLES = new Set<ProviderExecutionRole>(['root', 'draft', 'verifier', 'repair']);

function requiredText(value: string, field: string) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${field} must be a non-empty string`);
  }
  return value;
}

function canonicalClone(value: unknown, path: string): CanonicalValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error(`${path} contains a non-finite number`);
    }
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item, index) => canonicalClone(item, `${path}[${index}]`));
  }

  if (typeof value === 'object') {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new Error(`${path} contains a non-plain object`);
    }

    const cloned: Record<string, CanonicalValue> = {};
    for (const [key, item] of Object.entries(value)) {
      if (item === undefined) {
        throw new Error(`${path}.${key} is undefined and cannot be fingerprinted deterministically`);
      }
      cloned[key] = canonicalClone(item, `${path}.${key}`);
    }
    return cloned;
  }

  throw new Error(`${path} contains an unsupported value type`);
}

function canonicalSerialize(value: CanonicalValue): string {
  if (value === null || typeof value !== 'object') {
    const serialized = JSON.stringify(value);
    if (serialized === undefined) {
      throw new Error('Canonical provider execution value could not be serialized');
    }
    return serialized;
  }
  if (Array.isArray(value)) return `[${value.map(canonicalSerialize).join(',')}]`;

  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalSerialize(value[key])}`)
    .join(',')}}`;
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== 'object') return value;
  if (!Object.isFrozen(value)) Object.freeze(value);
  for (const child of Object.values(value as Record<string, unknown>)) {
    deepFreeze(child);
  }
  return value;
}

function fingerprintValue(value: CanonicalValue) {
  return `sha256:${createHash('sha256').update(canonicalSerialize(value)).digest('hex')}`;
}

function envelopeIdentity<TRequest extends object>(
  envelope: Omit<ProviderExecutionEnvelope<TRequest>, 'fingerprint'>
): CanonicalValue {
  return canonicalClone(
    {
      schema_version: envelope.schema_version,
      provider: envelope.provider,
      requested_model: envelope.requested_model,
      canonical_model: envelope.canonical_model,
      processing_mode: envelope.processing_mode,
      execution_role: envelope.execution_role,
      timeout_ms: envelope.timeout_ms,
      max_retries: envelope.max_retries,
      request: envelope.request,
    },
    'provider execution envelope'
  );
}

export function createProviderExecutionEnvelope<TRequest extends object>(
  input: ProviderExecutionEnvelopeInput<TRequest>
): ProviderExecutionEnvelope<TRequest> {
  requiredText(input.provider, 'provider');
  requiredText(input.requestedModel, 'requestedModel');
  requiredText(input.processingMode, 'processingMode');
  if (input.canonicalModel !== null) requiredText(input.canonicalModel, 'canonicalModel');
  if (!EXECUTION_ROLES.has(input.executionRole)) {
    throw new Error('executionRole is unsupported');
  }
  if (!Number.isSafeInteger(input.timeoutMs) || input.timeoutMs <= 0) {
    throw new Error('timeoutMs must be a positive safe integer');
  }
  if (!Number.isSafeInteger(input.maxRetries) || input.maxRetries < 0) {
    throw new Error('maxRetries must be a non-negative safe integer');
  }

  const request = canonicalClone(input.request, 'request') as unknown as TRequest;
  const identity: Omit<ProviderExecutionEnvelope<TRequest>, 'fingerprint'> = {
    schema_version: 1,
    provider: input.provider,
    requested_model: input.requestedModel,
    canonical_model: input.canonicalModel,
    processing_mode: input.processingMode,
    execution_role: input.executionRole,
    timeout_ms: input.timeoutMs,
    max_retries: input.maxRetries,
    request,
  };
  const fingerprint = fingerprintValue(envelopeIdentity(identity));

  return deepFreeze({ ...identity, fingerprint });
}

export function providerExecutionEnvelopeFingerprint<TRequest extends object>(
  envelope: ProviderExecutionEnvelope<TRequest>
) {
  const { fingerprint: _fingerprint, ...identity } = envelope;
  return fingerprintValue(envelopeIdentity(identity));
}

export function assertProviderExecutionEnvelopeIntegrity<TRequest extends object>(
  envelope: ProviderExecutionEnvelope<TRequest>
) {
  const actualFingerprint = providerExecutionEnvelopeFingerprint(envelope);
  if (actualFingerprint !== envelope.fingerprint) {
    throw new Error('Provider execution envelope fingerprint mismatch');
  }
  return envelope;
}

function validInputTokenCount(value: number): value is number {
  return Number.isSafeInteger(value) && value >= 0;
}

export async function preflightProviderInputTokens<TRequest extends object>(
  envelope: ProviderExecutionEnvelope<TRequest>,
  counter: ProviderInputTokenCounter<TRequest>
): Promise<ProviderInputTokenPreflight> {
  assertProviderExecutionEnvelopeIntegrity(envelope);
  requiredText(counter.name, 'counter.name');

  const inputTokens = await counter.countInputTokens(envelope);

  assertProviderExecutionEnvelopeIntegrity(envelope);
  if (!validInputTokenCount(inputTokens)) {
    throw new Error('Trustworthy input-token count must be a non-negative safe integer');
  }

  return deepFreeze({
    provider: envelope.provider,
    counter: counter.name,
    envelope_fingerprint: envelope.fingerprint,
    input_tokens: inputTokens,
  });
}

export function assertProviderInputTokenPreflight<TRequest extends object>(
  envelope: ProviderExecutionEnvelope<TRequest>,
  preflight: ProviderInputTokenPreflight
) {
  assertProviderExecutionEnvelopeIntegrity(envelope);
  if (preflight.provider !== envelope.provider) {
    throw new Error('Provider input-token preflight provider mismatch');
  }
  if (preflight.envelope_fingerprint !== envelope.fingerprint) {
    throw new Error('Provider input-token preflight envelope fingerprint mismatch');
  }
  if (!validInputTokenCount(preflight.input_tokens)) {
    throw new Error('Provider input-token preflight contains an invalid token count');
  }
  requiredText(preflight.counter, 'preflight.counter');
  return preflight.input_tokens;
}

export class DeterministicProviderInputTokenCounter<TRequest extends object>
  implements ProviderInputTokenCounter<TRequest>
{
  constructor(
    private readonly resolver: (
      envelope: ProviderExecutionEnvelope<TRequest>
    ) => number | Promise<number>,
    readonly name = 'deterministic'
  ) {}

  async countInputTokens(envelope: ProviderExecutionEnvelope<TRequest>) {
    return this.resolver(envelope);
  }
}
