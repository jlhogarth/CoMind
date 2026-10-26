import { createHash } from 'node:crypto';

export const CFR_001G_POLICY_VERSION = 'cfr_001g_deterministic_v1';

export type ConversationRole = 'user' | 'assistant' | 'system' | 'tool';
export type DerivationKind =
  | 'intent'
  | 'topic'
  | 'entity'
  | 'decision_candidate'
  | 'assumption'
  | 'requirement'
  | 'open_question'
  | 'commitment'
  | 'unresolved_thread'
  | 'architecture_relationship'
  | 'action_candidate'
  | 'conflict_signal'
  | 'salience_signal';

export type SourceKind = 'canonical_message' | 'live_partial' | 'conversation_aggregate';
export type ConflictState = 'none' | 'ambiguous' | 'conflicting';
export type PromotionTarget = 'memory' | 'rule' | 'decision' | 'assumption' | 'open_question' | 'task' | 'architecture';

export interface ConversationDerivationMessage {
  msgId: string;
  role: ConversationRole;
  content: string;
  createdAt: string;
}

export interface ConversationDerivationPartial {
  checkpointId: string;
  generationId?: string | null;
  content: string;
  createdAt: string;
  captureSequenceStart?: number | null;
  captureSequenceEnd?: number | null;
}

export interface ConversationDerivationInput {
  convId: string;
  title?: string | null;
  source?: string | null;
  messages: ConversationDerivationMessage[];
  interruptedPartials?: ConversationDerivationPartial[];
  captureEventCount?: number;
  checkpointCount?: number;
  maxCaptureSequence?: number;
}

export interface MessageAnalyticsProjection {
  msgId: string;
  charCount: number;
  wordCount: number;
  tokenCountApprox: number;
  sentenceCount: number;
  questionCount: number;
  topics: string[];
  metrics: Record<string, unknown>;
}

export interface TypedDerivation {
  derivationKind: DerivationKind;
  sourceKind: SourceKind;
  sourceRole: ConversationRole | null;
  msgId: string | null;
  checkpointId: string | null;
  captureSequenceStart: number | null;
  captureSequenceEnd: number | null;
  evidenceStartChar: number | null;
  evidenceEndChar: number | null;
  valueText: string;
  normalizedKey: string | null;
  confidence: number;
  salience: number;
  uncertainty: string | null;
  conflictState: ConflictState;
  evidence: Record<string, unknown>;
  metadata: Record<string, unknown>;
  derivationSha256: string;
}

export interface PromotionCandidate {
  derivationSha256: string;
  targetType: PromotionTarget;
  proposedTitle: string;
  proposedContent: string;
  rationale: string;
  confidence: number;
  salience: number;
  uncertainty: string | null;
  conflictState: ConflictState;
  evidence: Record<string, unknown>;
  candidateSha256: string;
}

export interface ConversationAnalyticsProjection {
  summary: string;
  topics: string[];
  stats: Record<string, unknown>;
}

export interface ConversationDerivationResult {
  policyVersion: string;
  sourceSnapshotSha256: string;
  runIdentitySha256: string;
  sourceStats: {
    messageCount: number;
    captureEventCount: number;
    checkpointCount: number;
    maxCaptureSequence: number;
    interruptedPartialCount: number;
    sourceStartedAt: string | null;
    sourceEndedAt: string | null;
  };
  messageAnalytics: MessageAnalyticsProjection[];
  conversationAnalytics: ConversationAnalyticsProjection;
  derivations: TypedDerivation[];
  promotionCandidates: PromotionCandidate[];
}

const STOP_WORDS = new Set([
  'a','an','and','are','as','at','be','been','but','by','can','could','did','do','does','for','from','had','has','have','he','her','hers','him','his','i','if','in','into','is','it','its','me','my','of','on','or','our','ours','she','should','so','that','the','their','theirs','them','they','this','to','us','was','we','were','what','when','where','which','who','why','will','with','would','you','your','yours'
]);

const COMMON_CAPITALIZED = new Set([
  'I','A','An','And','But','Do','Does','For','From','If','In','It','Let','No','Please','So','The','This','We','What','When','Where','Which','Who','Why','Yes','You'
]);

