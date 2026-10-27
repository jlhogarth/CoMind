import type { QueryFunction } from '../db.js';
import { fingerprintCanonicalValue } from './checkpoint.js';
import {
  getCheckpointLineage,
  getContinuityContext,
  type ThreadKeeperCaseState,
} from '../threadkeeper/repository.js';

export const CONTINUITY_HANDOFF_VERSION = 'continuity-handoff-v1';

export type ContinuityHandoffErrorCode =
  | 'scope_unavailable'
  | 'checkpoint_unavailable'
  | 'stale_checkpoint'
  | 'lineage_inconsistent';

export class ContinuityHandoffError extends Error {
  readonly code: ContinuityHandoffErrorCode;

  constructor(code: ContinuityHandoffErrorCode, message: string) {
    super(message);
    this.name = 'ContinuityHandoffError';
    this.code = code;
  }
}

export interface ContinuityConsumerIdentity {
  consumerRef: string;
  providerRef?: string;
  actorRef?: string;
}

export interface ContinuityHandoffInput extends ContinuityConsumerIdentity {
  scopeSemanticKey: string;
  expectedCheckpointId?: string;
  resolvedAt: string;
}

export interface ContinuityHandoffCaseSummary {
  caseId: string;
  caseKey: string;
  state: ThreadKeeperCaseState;
  latestTransitionId: string;
  lastTransitionAt: string;
}

export interface ContinuityHandoffEnvelope {
  version: typeof CONTINUITY_HANDOFF_VERSION;
  scopeSemanticKey: string;
  currentCheckpoint: {
    checkpointId: string;
    parentCheckpointId: string | null;
    persistenceSeq: string;
    acceptedAt: string;
    acceptedByRef: string;
    authorityEvidenceRef: string;
    policyRef: string | null;
    stateDigest: string;
    proposalDigest: string;
  };
  lineage: {
    checkpointIds: string[];
    depth: number;
  };
  unresolvedCases: ContinuityHandoffCaseSummary[];
  continuityDigest: string;
  consumer: {
    consumerRef: string;
    providerRef: string | null;
    actorRef: string | null;
    authorityMode: 'requires_independent_validation';
    resolvedAt: string;
  };
}

type CanonicalContinuityHandoff = Omit<ContinuityHandoffEnvelope, 'continuityDigest' | 'consumer'>;

function boundedString(value: unknown, field: string, max = 4096): asserts value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > max || value.trim() !== value) {
    throw new Error(`Invalid ${field}`);
  }
}

function normalizeTimestamp(value: string, field: string): string {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(`Invalid ${field}`);
  return new Date(parsed).toISOString();
}

/**
 * Resolve the provider- and actor-neutral continuity state that a downstream
 * consumer may use. The handoff never grants authority to the consumer. Any
 * actor that receives this envelope must validate its own execution authority
 * independently at the action boundary.
 */
export async function resolveContinuityHandoff(
  query: QueryFunction,
  input: ContinuityHandoffInput
): Promise<ContinuityHandoffEnvelope> {
  boundedString(input.scopeSemanticKey, 'continuity handoff scope semantic key', 256);
  boundedString(input.consumerRef, 'continuity handoff consumer reference', 512);
  if (input.providerRef !== undefined) boundedString(input.providerRef, 'continuity handoff provider reference', 512);
  if (input.actorRef !== undefined) boundedString(input.actorRef, 'continuity handoff actor reference', 512);
  if (input.expectedCheckpointId !== undefined) {
    boundedString(input.expectedCheckpointId, 'continuity handoff expected checkpoint id', 128);
  }
  const resolvedAt = normalizeTimestamp(input.resolvedAt, 'continuity handoff resolution timestamp');

  const context = await getContinuityContext(query, input.scopeSemanticKey);
  if (!context) {
    throw new ContinuityHandoffError('scope_unavailable', 'Continuity scope is unavailable');
  }
  const current = context.acceptedCheckpoint;
  if (!current) {
    throw new ContinuityHandoffError('checkpoint_unavailable', 'Continuity scope has no accepted checkpoint');
  }

  if (input.expectedCheckpointId && input.expectedCheckpointId !== current.checkpoint_id) {
    throw new ContinuityHandoffError(
      'stale_checkpoint',
      `Expected checkpoint ${input.expectedCheckpointId} is stale; current checkpoint is ${current.checkpoint_id}`
    );
  }

  const lineage = await getCheckpointLineage(query, input.scopeSemanticKey);
  const lineageHead = lineage.at(-1);
  if (!lineageHead || lineageHead.checkpoint_id !== current.checkpoint_id) {
    throw new ContinuityHandoffError(
      'lineage_inconsistent',
      'ThreadKeeper current checkpoint does not match the accepted lineage head'
    );
  }

  for (let index = 1; index < lineage.length; index += 1) {
    if (lineage[index].parent_checkpoint_id !== lineage[index - 1].checkpoint_id) {
      throw new ContinuityHandoffError(
        'lineage_inconsistent',
        'ThreadKeeper accepted checkpoint lineage is not a single predecessor chain'
      );
    }
  }

  const unresolvedCases = context.unresolvedCases.map(item => ({ ...item }));
  const canonicalContinuity: CanonicalContinuityHandoff = {
    version: CONTINUITY_HANDOFF_VERSION,
    scopeSemanticKey: input.scopeSemanticKey,
    currentCheckpoint: {
      checkpointId: current.checkpoint_id,
      parentCheckpointId: current.parent_checkpoint_id,
      persistenceSeq: current.persistence_seq,
      acceptedAt: current.accepted_at instanceof Date ? current.accepted_at.toISOString() : new Date(current.accepted_at).toISOString(),
      acceptedByRef: current.accepted_by_ref,
      authorityEvidenceRef: current.authority_evidence_ref,
      policyRef: current.policy_ref,
      stateDigest: current.state_digest,
      proposalDigest: current.digest,
    },
    lineage: {
      checkpointIds: lineage.map(checkpoint => checkpoint.checkpoint_id),
      depth: lineage.length,
    },
    unresolvedCases,
  };

  return {
    ...canonicalContinuity,
    continuityDigest: fingerprintCanonicalValue(canonicalContinuity),
    consumer: {
      consumerRef: input.consumerRef,
      providerRef: input.providerRef ?? null,
      actorRef: input.actorRef ?? null,
      authorityMode: 'requires_independent_validation',
      resolvedAt,
    },
  };
}
