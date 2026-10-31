import { z } from 'zod';
import {
  assertNoCredentialMaterial,
  canonicalizeForIntegrity,
  fingerprintCanonicalValue,
} from '../continuity/checkpoint.js';

export const AEL_SCHEMA_VERSION = 'ael.event-envelope.v1' as const;
export const AEL_MAX_ENVELOPE_BYTES = 65536;

export const AEL_SOURCE_KINDS = [
  'camera',
  'microphone',
  'navigation',
  'vehicle',
  'wearable',
  'environmental_sensor',
  'device_event',
  'imported_clip',
  'synthetic',
] as const;

export const AEL_MODALITIES = [
  'audio',
  'video',
  'location',
  'navigation',
  'vehicle_telemetry',
  'sensor',
  'device_state',
  'mixed',
] as const;

export const AEL_CLASSIFICATIONS = [
  'PUBLIC',
  'INTERNAL',
  'CONFIDENTIAL',
  'RESTRICTED',
  'SECRET',
] as const;

export const AEL_LIFECYCLE_STATES = [
  'transient',
  'retained',
  'disposed',
  'unavailable',
] as const;

const UuidSchema = z.string().uuid();
const TimestampSchema = z.string().datetime({ offset: true });
const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);

function boundedText(max: number) {
  return z.string()
    .min(1)
    .max(max)
    .refine((value) => value.trim() === value, { message: 'Leading or trailing whitespace is not permitted' });
}

const ContentRefSchema = z.string()
  .min(1)
  .max(4096)
  .regex(/^[a-z][a-z0-9+.-]*:\/\/\S+$/i)
  .refine((value) => value.trim() === value, { message: 'Leading or trailing whitespace is not permitted' });

const ProvenanceEdgeSchema = z.object({
  relation: boundedText(80),
  sourceId: UuidSchema,
  sourceEventId: UuidSchema,
}).strict();

const TransformationSchema = z.object({
  name: boundedText(160),
  version: boundedText(80),
  modelRef: boundedText(512).optional(),
}).strict();

const SyntheticGenerationSchema = z.object({
  kind: z.literal('synthetic'),
  scenarioId: boundedText(256),
  seedFingerprint: Sha256Schema,
  generatorVersion: boundedText(80),
}).strict();

const EventFlagsSchema = z.object({
  gap: z.boolean(),
  duplicate: z.boolean(),
  corrupted: z.boolean(),
  partial: z.boolean(),
}).strict();

const AelEventBodySchema = z.object({
  schemaVersion: z.literal(AEL_SCHEMA_VERSION),
  eventId: UuidSchema,
  sourceId: UuidSchema,
  sourceEventId: UuidSchema,
  sourceKind: z.enum(AEL_SOURCE_KINDS),
  modality: z.enum(AEL_MODALITIES),
  providerRef: boundedText(512).optional(),
  tenantId: boundedText(256),
  projectId: boundedText(256),
  captureAuthorityRef: boundedText(512),
  occurredAtStart: TimestampSchema,
  occurredAtEnd: TimestampSchema.optional(),
  observedAt: TimestampSchema.optional(),
  ingestedAt: TimestampSchema,
  clockSource: boundedText(160),
  clockUncertaintyMs: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  sourceSequence: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(),
  correlationId: UuidSchema.optional(),
  causationEventId: UuidSchema.optional(),
  traceId: boundedText(160).optional(),
  classification: z.enum(AEL_CLASSIFICATIONS),
  retentionProfileRef: boundedText(256),
  residencyProfileRef: boundedText(256),
  contentRef: ContentRefSchema,
  contentHash: Sha256Schema,
  provenance: z.array(ProvenanceEdgeSchema).max(32),
  transformation: TransformationSchema.optional(),
  generation: SyntheticGenerationSchema.optional(),
  lifecycleState: z.enum(AEL_LIFECYCLE_STATES),
  flags: EventFlagsSchema,
}).strict();

const AelEventEnvelopeSchema = AelEventBodySchema.extend({
  envelopeDigest: Sha256Schema,
}).strict();

export type AelSourceKind = typeof AEL_SOURCE_KINDS[number];
export type AelModality = typeof AEL_MODALITIES[number];
export type AelClassification = typeof AEL_CLASSIFICATIONS[number];
export type AelLifecycleState = typeof AEL_LIFECYCLE_STATES[number];
export type AelEventBody = z.infer<typeof AelEventBodySchema>;
export type AelEventEnvelope = z.infer<typeof AelEventEnvelopeSchema>;

function assertTemporalBounds(body: AelEventBody): void {
  const start = Date.parse(body.occurredAtStart);
  if (body.occurredAtEnd !== undefined && Date.parse(body.occurredAtEnd) < start) {
    throw new Error('AEL event interval end precedes interval start');
  }
  if (body.causationEventId !== undefined && body.causationEventId === body.eventId) {
    throw new Error('AEL event cannot cause itself');
  }
}

function assertBoundedEnvelope(value: unknown): void {
  const bytes = Buffer.byteLength(canonicalizeForIntegrity(value), 'utf8');
  if (bytes > AEL_MAX_ENVELOPE_BYTES) {
    throw new Error('AEL event envelope exceeds 64 KiB');
  }
}

export function createAelEventEnvelope(input: unknown): AelEventEnvelope {
  assertNoCredentialMaterial(input);
  const body = AelEventBodySchema.parse(input);
  assertTemporalBounds(body);
  assertBoundedEnvelope(body);

  const envelope: AelEventEnvelope = {
    ...body,
    envelopeDigest: fingerprintCanonicalValue(body),
  };
  assertBoundedEnvelope(envelope);
  return envelope;
}

export function parseAelEventEnvelope(value: unknown): AelEventEnvelope {
  assertNoCredentialMaterial(value);
  const envelope = AelEventEnvelopeSchema.parse(value);
  assertTemporalBounds(envelope);
  assertBoundedEnvelope(envelope);

  const { envelopeDigest, ...body } = envelope;
  const expectedDigest = fingerprintCanonicalValue(body);
  if (expectedDigest !== envelopeDigest) {
    throw new Error('AEL event envelope integrity mismatch');
  }
  return envelope;
}

export function verifyAelEventEnvelope(value: unknown): boolean {
  try {
    parseAelEventEnvelope(value);
    return true;
  } catch {
    return false;
  }
}
