import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  assertNoCredentialMaterial,
  fingerprintCanonicalValue,
} from '../continuity/checkpoint.js';
import {
  AEL_CLASSIFICATIONS,
  AEL_LIFECYCLE_STATES,
  AEL_MODALITIES,
  AEL_SCHEMA_VERSION,
  AEL_SOURCE_KINDS,
  createAelEventEnvelope,
  type AelEventEnvelope,
} from './event-envelope.js';

export const AEL_SIMULATOR_VERSION = 'ael-sim-v1' as const;

function boundedText(max: number) {
  return z.string()
    .min(1)
    .max(max)
    .refine((value) => value.trim() === value, { message: 'Leading or trailing whitespace is not permitted' });
}

const SequenceSchema = z.number().int().nonnegative().max(999);

const SimulationSourceSchema = z.object({
  sourceKey: boundedText(160),
  sourceKind: z.enum(AEL_SOURCE_KINDS),
  modality: z.enum(AEL_MODALITIES),
  providerRef: boundedText(512).optional(),
  eventCount: z.number().int().min(1).max(1000),
  cadenceMs: z.number().int().min(1).max(86400000),
  startOffsetMs: z.number().int().min(-31536000000).max(31536000000).default(0),
  clockOffsetMs: z.number().int().min(-86400000).max(86400000).default(0),
  clockUncertaintyMs: z.number().int().nonnegative().max(86400000).default(0),
  missingSequences: z.array(SequenceSchema).max(1000).default([]),
  duplicateSequences: z.array(SequenceSchema).max(1000).default([]),
}).strict();

const SimulationScenarioSchema = z.object({
  scenarioId: boundedText(256),
  seed: boundedText(256),
  baseTime: z.string().datetime({ offset: true }),
  tenantId: boundedText(256),
  projectId: boundedText(256),
  captureAuthorityRef: boundedText(512),
  classification: z.enum(AEL_CLASSIFICATIONS),
  retentionProfileRef: boundedText(256),
  residencyProfileRef: boundedText(256),
  lifecycleState: z.enum(AEL_LIFECYCLE_STATES),
  sources: z.array(SimulationSourceSchema).min(1).max(16),
}).strict();

type SimulationScenario = z.infer<typeof SimulationScenarioSchema>;
type SimulationSource = z.infer<typeof SimulationSourceSchema>;

export interface AelSimulationGap {
  sourceId: string;
  sourceKey: string;
  missingSequence: number;
  expectedAt: string;
}

export interface AelSimulationDuplicate {
  sourceId: string;
  sourceKey: string;
  sourceSequence: number;
  eventId: string;
  sourceEventId: string;
  deliveries: 2;
}

export interface AelSimulationResult {
  scenarioId: string;
  seedFingerprint: string;
  correlationId: string;
  events: AelEventEnvelope[];
  diagnostics: {
    sourceCount: number;
    uniqueEventCount: number;
    deliveryCount: number;
    gaps: AelSimulationGap[];
    duplicates: AelSimulationDuplicate[];
  };
}

