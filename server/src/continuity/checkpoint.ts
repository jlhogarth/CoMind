import { createHash, timingSafeEqual } from 'node:crypto';

export interface ContinuityState {
  conversationId: string;
  executionId: string;
  parentCheckpointId: string | null;
  authority: { subjectId: string; capabilityIds: string[]; policyVersion: string };
  context: { objective: string; decisions: string[]; references: string[] };
  pending: { operationId: string; idempotencyKey: string; status: 'pending' | 'uncertain' | 'completed' }[];
}

export interface Checkpoint {
  version: 1;
  createdAt: string;
  state: ContinuityState;
  digest: string;
}

function validateState(state: ContinuityState): void {
  if (!state || typeof state !== 'object' || !state.conversationId || !state.executionId ||
      !state.authority?.subjectId || !state.authority.policyVersion ||
      !Array.isArray(state.authority.capabilityIds) || !state.context ||
      typeof state.context.objective !== 'string' ||
      !Array.isArray(state.context.decisions) || !Array.isArray(state.context.references) ||
      !Array.isArray(state.pending)) throw new Error('Invalid continuity state');
  if (state.pending.some(p => !p.operationId || !p.idempotencyKey ||
    !['pending', 'uncertain', 'completed'].includes(p.status))) throw new Error('Invalid pending operation');
  if (new Set(state.pending.map(p => p.idempotencyKey)).size !== state.pending.length)
    throw new Error('Duplicate idempotency key');
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  const object = value as Record<string, unknown>;
  return '{' + Object.keys(object).sort().map(key => JSON.stringify(key) + ':' + canonical(object[key])).join(',') + '}';
}

function digest(payload: Omit<Checkpoint, 'digest'>): string {
  return createHash('sha256').update(canonical(payload)).digest('hex');
}

function rejectSecrets(value: unknown): void {
  const serialized = canonical(value);
  if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|sk-proj-[a-zA-Z0-9_-]{12,}|postgres(?:ql)?:\/\/[^\s"@]+:[^\s"@]+@/i.test(serialized))
    throw new Error('Checkpoint contains credential material');
}

export function createCheckpoint(state: ContinuityState, createdAt: string): Checkpoint {
  validateState(state);
  if (!Number.isFinite(Date.parse(createdAt))) throw new Error('Invalid timestamp');
  rejectSecrets(state);
  const payload = structuredClone({ version: 1 as const, createdAt, state });
  const encoded = canonical(payload);
  if (Buffer.byteLength(encoded) > 65536) throw new Error('Checkpoint exceeds 64 KiB');
  return { ...payload, digest: digest(payload) };
}

export function restoreCheckpoint(
  checkpoint: Checkpoint,
  authority: { subjectId: string; capabilityIds: string[]; policyVersion: string },
  now: string,
  maxAgeMs = 86400000
): ContinuityState {
  if (!checkpoint || checkpoint.version !== 1 || !/^[a-f0-9]{64}$/.test(checkpoint.digest))
    throw new Error('Unsupported or invalid checkpoint');
  const { digest: received, ...payload } = checkpoint;
  const expected = digest(payload);
  if (!timingSafeEqual(Buffer.from(received, 'hex'), Buffer.from(expected, 'hex')))
    throw new Error('Checkpoint integrity mismatch');
  validateState(checkpoint.state);
  rejectSecrets(checkpoint.state);
  const age = Date.parse(now) - Date.parse(checkpoint.createdAt);
  if (!Number.isFinite(age) || age < 0 || age > maxAgeMs) throw new Error('Checkpoint expired');
  const saved = checkpoint.state.authority;
  if (saved.subjectId !== authority.subjectId || saved.policyVersion !== authority.policyVersion ||
      saved.capabilityIds.some(capability => !authority.capabilityIds.includes(capability)))
    throw new Error('Authority revalidation failed');
  // Never auto-replay an operation whose outcome is unknown.
  return structuredClone(checkpoint.state);
}
