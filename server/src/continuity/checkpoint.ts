import { createHash, timingSafeEqual } from 'node:crypto';

const MAX_CHECKPOINT_BYTES = 65536;
const DEFAULT_TTL_MS = 86400000;
const MAX_TTL_MS = 30 * 86400000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface ContinuityOperation {
  operationId: string;
  idempotencyKey: string;
  status: 'pending' | 'uncertain' | 'completed';
  taskId: string | null;
  fencingEpoch: number | null;
  adapterOperationId: string | null;
}

export interface ContinuityState {
  conversationId: string;
  workflowId: string;
  executionId: string;
  parentCheckpointId: string | null;
  executionCursor: string;
  authority: { subjectId: string; capabilityIds: string[]; policyVersion: string };
  context: { objective: string; decisions: string[]; references: string[] };
  provenance: { sourceRefs: string[]; evidenceRefs: string[] };
  pending: ContinuityOperation[];
}

export interface Checkpoint {
  version: 1;
  createdAt: string;
  expiresAt: string;
  stateDigest: string;
  state: ContinuityState;
  digest: string;
}

function nonEmpty(value: unknown, max = 2048): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= max;
}

function stringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string');
}

function validateState(state: ContinuityState): void {
  if (!state || typeof state !== 'object'
      || !nonEmpty(state.conversationId, 512)
      || !nonEmpty(state.workflowId, 256)
      || !nonEmpty(state.executionId, 512)
      || !nonEmpty(state.executionCursor, 256)
      || (state.parentCheckpointId !== null && !UUID_PATTERN.test(state.parentCheckpointId))
      || !nonEmpty(state.authority?.subjectId, 512)
      || !nonEmpty(state.authority?.policyVersion, 256)
      || !stringArray(state.authority?.capabilityIds)
      || new Set(state.authority.capabilityIds).size !== state.authority.capabilityIds.length
      || !state.context
      || typeof state.context.objective !== 'string'
      || !stringArray(state.context.decisions)
      || !stringArray(state.context.references)
      || !state.provenance
      || !stringArray(state.provenance.sourceRefs)
      || !stringArray(state.provenance.evidenceRefs)
      || !Array.isArray(state.pending)) {
    throw new Error('Invalid continuity state');
  }

  for (const operation of state.pending) {
    if (!operation || !nonEmpty(operation.operationId, 512)
        || !nonEmpty(operation.idempotencyKey, 512)
        || !['pending', 'uncertain', 'completed'].includes(operation.status)
        || (operation.taskId !== null && !UUID_PATTERN.test(operation.taskId))
        || (operation.adapterOperationId !== null && !UUID_PATTERN.test(operation.adapterOperationId))
        || (operation.fencingEpoch !== null
          && (!Number.isSafeInteger(operation.fencingEpoch) || operation.fencingEpoch < 0))
        || ((operation.taskId === null) !== (operation.fencingEpoch === null))) {
      throw new Error('Invalid pending operation');
    }
  }

  if (new Set(state.pending.map(operation => operation.idempotencyKey)).size !== state.pending.length) {
    throw new Error('Duplicate idempotency key');
  }
}

function canonical(value: unknown): string {
  if (value === undefined) throw new Error('Undefined values are not permitted in checkpoints');
  if (value === null || typeof value !== 'object') {
    const encoded = JSON.stringify(value);
    if (encoded === undefined) throw new Error('Unsupported checkpoint value');
    return encoded;
  }
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  const object = value as Record<string, unknown>;
  return '{' + Object.keys(object).sort()
    .map(key => JSON.stringify(key) + ':' + canonical(object[key])).join(',') + '}';
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function rejectSecrets(value: unknown): void {
  const serialized = canonical(value);
  const credentialPattern = /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|(?:sk|rk)-[A-Za-z0-9_-]{16,}|github_pat_[A-Za-z0-9_]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|Bearer\s+[A-Za-z0-9._~+/=-]{12,}|postgres(?:ql)?:\/\/[^\s"@]+:[^\s"@]+@/i;
  if (credentialPattern.test(serialized)) throw new Error('Checkpoint contains credential material');
}

function safeHexEqual(left: string, right: string): boolean {
  if (!/^[a-f0-9]{64}$/.test(left) || !/^[a-f0-9]{64}$/.test(right)) return false;
  return timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));
}

