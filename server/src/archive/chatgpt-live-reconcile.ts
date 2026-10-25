import { createHash } from 'node:crypto';

import { canonicalJson } from './chatgpt-export.js';

export const CHATGPT_LIVE_RECONCILIATION_VERSION = 'cfr-001f-v1';

export type ReconciliationResult =
  | 'exact_match'
  | 'compatible_extension'
  | 'conflicting_observation'
  | 'ambiguous_match'
  | 'unmatched_archive';

export type MatchMethod =
  | 'explicit_source_id'
  | 'ordered_message_fingerprint'
  | 'weak_correlation'
  | 'none';

export interface ComparableMessage {
  role: string;
  content: string;
  observedAt: string | null;
  fingerprint: string;
  sourceMessageId?: string | null;
  sourceNodeId?: string | null;
}

export interface ArchiveConversationEvidence {
  importId: string;
  sourceConversationId: string;
  title: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  normalizedHash: string;
  topologyHash: string;
  messages: ComparableMessage[];
}

export interface LiveConversationEvidence {
  convId: string;
  source: string;
  title: string | null;
  externalRef: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  messages: ComparableMessage[];
  interruptedPartials: Array<{
    generationId: string;
    content: string;
    observedAt: string | null;
  }>;
}

export interface CandidateClassification {
  convId: string;
  matchMethod: Exclude<MatchMethod, 'none'>;
  matchStrength: 'strong' | 'medium' | 'weak';
  classification:
    | 'exact_candidate'
    | 'extension_candidate'
    | 'conflict_candidate'
    | 'partial_candidate'
    | 'weak_candidate';
  selected: boolean;
  evidence: Record<string, unknown>;
  candidateSha256: string;
}