const KIND_BASE_SALIENCE: Record<DerivationKind, number> = {
  intent: 0.65,
  topic: 0.35,
  entity: 0.30,
  decision_candidate: 0.90,
  assumption: 0.70,
  requirement: 0.86,
  open_question: 0.62,
  commitment: 0.76,
  unresolved_thread: 0.90,
  architecture_relationship: 0.82,
  action_candidate: 0.72,
  conflict_signal: 0.84,
  salience_signal: 0.90,
};

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function stable(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${stable(object[key])}`).join(',')}}`;
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function normalizeKey(value: string): string {
  return normalizeWhitespace(value).toLocaleLowerCase().replace(/[^a-z0-9_#-]+/g, ' ').trim().replace(/\s+/g, ' ');
}

function words(value: string): string[] {
  return value.match(/[A-Za-z0-9_#-]+/g) ?? [];
}

interface SentenceSpan { text: string; start: number; end: number; }

function sentenceSpans(content: string): SentenceSpan[] {
  const spans: SentenceSpan[] = [];
  const regex = /[^.!?\n]+[.!?]?/g;
  for (const match of content.matchAll(regex)) {
    const raw = match[0];
    const leading = raw.length - raw.trimStart().length;
    const text = raw.trim();
    if (!text) continue;
    const start = (match.index ?? 0) + leading;
    spans.push({ text, start, end: start + text.length });
  }
  return spans;
}

function topTopics(value: string, limit = 6): string[] {
  const frequency = new Map<string, number>();
  for (const token of words(value)) {
    const normalized = token.toLocaleLowerCase();
    if (normalized.length < 3 || STOP_WORDS.has(normalized) || /^\d+$/.test(normalized)) continue;
    frequency.set(normalized, (frequency.get(normalized) ?? 0) + 1);
  }
  return [...frequency.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([topic]) => topic);
}

function extractEntities(value: string): string[] {
  const entities = new Set<string>();
  const technical = value.match(/\b(?:CFR-\d+[A-Z]?|DRB-\d+|SDN-\d+|RGW-\d+|cm_[a-z0-9_]+|PR\s*#?\d+|Issue\s*#?\d+)\b/gi) ?? [];
  for (const entity of technical) entities.add(normalizeWhitespace(entity));

  const capitalized = value.match(/\b[A-Z][A-Za-z0-9]+(?:\s+[A-Z][A-Za-z0-9]+){0,3}\b/g) ?? [];
  for (const entity of capitalized) {
    if (!COMMON_CAPITALIZED.has(entity) && entity.length >= 3) entities.add(entity);
  }
  return [...entities].sort((a, b) => a.localeCompare(b));
}

function bounded(value: string, max = 1000): string {
  const text = normalizeWhitespace(value);
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

function salienceFor(kind: DerivationKind, role: ConversationRole | null, text: string): number {
  let score = KIND_BASE_SALIENCE[kind];
  if (role === 'user') score += 0.04;
  if (/\b(?:must|never|always|required|critical|important|approve|approved|decision|blocker)\b/i.test(text)) score += 0.06;
  if (/\b(?:production|security|privacy|authority|evidence|provenance|architecture)\b/i.test(text)) score += 0.03;
  return Math.min(1, Number(score.toFixed(4)));
}

function derivationHash(value: Omit<TypedDerivation, 'derivationSha256'>): string {
  return sha256(stable(value));
}

function candidateHash(value: Omit<PromotionCandidate, 'candidateSha256'>): string {
  return sha256(stable(value));
}

function makeDerivation(input: Omit<TypedDerivation, 'derivationSha256' | 'salience'> & { salience?: number }): TypedDerivation {
  const withoutHash: Omit<TypedDerivation, 'derivationSha256'> = {
    ...input,
    salience: input.salience ?? salienceFor(input.derivationKind, input.sourceRole, input.valueText),
  };
  return { ...withoutHash, derivationSha256: derivationHash(withoutHash) };
}

function markerConfidence(kind: DerivationKind): number {
  switch (kind) {
    case 'decision_candidate': return 0.90;
    case 'requirement': return 0.86;
    case 'assumption': return 0.80;
    case 'commitment': return 0.84;
    case 'open_question': return 0.99;
    case 'unresolved_thread': return 0.96;
    case 'architecture_relationship': return 0.72;
    case 'conflict_signal': return 0.62;
    case 'action_candidate': return 0.76;
    case 'intent': return 0.82;
    case 'entity': return 0.82;
    case 'topic': return 0.65;
    case 'salience_signal': return 0.92;
  }
}

function addSentenceDerivation(
  output: TypedDerivation[],
  message: ConversationDerivationMessage,
  span: SentenceSpan,
  kind: DerivationKind,
  extra: Partial<Pick<TypedDerivation, 'uncertainty' | 'conflictState' | 'metadata'>> = {},
): void {
  const valueText = bounded(span.text);
  output.push(makeDerivation({
    derivationKind: kind,
    sourceKind: 'canonical_message',
    sourceRole: message.role,
    msgId: message.msgId,
    checkpointId: null,
    captureSequenceStart: null,
    captureSequenceEnd: null,
    evidenceStartChar: span.start,
    evidenceEndChar: span.end,
    valueText,
    normalizedKey: normalizeKey(valueText),
    confidence: markerConfidence(kind),
    uncertainty: extra.uncertainty ?? null,
    conflictState: extra.conflictState ?? 'none',
    evidence: { msg_id: message.msgId, created_at: message.createdAt, start_char: span.start, end_char: span.end },
    metadata: extra.metadata ?? { extraction: 'deterministic_marker_v1' },
  }));
}

function classifyMessage(message: ConversationDerivationMessage): TypedDerivation[] {
  const output: TypedDerivation[] = [];
  const spans = sentenceSpans(message.content);

  for (const span of spans) {
    const text = span.text;
    if (message.role === 'user' && /\b(?:i want|i would like|i'd like|please|let'?s|my goal|we need to|i need to)\b/i.test(text)) {
      addSentenceDerivation(output, message, span, 'intent');
    }
    if (/\b(?:i approve|approved|we will use|we will adopt|we chose|we choose|decision(?: is|:)|agreed|we agreed|adopt(?:ed)?)\b/i.test(text)) {
      addSentenceDerivation(output, message, span, 'decision_candidate');
    }
    if (/\b(?:assume|assuming|assumption|i think|we think|likely|probably|presume)\b/i.test(text)) {
      addSentenceDerivation(output, message, span, 'assumption', { uncertainty: 'Lexical assumption cue; verify before promotion.' });
    }
    if (/\b(?:must|shall|should|need to|needs to|required|requires|cannot|can't|do not|don't|never|always)\b/i.test(text)) {
      addSentenceDerivation(output, message, span, 'requirement');
    }
    if (/[?]\s*$/.test(text)) {
      addSentenceDerivation(output, message, span, 'open_question');
    }
    if (/\b(?:i will|we will|i'll|we'll|i can|we can|i am going to|we are going to)\b/i.test(text)) {
      addSentenceDerivation(output, message, span, 'commitment');
    }
    if (/\b(?:next|continue|build|create|implement|verify|inspect|test|deploy|merge|document|record|review|investigate)\b/i.test(text)) {
      addSentenceDerivation(output, message, span, 'action_candidate');
    }
    if (/\b(?:however|but|instead|contradict|contradiction|conflict|inconsistent|rather than)\b/i.test(text)) {
      addSentenceDerivation(output, message, span, 'conflict_signal', {
        conflictState: 'ambiguous',
        uncertainty: 'Lexical contrast/conflict signal only; not proof of a contradiction.',
      });
    }
    const relationCue = /(?:->|→|\b(?:uses|depends on|integrates with|connects to|talks to|feeds|extends|wraps|reuses|promotes to|reads from|writes to)\b)/i.test(text);
    if (relationCue && extractEntities(text).length >= 2) {
      addSentenceDerivation(output, message, span, 'architecture_relationship', {
        uncertainty: 'Relationship extracted from explicit sentence structure; semantic direction should be reviewed before canonical promotion.',
      });
    }
    if (/\b(?:critical|important|priority|urgent|must|never|always|approve|approved|blocker)\b/i.test(text)) {
      addSentenceDerivation(output, message, span, 'salience_signal');
    }
  }

  for (const entity of extractEntities(message.content)) {
    output.push(makeDerivation({
      derivationKind: 'entity',
      sourceKind: 'canonical_message',
      sourceRole: message.role,
      msgId: message.msgId,
      checkpointId: null,
      captureSequenceStart: null,
      captureSequenceEnd: null,
      evidenceStartChar: null,
      evidenceEndChar: null,
      valueText: entity,
      normalizedKey: normalizeKey(entity),
      confidence: markerConfidence('entity'),
      uncertainty: null,
      conflictState: 'none',
      evidence: { msg_id: message.msgId, created_at: message.createdAt },
      metadata: { extraction: 'deterministic_entity_v1' },
    }));
  }

  for (const topic of topTopics(message.content, 5)) {
    output.push(makeDerivation({
      derivationKind: 'topic',
      sourceKind: 'canonical_message',
      sourceRole: message.role,
      msgId: message.msgId,
      checkpointId: null,
      captureSequenceStart: null,
      captureSequenceEnd: null,
      evidenceStartChar: null,
      evidenceEndChar: null,
      valueText: topic,
      normalizedKey: topic,
      confidence: markerConfidence('topic'),
      uncertainty: 'Frequency-based lexical topic; not a semantic classification.',
      conflictState: 'none',
      evidence: { msg_id: message.msgId, created_at: message.createdAt },
      metadata: { extraction: 'deterministic_topic_frequency_v1' },
    }));
  }

  return output;
}

function unresolvedQuestionDerivations(messages: ConversationDerivationMessage[]): TypedDerivation[] {
  const output: TypedDerivation[] = [];
  for (let index = 0; index < messages.length; index += 1) {
    const message = messages[index];
    if (message.role !== 'user') continue;
    const questionSpans = sentenceSpans(message.content).filter((span) => /[?]\s*$/.test(span.text));
    if (questionSpans.length === 0) continue;
    const laterCanonicalAssistant = messages.slice(index + 1).some((later) => later.role === 'assistant');
    if (laterCanonicalAssistant) continue;
    for (const span of questionSpans) {
      addSentenceDerivation(output, message, span, 'unresolved_thread', {
        uncertainty: 'No later canonical assistant message exists in the analyzed snapshot.',
        metadata: { extraction: 'deterministic_unresolved_question_v1', resolution_basis: 'canonical_assistant_message_absent' },
      });
    }
  }
  return output;
}

function partialDerivations(partial: ConversationDerivationPartial): TypedDerivation[] {
  const output: TypedDerivation[] = [];
  const boundedContent = bounded(partial.content, 2000);
  output.push(makeDerivation({
    derivationKind: 'salience_signal',
    sourceKind: 'live_partial',
    sourceRole: 'assistant',
    msgId: null,
    checkpointId: partial.checkpointId,
    captureSequenceStart: partial.captureSequenceStart ?? null,
    captureSequenceEnd: partial.captureSequenceEnd ?? null,
    evidenceStartChar: 0,
    evidenceEndChar: partial.content.length,
    valueText: boundedContent,
    normalizedKey: normalizeKey(boundedContent),
    confidence: 1,
    salience: 0.92,
    uncertainty: 'Interrupted assistant text is source evidence but is not a canonical completed assistant message.',
    conflictState: 'none',
    evidence: {
      checkpoint_id: partial.checkpointId,
      generation_id: partial.generationId ?? null,
      created_at: partial.createdAt,
      interrupted: true,
    },
    metadata: { extraction: 'cfr_interrupted_partial_v1', canonical_message: false },
  }));

  for (const span of sentenceSpans(partial.content)) {
    if (/[?]\s*$/.test(span.text)) {
      const valueText = bounded(span.text);
      output.push(makeDerivation({
        derivationKind: 'open_question',
        sourceKind: 'live_partial',
        sourceRole: 'assistant',
        msgId: null,
        checkpointId: partial.checkpointId,
        captureSequenceStart: partial.captureSequenceStart ?? null,
        captureSequenceEnd: partial.captureSequenceEnd ?? null,
        evidenceStartChar: span.start,
        evidenceEndChar: span.end,
        valueText,
        normalizedKey: normalizeKey(valueText),
        confidence: 0.99,
        salience: 0.68,
        uncertainty: 'Question exists only in interrupted assistant evidence.',
        conflictState: 'none',
        evidence: { checkpoint_id: partial.checkpointId, interrupted: true },
        metadata: { extraction: 'cfr_interrupted_partial_question_v1', canonical_message: false },
      }));
    }
  }
  return output;
}

function promotionTarget(derivation: TypedDerivation): PromotionTarget | null {
  switch (derivation.derivationKind) {
    case 'decision_candidate': return 'decision';
    case 'assumption': return 'assumption';
    case 'unresolved_thread': return 'open_question';
    case 'architecture_relationship': return derivation.salience >= 0.80 ? 'architecture' : null;
    case 'commitment':
    case 'action_candidate': return derivation.salience >= 0.74 ? 'task' : null;
    case 'requirement':
      return /\b(?:must|shall|never|always|required|do not|don't)\b/i.test(derivation.valueText) ? 'rule' : 'memory';
    case 'intent': return derivation.salience >= 0.75 ? 'memory' : null;
    default: return null;
  }
}

function candidateFor(derivation: TypedDerivation): PromotionCandidate | null {
  const targetType = promotionTarget(derivation);
  if (!targetType) return null;
  const withoutHash: Omit<PromotionCandidate, 'candidateSha256'> = {
    derivationSha256: derivation.derivationSha256,
    targetType,
    proposedTitle: `${targetType}: ${bounded(derivation.valueText, 96)}`,
    proposedContent: derivation.valueText,
    rationale: `CFR-001G deterministic ${derivation.derivationKind} signal exceeded the review-candidate threshold. Candidate creation is not canonical promotion.`,
    confidence: derivation.confidence,
    salience: derivation.salience,
    uncertainty: derivation.uncertainty,
    conflictState: derivation.conflictState,
    evidence: { ...derivation.evidence, derivation_sha256: derivation.derivationSha256 },
  };
  return { ...withoutHash, candidateSha256: candidateHash(withoutHash) };
}

export function deriveConversation(input: ConversationDerivationInput): ConversationDerivationResult {
  const messages = [...input.messages].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.msgId.localeCompare(b.msgId));
  const partials = [...(input.interruptedPartials ?? [])].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.checkpointId.localeCompare(b.checkpointId));
  const sourceSnapshot = {
    convId: input.convId,
    title: input.title ?? null,
    source: input.source ?? null,
    messages: messages.map(({ msgId, role, content, createdAt }) => ({ msgId, role, content, createdAt })),
    interruptedPartials: partials.map((partial) => ({
      checkpointId: partial.checkpointId,
      generationId: partial.generationId ?? null,
      content: partial.content,
      createdAt: partial.createdAt,
      captureSequenceStart: partial.captureSequenceStart ?? null,
      captureSequenceEnd: partial.captureSequenceEnd ?? null,
    })),
    captureEventCount: input.captureEventCount ?? 0,
    checkpointCount: input.checkpointCount ?? partials.length,
    maxCaptureSequence: input.maxCaptureSequence ?? 0,
  };
  const sourceSnapshotSha256 = sha256(stable(sourceSnapshot));
  const runIdentitySha256 = sha256(`${CFR_001G_POLICY_VERSION}|deterministic|${sourceSnapshotSha256}`);

  const messageAnalytics = messages.map((message) => {
    const messageWords = words(message.content);
    const spans = sentenceSpans(message.content);
    return {
      msgId: message.msgId,
      charCount: message.content.length,
      wordCount: messageWords.length,
      tokenCountApprox: messageWords.length,
      sentenceCount: spans.length,
      questionCount: spans.filter((span) => /[?]\s*$/.test(span.text)).length,
      topics: topTopics(message.content, 5),
      metrics: {
        approximation: 'word_count_v1',
        role: message.role,
        explicit_requirement_markers: (message.content.match(/\b(?:must|shall|should|need to|required|requires|never|always)\b/gi) ?? []).length,
        explicit_decision_markers: (message.content.match(/\b(?:approve|approved|decision|agreed|adopt)\b/gi) ?? []).length,
        explicit_action_markers: (message.content.match(/\b(?:next|continue|build|create|implement|verify|test|deploy|merge|document|record|review)\b/gi) ?? []).length,
      },
    } satisfies MessageAnalyticsProjection;
  });

  const derivations: TypedDerivation[] = [];
  for (const message of messages) derivations.push(...classifyMessage(message));
  derivations.push(...unresolvedQuestionDerivations(messages));
  for (const partial of partials) derivations.push(...partialDerivations(partial));

  const allText = messages.map((message) => message.content).join('\n');
  const aggregateTopics = topTopics(allText, 8);
  for (const topic of aggregateTopics) {
    derivations.push(makeDerivation({
      derivationKind: 'topic',
      sourceKind: 'conversation_aggregate',
      sourceRole: null,
      msgId: null,
      checkpointId: null,
      captureSequenceStart: null,
      captureSequenceEnd: null,
      evidenceStartChar: null,
      evidenceEndChar: null,
      valueText: topic,
      normalizedKey: topic,
      confidence: 0.70,
      salience: 0.42,
      uncertainty: 'Conversation-level lexical frequency topic; not a semantic classification.',
      conflictState: 'none',
      evidence: { conv_id: input.convId, source_snapshot_sha256: sourceSnapshotSha256 },
      metadata: { extraction: 'conversation_topic_frequency_v1' },
    }));
  }

  const unique = new Map<string, TypedDerivation>();
  for (const derivation of derivations) unique.set(derivation.derivationSha256, derivation);
  const uniqueDerivations = [...unique.values()].sort((a, b) =>
    a.derivationKind.localeCompare(b.derivationKind) || a.derivationSha256.localeCompare(b.derivationSha256));

  const promotionCandidates = uniqueDerivations
    .map(candidateFor)
    .filter((candidate): candidate is PromotionCandidate => candidate !== null)
    .filter((candidate) => candidate.conflictState !== 'conflicting')
    .sort((a, b) => b.salience - a.salience || a.candidateSha256.localeCompare(b.candidateSha256));

  const roleCounts = messages.reduce<Record<string, number>>((counts, message) => {
    counts[message.role] = (counts[message.role] ?? 0) + 1;
    return counts;
  }, {});
  const kindCounts = uniqueDerivations.reduce<Record<string, number>>((counts, derivation) => {
    counts[derivation.derivationKind] = (counts[derivation.derivationKind] ?? 0) + 1;
    return counts;
  }, {});
  const unresolvedCount = kindCounts.unresolved_thread ?? 0;
  const latestUserIntent = [...uniqueDerivations].reverse().find((item) => item.derivationKind === 'intent' && item.sourceRole === 'user');
  const summaryParts = [
    latestUserIntent ? `Primary explicit intent: ${bounded(latestUserIntent.valueText, 180)}` : 'No explicit intent marker detected.',
    aggregateTopics.length > 0 ? `Top lexical topics: ${aggregateTopics.join(', ')}.` : 'No lexical topics detected.',
    `Unresolved threads: ${unresolvedCount}.`,
    `Interrupted partials preserved: ${partials.length}.`,
    `Promotion candidates awaiting review: ${promotionCandidates.length}.`,
  ];

  const timestamps = [...messages.map((message) => message.createdAt), ...partials.map((partial) => partial.createdAt)].sort();
  return {
    policyVersion: CFR_001G_POLICY_VERSION,
    sourceSnapshotSha256,
    runIdentitySha256,
    sourceStats: {
      messageCount: messages.length,
      captureEventCount: input.captureEventCount ?? 0,
      checkpointCount: input.checkpointCount ?? partials.length,
      maxCaptureSequence: input.maxCaptureSequence ?? 0,
      interruptedPartialCount: partials.length,
      sourceStartedAt: timestamps[0] ?? null,
      sourceEndedAt: timestamps.at(-1) ?? null,
    },
    messageAnalytics,
    conversationAnalytics: {
      summary: summaryParts.join(' '),
      topics: aggregateTopics,
      stats: {
        policy_version: CFR_001G_POLICY_VERSION,
        source_snapshot_sha256: sourceSnapshotSha256,
        message_count: messages.length,
        role_counts: roleCounts,
        derivation_counts: kindCounts,
        promotion_candidate_count: promotionCandidates.length,
        interrupted_partial_count: partials.length,
        ambiguity_or_conflict_count: uniqueDerivations.filter((item) => item.conflictState !== 'none').length,
      },
    },
    derivations: uniqueDerivations,
    promotionCandidates,
  };
}