export function fingerprintState(state: ContinuityState): string {
  validateState(state);
  rejectSecrets(state);
  return sha256(canonical(state));
}

export function createCheckpoint(
  state: ContinuityState,
  createdAt: string,
  ttlMs = DEFAULT_TTL_MS
): Checkpoint {
  validateState(state);
  rejectSecrets(state);
  const createdMs = Date.parse(createdAt);
  if (!Number.isFinite(createdMs)) throw new Error('Invalid timestamp');
  if (!Number.isSafeInteger(ttlMs) || ttlMs <= 0 || ttlMs > MAX_TTL_MS) {
    throw new Error('Invalid checkpoint lifetime');
  }

  const clonedState = structuredClone(state);
  const stateDigest = fingerprintState(clonedState);
  const payload = {
    version: 1 as const,
    createdAt: new Date(createdMs).toISOString(),
    expiresAt: new Date(createdMs + ttlMs).toISOString(),
    stateDigest,
    state: clonedState,
  };
  const checkpoint: Checkpoint = { ...payload, digest: sha256(canonical(payload)) };
  if (Buffer.byteLength(canonical(checkpoint), 'utf8') > MAX_CHECKPOINT_BYTES) {
    throw new Error('Checkpoint exceeds 64 KiB');
  }
  return checkpoint;
}

export function restoreCheckpoint(
  checkpoint: Checkpoint,
  authority: ContinuityState['authority'],
  now: string
): ContinuityState {
  if (!checkpoint || checkpoint.version !== 1
      || !/^[a-f0-9]{64}$/.test(checkpoint.digest)
      || !/^[a-f0-9]{64}$/.test(checkpoint.stateDigest)) {
    throw new Error('Unsupported or invalid checkpoint');
  }
  if (Buffer.byteLength(canonical(checkpoint), 'utf8') > MAX_CHECKPOINT_BYTES) {
    throw new Error('Checkpoint exceeds 64 KiB');
  }

  const nowMs = Date.parse(now);
  const createdMs = Date.parse(checkpoint.createdAt);
  const expiresMs = Date.parse(checkpoint.expiresAt);
  if (!Number.isFinite(nowMs) || !Number.isFinite(createdMs) || !Number.isFinite(expiresMs)
      || createdMs > nowMs || expiresMs <= createdMs || nowMs >= expiresMs
      || expiresMs - createdMs > MAX_TTL_MS) {
    throw new Error('Checkpoint expired or has invalid time bounds');
  }

  validateState(checkpoint.state);
  rejectSecrets(checkpoint.state);
  if (!safeHexEqual(checkpoint.stateDigest, fingerprintState(checkpoint.state))) {
    throw new Error('Checkpoint state integrity mismatch');
  }
  const { digest: received, ...payload } = checkpoint;
  if (!safeHexEqual(received, sha256(canonical(payload)))) {
    throw new Error('Checkpoint integrity mismatch');
  }

  const saved = checkpoint.state.authority;
  if (saved.subjectId !== authority.subjectId
      || saved.policyVersion !== authority.policyVersion
      || saved.capabilityIds.some(capability => !authority.capabilityIds.includes(capability))) {
    throw new Error('Authority revalidation failed');
  }
  return structuredClone(checkpoint.state);
}

export function createSuccessorState(
  restored: ContinuityState,
  parentCheckpointId: string,
  executionId: string,
  executionCursor: string
): ContinuityState {
  if (!UUID_PATTERN.test(parentCheckpointId) || !nonEmpty(executionId, 512) || !nonEmpty(executionCursor, 256)) {
    throw new Error('Invalid successor identity');
  }
  const successor = structuredClone({
    ...restored,
    parentCheckpointId,
    executionId,
    executionCursor,
  });
  validateState(successor);
  rejectSecrets(successor);
  return successor;
}