export interface ReconciliationClassification {
  result: ReconciliationResult;
  selectedConvId: string | null;
  matchMethod: MatchMethod;
  candidates: CandidateClassification[];
  classificationCounts: Record<string, number>;
  conflicts: Array<Record<string, unknown>>;
  unresolved: Array<Record<string, unknown>>;
  evidence: Record<string, unknown>;
  candidateSetSha256: string;
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function sha256Canonical(value: unknown): string {
  return sha256(canonicalJson(value));
}

export function normalizeComparableText(value: string): string {
  return value.replace(/\r\n?/g, '\n').normalize('NFC');
}

export function comparableMessageFingerprint(role: string, content: string): string {
  return sha256Canonical({ role, content: normalizeComparableText(content) });
}

export function comparableLiveMessage(input: {
  role: string;
  content: string;
  createdAt?: string | null;
}): ComparableMessage {
  const content = normalizeComparableText(input.content);
  return {
    role: input.role,
    content,
    observedAt: input.createdAt ?? null,
    fingerprint: comparableMessageFingerprint(input.role, content),
  };
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function textFromArchiveContent(content: unknown): string | null {
  if (typeof content === 'string') return content;
  const object = asObject(content);
  if (!object) return null;
  if (typeof object.text === 'string') return object.text;
  if (Array.isArray(object.parts)) {
    const parts = object.parts.map((part) => {
      if (typeof part === 'string') return part;
      const partObject = asObject(part);
      if (partObject && typeof partObject.text === 'string') return partObject.text;
      return canonicalJson(part);
    });
    return parts.join('');
  }
  return null;
}

export function comparableArchiveMessage(input: {
  sourceNodeId: string;
  sourceMessageId: string | null;
  role: string | null;
  createdAt?: string | null;
  rawNode: unknown;
}): ComparableMessage | null {
  const rawNode = asObject(input.rawNode);
  const message = asObject(rawNode?.message);
  const role = input.role ?? asObject(message?.author)?.role;
  const content = textFromArchiveContent(message?.content);
  if (typeof role !== 'string' || content === null) return null;
  const normalizedContent = normalizeComparableText(content);
  return {
    role,
    content: normalizedContent,
    observedAt: input.createdAt ?? null,
    fingerprint: comparableMessageFingerprint(role, normalizedContent),
    sourceMessageId: input.sourceMessageId,
    sourceNodeId: input.sourceNodeId,
  };
}

function metadataString(metadata: Record<string, unknown> | null, key: string): string | null {
  const value = metadata?.[key];
  return typeof value === 'string' ? value : null;
}

export function hasExplicitNativeChatGptIdentity(
  archiveSourceConversationId: string,
  live: LiveConversationEvidence
): boolean {
  const metadataIdentity = metadataString(live.metadata, 'native_chatgpt_source_conversation_id');
  const metadataSystem = metadataString(live.metadata, 'source_system');
  const sourceDeclaresChatGpt = /chatgpt/i.test(live.source) || metadataSystem === 'chatgpt';
  return (
    metadataIdentity === archiveSourceConversationId
    || (sourceDeclaresChatGpt && live.externalRef === archiveSourceConversationId)
  );
}

function commonPrefixLength(a: ComparableMessage[], b: ComparableMessage[]): number {
  const length = Math.min(a.length, b.length);
  let index = 0;
  while (index < length && a[index]?.fingerprint === b[index]?.fingerprint) index += 1;
  return index;
}

function timestampsCompatible(a: string | null, b: string | null, toleranceMs = 5 * 60_000): boolean | null {
  if (!a || !b) return null;
  const left = Date.parse(a);
  const right = Date.parse(b);
  if (!Number.isFinite(left) || !Number.isFinite(right)) return null;
  return Math.abs(left - right) <= toleranceMs;
}

function titleCorrelation(archiveTitle: string | null, liveTitle: string | null): boolean {
  if (!archiveTitle || !liveTitle) return false;
  const normalize = (value: string) => value.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
  return normalize(archiveTitle) === normalize(liveTitle);
}

function interruptedPartialEvidence(
  archive: ArchiveConversationEvidence,
  live: LiveConversationEvidence
): {
  liveOnlyPartialCount: number;
  archiveCompletionCount: number;
  details: Array<Record<string, unknown>>;
} {
  const assistantContents = archive.messages
    .filter((message) => message.role === 'assistant')
    .map((message) => message.content);
  let liveOnlyPartialCount = 0;
  let archiveCompletionCount = 0;
  const details: Array<Record<string, unknown>> = [];

  for (const partial of live.interruptedPartials) {
    const normalized = normalizeComparableText(partial.content);
    const completion = assistantContents.find((content) => content.startsWith(normalized));
    if (completion !== undefined) {
      archiveCompletionCount += 1;
      details.push({
        generationId: partial.generationId,
        classification: 'later_archive_completion',
        partialSha256: sha256(normalized),
        archiveCompletionSha256: sha256(completion),
      });
    } else {
      liveOnlyPartialCount += 1;
      details.push({
        generationId: partial.generationId,
        classification: 'live_only_interrupted_partial',
        partialSha256: sha256(normalized),
      });
    }
  }

  return { liveOnlyPartialCount, archiveCompletionCount, details };
}

function classifyCandidate(
  archive: ArchiveConversationEvidence,
  live: LiveConversationEvidence
): Omit<CandidateClassification, 'selected' | 'candidateSha256'> | null {
  const explicitIdentity = hasExplicitNativeChatGptIdentity(archive.sourceConversationId, live);
  const prefixLength = commonPrefixLength(archive.messages, live.messages);
  const comparableLength = Math.min(archive.messages.length, live.messages.length);
  const exactMessages = archive.messages.length > 0
    && archive.messages.length === live.messages.length
    && prefixLength === archive.messages.length;
  const archiveExtendsLive = live.messages.length > 0
    && archive.messages.length > live.messages.length
    && prefixLength === live.messages.length;
  const liveExtendsArchive = archive.messages.length > 0
    && live.messages.length > archive.messages.length
    && prefixLength === archive.messages.length;
  const conflictAt = prefixLength < comparableLength ? prefixLength : null;
  const createdTimeCompatible = timestampsCompatible(archive.createdAt, live.createdAt);
  const sameTitle = titleCorrelation(archive.title, live.title);
  const partials = interruptedPartialEvidence(archive, live);

  let matchMethod: Exclude<MatchMethod, 'none'>;
  let matchStrength: CandidateClassification['matchStrength'];
  let classification: CandidateClassification['classification'];

  if (explicitIdentity) {
    matchMethod = 'explicit_source_id';
    matchStrength = 'strong';
    if (conflictAt !== null) classification = 'conflict_candidate';
    else if (exactMessages) classification = 'exact_candidate';
    else if (archiveExtendsLive || liveExtendsArchive || partials.archiveCompletionCount > 0) classification = 'extension_candidate';
    else classification = 'partial_candidate';
  } else if ((exactMessages || archiveExtendsLive || liveExtendsArchive)
    && prefixLength >= 2
    && createdTimeCompatible !== false) {
    matchMethod = 'ordered_message_fingerprint';
    matchStrength = createdTimeCompatible === true ? 'strong' : 'medium';
    classification = exactMessages ? 'exact_candidate' : 'extension_candidate';
  } else if (sameTitle && createdTimeCompatible === true) {
    matchMethod = 'weak_correlation';
    matchStrength = 'weak';
    classification = 'weak_candidate';
  } else {
    return null;
  }

  return {
    convId: live.convId,
    matchMethod,
    matchStrength,
    classification,
    evidence: {
      explicitIdentity,
      archiveMessageCount: archive.messages.length,
      liveMessageCount: live.messages.length,
      matchingPrefixLength: prefixLength,
      conflictAtIndex: conflictAt,
      createdTimeCompatible,
      titleCorrelated: sameTitle,
      interruptedPartials: partials,
    },
  };
}

function candidatePriority(candidate: Omit<CandidateClassification, 'selected' | 'candidateSha256'>): number {
  const method = candidate.matchMethod === 'explicit_source_id'
    ? 30
    : candidate.matchMethod === 'ordered_message_fingerprint'
      ? 20
      : 10;
  const strength = candidate.matchStrength === 'strong' ? 3 : candidate.matchStrength === 'medium' ? 2 : 1;
  const classification = candidate.classification === 'conflict_candidate'
    ? 5
    : candidate.classification === 'exact_candidate'
      ? 4
      : candidate.classification === 'extension_candidate'
        ? 3
        : candidate.classification === 'partial_candidate'
          ? 2
          : 1;
  return method * 100 + strength * 10 + classification;
}

export function reconcileConversationEvidence(
  archive: ArchiveConversationEvidence,
  liveConversations: LiveConversationEvidence[]
): ReconciliationClassification {
  const rawCandidates = liveConversations
    .map((live) => classifyCandidate(archive, live))
    .filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== null)
    .sort((left, right) => {
      const priority = candidatePriority(right) - candidatePriority(left);
      return priority !== 0 ? priority : left.convId.localeCompare(right.convId);
    });

  const candidateSetSha256 = sha256Canonical(rawCandidates.map((candidate) => ({
    convId: candidate.convId,
    matchMethod: candidate.matchMethod,
    matchStrength: candidate.matchStrength,
    classification: candidate.classification,
    evidence: candidate.evidence,
  })));

  const top = rawCandidates[0];
  const equallyStrong = top
    ? rawCandidates.filter((candidate) => candidatePriority(candidate) === candidatePriority(top))
    : [];
  const selectable = top && top.matchMethod !== 'weak_correlation' && equallyStrong.length === 1
    ? top
    : null;

  let result: ReconciliationResult;
  let selectedConvId: string | null = null;
  let matchMethod: MatchMethod = 'none';
  const conflicts: Array<Record<string, unknown>> = [];
  const unresolved: Array<Record<string, unknown>> = [];

  if (!top) {
    result = 'unmatched_archive';
  } else if (equallyStrong.length > 1 || top.matchMethod === 'weak_correlation') {
    result = 'ambiguous_match';
    matchMethod = top.matchMethod;
    unresolved.push({
      reason: top.matchMethod === 'weak_correlation' ? 'weak_correlation_cannot_establish_identity' : 'multiple_equally_strong_candidates',
      candidateConvIds: equallyStrong.length > 1 ? equallyStrong.map((candidate) => candidate.convId) : rawCandidates.map((candidate) => candidate.convId),
    });
  } else if (selectable) {
    selectedConvId = selectable.convId;
    matchMethod = selectable.matchMethod;
    if (selectable.classification === 'conflict_candidate') {
      result = 'conflicting_observation';
      conflicts.push({ convId: selectable.convId, ...selectable.evidence });
    } else if (selectable.classification === 'exact_candidate') {
      result = 'exact_match';
    } else {
      result = 'compatible_extension';
    }
  } else {
    result = 'ambiguous_match';
    matchMethod = top.matchMethod;
  }

  const candidates: CandidateClassification[] = rawCandidates.map((candidate) => {
    const selected = selectedConvId === candidate.convId;
    const payload = { ...candidate, selected };
    return { ...payload, candidateSha256: sha256Canonical(payload) };
  });

  const counts = candidates.reduce<Record<string, number>>((accumulator, candidate) => {
    accumulator[candidate.classification] = (accumulator[candidate.classification] ?? 0) + 1;
    return accumulator;
  }, {});

  const selectedLive = selectedConvId
    ? liveConversations.find((conversation) => conversation.convId === selectedConvId) ?? null
    : null;
  const selectedPartials = selectedLive ? interruptedPartialEvidence(archive, selectedLive) : null;
  if (selectedPartials) {
    counts.live_only_interrupted_partial = selectedPartials.liveOnlyPartialCount;
    counts.later_archive_completion = selectedPartials.archiveCompletionCount;
  }

  return {
    result,
    selectedConvId,
    matchMethod,
    candidates,
    classificationCounts: counts,
    conflicts,
    unresolved,
    evidence: {
      reconciliationVersion: CHATGPT_LIVE_RECONCILIATION_VERSION,
      archiveImportId: archive.importId,
      archiveSourceConversationId: archive.sourceConversationId,
      archiveNormalizedHash: archive.normalizedHash,
      archiveTopologyHash: archive.topologyHash,
      archiveMessageCount: archive.messages.length,
      liveConversationCountEvaluated: liveConversations.length,
      selectedInterruptedPartialEvidence: selectedPartials,
    },
    candidateSetSha256,
  };
}