function hashHex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function deterministicUuid(value: string): string {
  const bytes = createHash('sha256').update(value).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function deterministicJitter(key: string, maxAbs: number): number {
  if (maxAbs === 0) return 0;
  const sample = Number.parseInt(hashHex(key).slice(0, 12), 16);
  const span = (maxAbs * 2) + 1;
  return (sample % span) - maxAbs;
}

function iso(milliseconds: number): string {
  return new Date(milliseconds).toISOString();
}

function validateSequences(source: SimulationSource): void {
  const missing = new Set(source.missingSequences);
  const duplicates = new Set(source.duplicateSequences);
  if (missing.size !== source.missingSequences.length) {
    throw new Error(`Duplicate missing sequence configuration for ${source.sourceKey}`);
  }
  if (duplicates.size !== source.duplicateSequences.length) {
    throw new Error(`Duplicate duplicate-sequence configuration for ${source.sourceKey}`);
  }
  for (const sequence of source.missingSequences) {
    if (sequence >= source.eventCount) {
      throw new Error(`Missing sequence outside event count for ${source.sourceKey}`);
    }
  }
  for (const sequence of source.duplicateSequences) {
    if (sequence >= source.eventCount) {
      throw new Error(`Duplicate sequence outside event count for ${source.sourceKey}`);
    }
    if (missing.has(sequence)) {
      throw new Error(`Sequence cannot be both missing and duplicate for ${source.sourceKey}`);
    }
  }
}

function parseScenario(input: unknown): SimulationScenario {
  assertNoCredentialMaterial(input);
  const scenario = SimulationScenarioSchema.parse(input);
  const sourceKeys = new Set<string>();
  for (const source of scenario.sources) {
    if (sourceKeys.has(source.sourceKey)) {
      throw new Error(`Duplicate source key ${source.sourceKey}`);
    }
    sourceKeys.add(source.sourceKey);
    validateSequences(source);
  }
  return scenario;
}

export function simulateAelScenario(input: unknown): AelSimulationResult {
  const scenario = parseScenario(input);
  const baseTimeMs = Date.parse(scenario.baseTime);
  const seedFingerprint = fingerprintCanonicalValue({ seed: scenario.seed });
  const correlationId = deterministicUuid(`ael:correlation:${scenario.scenarioId}:${seedFingerprint}`);
  const events: AelEventEnvelope[] = [];
  const gaps: AelSimulationGap[] = [];
  const duplicates: AelSimulationDuplicate[] = [];

  scenario.sources.forEach((source, sourceIndex) => {
    const sourceId = deterministicUuid(`ael:source:${scenario.scenarioId}:${source.sourceKey}`);
    const missing = new Set(source.missingSequences);
    const duplicate = new Set(source.duplicateSequences);
    let previousEvent: AelEventEnvelope | null = null;

    const sourceTime = (sequence: number) => {
      const idealMs = baseTimeMs + source.startOffsetMs + (sequence * source.cadenceMs);
      const jitter = deterministicJitter(
        `ael:jitter:${scenario.scenarioId}:${seedFingerprint}:${source.sourceKey}:${sequence}`,
        source.clockUncertaintyMs,
      );
      return {
        idealMs,
        occurredMs: idealMs + source.clockOffsetMs + jitter,
      };
    };

    for (let sequence = 0; sequence < source.eventCount; sequence += 1) {
      const timing = sourceTime(sequence);
      if (missing.has(sequence)) {
        gaps.push({
          sourceId,
          sourceKey: source.sourceKey,
          missingSequence: sequence,
          expectedAt: iso(timing.occurredMs),
        });
        continue;
      }

      const sourceEventId = deterministicUuid(
        `ael:source-event:${scenario.scenarioId}:${seedFingerprint}:${source.sourceKey}:${sequence}`,
      );
      const eventId = deterministicUuid(`ael:event:${sourceId}:${sourceEventId}`);
      const observedMs = timing.idealMs + 100 + (sourceIndex * 10);
      const ingestedMs = observedMs + 25;
      const contentDescriptor = {
        kind: 'synthetic-ael-content-v1',
        scenarioId: scenario.scenarioId,
        seedFingerprint,
        sourceKey: source.sourceKey,
        sourceKind: source.sourceKind,
        modality: source.modality,
        sequence,
      };
      const contentHash = fingerprintCanonicalValue(contentDescriptor);
      const contentRef = `synthetic://ael/${encodeURIComponent(scenario.scenarioId)}/${encodeURIComponent(source.sourceKey)}/${sequence}/${seedFingerprint.slice(0, 16)}`;
      const provenance = previousEvent === null ? [] : [{
        relation: 'follows',
        sourceId: previousEvent.sourceId,
        sourceEventId: previousEvent.sourceEventId,
      }];

      const envelope = createAelEventEnvelope({
        schemaVersion: AEL_SCHEMA_VERSION,
        eventId,
        sourceId,
        sourceEventId,
        sourceKind: source.sourceKind,
        modality: source.modality,
        ...(source.providerRef === undefined ? {} : { providerRef: source.providerRef }),
        tenantId: scenario.tenantId,
        projectId: scenario.projectId,
        captureAuthorityRef: scenario.captureAuthorityRef,
        occurredAtStart: iso(timing.occurredMs),
        observedAt: iso(observedMs),
        ingestedAt: iso(ingestedMs),
        clockSource: 'ael.synthetic.clock',
        clockUncertaintyMs: source.clockUncertaintyMs,
        sourceSequence: sequence,
        correlationId,
        ...(previousEvent === null ? {} : { causationEventId: previousEvent.eventId }),
        traceId: hashHex(`ael:trace:${scenario.scenarioId}:${seedFingerprint}`).slice(0, 32),
        classification: scenario.classification,
        retentionProfileRef: scenario.retentionProfileRef,
        residencyProfileRef: scenario.residencyProfileRef,
        contentRef,
        contentHash,
        provenance,
        generation: {
          kind: 'synthetic',
          scenarioId: scenario.scenarioId,
          seedFingerprint,
          generatorVersion: AEL_SIMULATOR_VERSION,
        },
        lifecycleState: scenario.lifecycleState,
        flags: {
          gap: false,
          duplicate: false,
          corrupted: false,
          partial: false,
        },
      });

      events.push(envelope);
      if (duplicate.has(sequence)) {
        events.push(structuredClone(envelope));
        duplicates.push({
          sourceId,
          sourceKey: source.sourceKey,
          sourceSequence: sequence,
          eventId: envelope.eventId,
          sourceEventId: envelope.sourceEventId,
          deliveries: 2,
        });
      }
      previousEvent = envelope;
    }
  });

  events.sort((left, right) => (
    left.ingestedAt.localeCompare(right.ingestedAt)
    || left.sourceId.localeCompare(right.sourceId)
    || (left.sourceSequence ?? -1) - (right.sourceSequence ?? -1)
    || left.eventId.localeCompare(right.eventId)
  ));

  return {
    scenarioId: scenario.scenarioId,
    seedFingerprint,
    correlationId,
    events,
    diagnostics: {
      sourceCount: scenario.sources.length,
      uniqueEventCount: new Set(events.map((event) => event.eventId)).size,
      deliveryCount: events.length,
      gaps,
      duplicates,
    },
  };
}
