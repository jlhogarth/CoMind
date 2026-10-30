import { createHash } from 'node:crypto';

export type AcquisitionSourceFamily = 'openai_api' | 'chatgpt_browser_observed';

export type AcquisitionNormalizationClass =
  | 'assistant_text_delta'
  | 'assistant_text_completed'
  | 'reasoning_summary_delta'
  | 'reasoning_summary_completed'
  | 'tool_call_started'
  | 'tool_call_completed'
  | 'response_started'
  | 'response_completed'
  | 'response_incomplete'
  | 'response_failed';

export type AcquisitionNormalizationStatus =
  | 'normalized'
  | 'schema_drift'
  | 'unknown';

export type AcquisitionSequenceState =
  | 'in_order'
  | 'duplicate'
  | 'out_of_order'
  | 'gap'
  | 'indeterminate';

export type AcquisitionComparisonResult =
  | 'exact'
  | 'compatible_extension'
  | 'conflict'
  | 'ambiguous'
  | 'unmatched';

export interface RawAcquisitionEnvelope {
  sourceFamily: AcquisitionSourceFamily;
  sourceStreamRef: string;
  sourceEventFamily: string;
  sourceEventRef: string;
  sourceSequenceNumber?: number;
  sourceEndpointFamily?: string;
  sourceObservedAt?: string;
  payload: unknown;
}

export interface NormalizedAcquisitionEvent {
  status: AcquisitionNormalizationStatus;
  normalizationClass?: AcquisitionNormalizationClass;
  content?: string;
  sourceFamily: AcquisitionSourceFamily;
  sourceStreamRef: string;
  sourceEventRef: string;
  sourceEventFamily: string;
  sourceSequenceNumber?: number;
  rawEnvelopeSha256: string;
  driftReason?: string;
  metadata: Record<string, string | number | boolean | null>;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalize(child)])
    );
  }
  return value;
}

export function stableJsonStringify(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

export function sha256Hex(value: unknown): string {
  return createHash('sha256').update(stableJsonStringify(value)).digest('hex');
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function stringField(
  payload: Record<string, unknown>,
  key: string
): string | undefined {
  const value = payload[key];
  return typeof value === 'string' ? value : undefined;
}

function numberField(
  payload: Record<string, unknown>,
  key: string
): number | undefined {
  const value = payload[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function baseEvent(
  envelope: RawAcquisitionEnvelope
): Omit<NormalizedAcquisitionEvent, 'status'> {
  return {
    sourceFamily: envelope.sourceFamily,
    sourceStreamRef: envelope.sourceStreamRef,
    sourceEventRef: envelope.sourceEventRef,
    sourceEventFamily: envelope.sourceEventFamily,
    ...(envelope.sourceSequenceNumber !== undefined
      ? { sourceSequenceNumber: envelope.sourceSequenceNumber }
      : {}),
    rawEnvelopeSha256: sha256Hex(envelope),
    metadata: {},
  };
}

function drift(
  envelope: RawAcquisitionEnvelope,
  reason: string
): NormalizedAcquisitionEvent {
  return {
    ...baseEvent(envelope),
    status: 'schema_drift',
    driftReason: reason,
  };
}

function normalized(
  envelope: RawAcquisitionEnvelope,
  normalizationClass: AcquisitionNormalizationClass,
  content?: string,
  metadata: Record<string, string | number | boolean | null> = {}
): NormalizedAcquisitionEvent {
  return {
    ...baseEvent(envelope),
    status: 'normalized',
    normalizationClass,
    ...(content !== undefined ? { content } : {}),
    metadata,
  };
}

function normalizeOpenAI(
  envelope: RawAcquisitionEnvelope,
  payload: Record<string, unknown>
): NormalizedAcquisitionEvent {
  const eventType = stringField(payload, 'type');
  if (!eventType) return drift(envelope, 'OpenAI event is missing string field type');
  if (eventType !== envelope.sourceEventFamily) {
    return drift(envelope, 'OpenAI envelope event family does not match payload type');
  }

  const providerSequence = numberField(payload, 'sequence_number');
  if (
    envelope.sourceSequenceNumber !== undefined
    && providerSequence !== undefined
    && providerSequence !== envelope.sourceSequenceNumber
  ) {
    return drift(envelope, 'OpenAI envelope sequence does not match payload sequence_number');
  }

  const metadata: Record<string, string | number | boolean | null> = {};
  const itemId = stringField(payload, 'item_id');
  if (itemId) metadata.item_id = itemId;
  const outputIndex = numberField(payload, 'output_index');
  if (outputIndex !== undefined) metadata.output_index = outputIndex;
  const contentIndex = numberField(payload, 'content_index');
  if (contentIndex !== undefined) metadata.content_index = contentIndex;
  const summaryIndex = numberField(payload, 'summary_index');
  if (summaryIndex !== undefined) metadata.summary_index = summaryIndex;

  switch (eventType) {
    case 'response.created':
      return normalized(envelope, 'response_started', undefined, metadata);
    case 'response.output_text.delta': {
      const delta = stringField(payload, 'delta');
      return delta === undefined
        ? drift(envelope, 'OpenAI output-text delta is missing string field delta')
        : normalized(envelope, 'assistant_text_delta', delta, metadata);
    }
    case 'response.output_text.done': {
      const text = stringField(payload, 'text');
      return text === undefined
        ? drift(envelope, 'OpenAI output-text completion is missing string field text')
        : normalized(envelope, 'assistant_text_completed', text, metadata);
    }
    case 'response.reasoning_summary_text.delta': {
      const delta = stringField(payload, 'delta');
      return delta === undefined
        ? drift(envelope, 'OpenAI reasoning-summary delta is missing string field delta')
        : normalized(envelope, 'reasoning_summary_delta', delta, metadata);
    }
    case 'response.reasoning_summary_text.done': {
      const text = stringField(payload, 'text');
      return text === undefined
        ? drift(envelope, 'OpenAI reasoning-summary completion is missing string field text')
        : normalized(envelope, 'reasoning_summary_completed', text, metadata);
    }
    case 'response.completed':
      return normalized(envelope, 'response_completed', undefined, metadata);
    case 'response.incomplete':
      return normalized(envelope, 'response_incomplete', undefined, metadata);
    case 'response.failed':
    case 'error':
      return normalized(envelope, 'response_failed', undefined, metadata);
    case 'response.reasoning_text.delta':
    case 'response.reasoning_text.done':
      return {
        ...baseEvent(envelope),
        status: 'unknown',
        driftReason: 'Raw reasoning-text events are not normalized as CoMind reasoning evidence',
      };
    default:
      return {
        ...baseEvent(envelope),
        status: 'unknown',
        driftReason: `Unrecognized OpenAI event type: ${eventType}`,
      };
  }
}

const browserClasses: Record<string, AcquisitionNormalizationClass> = {
  assistant_delta: 'assistant_text_delta',
  assistant_completed: 'assistant_text_completed',
  reasoning_summary_delta: 'reasoning_summary_delta',
  reasoning_summary_completed: 'reasoning_summary_completed',
  tool_call_started: 'tool_call_started',
  tool_call_completed: 'tool_call_completed',
  response_started: 'response_started',
  response_completed: 'response_completed',
  response_incomplete: 'response_incomplete',
  response_failed: 'response_failed',
};

function normalizeBrowserObserved(
  envelope: RawAcquisitionEnvelope,
  payload: Record<string, unknown>
): NormalizedAcquisitionEvent {
  const normalizationClass = browserClasses[envelope.sourceEventFamily];
  if (!normalizationClass) {
    return {
      ...baseEvent(envelope),
      status: 'unknown',
      driftReason: `Unrecognized browser-observed event family: ${envelope.sourceEventFamily}`,
    };
  }

  const metadata: Record<string, string | number | boolean | null> = {};
  const itemId = stringField(payload, 'item_id');
  if (itemId) metadata.item_id = itemId;

  if (
    normalizationClass === 'assistant_text_delta'
    || normalizationClass === 'reasoning_summary_delta'
  ) {
    const delta = stringField(payload, 'delta');
    return delta === undefined
      ? drift(envelope, 'Browser-observed delta event is missing string field delta')
      : normalized(envelope, normalizationClass, delta, metadata);
  }

  if (
    normalizationClass === 'assistant_text_completed'
    || normalizationClass === 'reasoning_summary_completed'
  ) {
    const text = stringField(payload, 'text');
    return text === undefined
      ? drift(envelope, 'Browser-observed completion event is missing string field text')
      : normalized(envelope, normalizationClass, text, metadata);
  }

  if (
    normalizationClass === 'tool_call_started'
    || normalizationClass === 'tool_call_completed'
  ) {
    const tool = stringField(payload, 'tool');
    if (!tool) return drift(envelope, 'Browser-observed tool event is missing string field tool');
    metadata.tool = tool;
    const callId = stringField(payload, 'call_id');
    if (callId) metadata.call_id = callId;
  }

  return normalized(envelope, normalizationClass, undefined, metadata);
}

export function normalizeAcquisitionEnvelope(
  envelope: RawAcquisitionEnvelope
): NormalizedAcquisitionEvent {
  if (!envelope.sourceStreamRef.trim()) return drift(envelope, 'sourceStreamRef is empty');
  if (!envelope.sourceEventRef.trim()) return drift(envelope, 'sourceEventRef is empty');
  if (!envelope.sourceEventFamily.trim()) return drift(envelope, 'sourceEventFamily is empty');
  if (
    envelope.sourceSequenceNumber !== undefined
    && (!Number.isInteger(envelope.sourceSequenceNumber) || envelope.sourceSequenceNumber < 0)
  ) {
    return drift(envelope, 'sourceSequenceNumber must be a non-negative integer');
  }

  const payload = asRecord(envelope.payload);
  if (!payload) return drift(envelope, 'Raw acquisition payload is not a JSON object');

  return envelope.sourceFamily === 'openai_api'
    ? normalizeOpenAI(envelope, payload)
    : normalizeBrowserObserved(envelope, payload);
}

export function classifySequence(
  previousSequence: number | undefined,
  currentSequence: number | undefined
): AcquisitionSequenceState {
  if (previousSequence === undefined || currentSequence === undefined) return 'indeterminate';
  if (currentSequence === previousSequence) return 'duplicate';
  if (currentSequence < previousSequence) return 'out_of_order';
  if (currentSequence === previousSequence + 1) return 'in_order';
  return 'gap';
}

function semanticContent(events: NormalizedAcquisitionEvent[]) {
  const normalizedEvents = events.filter(
    (event): event is NormalizedAcquisitionEvent & { normalizationClass: AcquisitionNormalizationClass } =>
      event.status === 'normalized' && event.normalizationClass !== undefined
  );

  const lastCompleted = (kind: AcquisitionNormalizationClass) =>
    normalizedEvents.filter((event) => event.normalizationClass === kind).at(-1)?.content;

  const joinedDeltas = (kind: AcquisitionNormalizationClass) =>
    normalizedEvents
      .filter((event) => event.normalizationClass === kind)
      .map((event) => event.content ?? '')
      .join('');

  const assistantCompleted = lastCompleted('assistant_text_completed');
  const assistant = assistantCompleted ?? joinedDeltas('assistant_text_delta');
  const reasoningCompleted = lastCompleted('reasoning_summary_completed');
  const reasoningSummary = reasoningCompleted ?? joinedDeltas('reasoning_summary_delta');
  const terminal = normalizedEvents
    .filter((event) => ['response_completed', 'response_incomplete', 'response_failed'].includes(event.normalizationClass))
    .at(-1)?.normalizationClass;
  const tools = normalizedEvents
    .filter((event) => event.normalizationClass === 'tool_call_started' || event.normalizationClass === 'tool_call_completed')
    .map((event) => `${event.normalizationClass}:${stableJsonStringify(event.metadata)}`);

  return {
    ...(assistant ? { assistant } : {}),
    ...(reasoningSummary ? { reasoningSummary } : {}),
    ...(terminal ? { terminal } : {}),
    ...(tools.length > 0 ? { tools } : {}),
  };
}

function compatibleText(left: string, right: string): boolean {
  return left === right || left.startsWith(right) || right.startsWith(left);
}

export function compareAcquisitionStreams(
  leftEvents: NormalizedAcquisitionEvent[],
  rightEvents: NormalizedAcquisitionEvent[],
  sameLogicalTurn = true
): AcquisitionComparisonResult {
  if (!sameLogicalTurn) return 'unmatched';

  const left = semanticContent(leftEvents);
  const right = semanticContent(rightEvents);
  const leftKeys = Object.keys(left) as Array<keyof typeof left>;
  const rightKeys = Object.keys(right) as Array<keyof typeof right>;
  const sharedKeys = leftKeys.filter((key) => rightKeys.includes(key));

  if (sharedKeys.length === 0) return 'ambiguous';
  if (stableJsonStringify(left) === stableJsonStringify(right)) return 'exact';

  for (const key of sharedKeys) {
    const leftValue = left[key];
    const rightValue = right[key];
    if (typeof leftValue === 'string' && typeof rightValue === 'string') {
      if (!compatibleText(leftValue, rightValue)) return 'conflict';
      continue;
    }
    if (stableJsonStringify(leftValue) !== stableJsonStringify(rightValue)) return 'conflict';
  }

  return 'compatible_extension';
}
