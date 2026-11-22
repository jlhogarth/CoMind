import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';

const uuid = z.string().uuid();
const digest = z.string().regex(/^[0-9a-f]{64}$/);
const bounded = z.string().trim().min(1).max(1024);
const conversationId = z.string().regex(/^conv_[A-Za-z0-9_-]+$/);

export const originSchema = z.strictObject({
  originId: uuid,
  surface: z.enum(['openai_api', 'chatgpt_consumer']),
  conversationId: bounded,
  ownerBinding: bounded,
  workKey: bounded,
  authorityRef: bounded,
}).superRefine((origin, context) => {
  const valid = origin.surface === 'openai_api'
    ? conversationId.safeParse(origin.conversationId).success
    : uuid.safeParse(origin.conversationId).success;
  if (!valid) context.addIssue({ code: 'custom', path: ['conversationId'], message: 'origin_identity_invalid' });
});

export type RegisteredOrigin = z.infer<typeof originSchema>;

export const leaseSchema = z.strictObject({
  taskId: uuid,
  leaseToken: uuid,
  fencingEpoch: z.number().int().nonnegative(),
  workerInstanceId: bounded,
});

export const returnSchema = z.strictObject({
  schemaVersion: z.literal('1.0'),
  returnId: uuid,
  executionId: bounded,
  recoveryId: bounded,
  lease: leaseSchema,
  origin: originSchema,
  contextArtifactRef: bounded,
  contextDigest: digest,
  resultArtifactRef: bounded,
  resultDigest: digest,
  resultText: z.string().min(1).max(64_000),
  adapter: z.enum(['openai_api', 'comind_fallback']),
  destinationRef: bounded,
  authorizationRef: bounded,
  clearApproved: z.literal(true),
  expiresAt: z.string().datetime({ offset: true }),
  logicalKey: digest,
}).superRefine((value, context) => {
  if (sha256(value.resultText) !== value.resultDigest) {
    context.addIssue({ code: 'custom', path: ['resultDigest'], message: 'result_integrity_mismatch' });
  }
  if (value.adapter === 'openai_api' &&
      (value.origin.surface !== 'openai_api' || value.destinationRef !== value.origin.conversationId)) {
    context.addIssue({ code: 'custom', path: ['destinationRef'], message: 'destination_binding_mismatch' });
  }
  if (value.adapter === 'comind_fallback' && value.destinationRef !== value.returnId) {
    context.addIssue({ code: 'custom', path: ['destinationRef'], message: 'fallback_identity_mismatch' });
  }
});

export type ReturnEnvelope = z.infer<typeof returnSchema>;
export type ReturnState = 'QUEUED' | 'DISPATCHING' | 'TRANSPORT_ACCEPTED' |
  'RECEIPT_VERIFIED' | 'ACKNOWLEDGED' | 'RETRY_PENDING' | 'DELIVERY_UNCERTAIN' |
  'AUTHORIZATION_REJECTED' | 'DESTINATION_UNAVAILABLE' | 'DEAD_LETTERED' | 'CANCELLED';

export type ReturnRecord = { envelope: ReturnEnvelope; state: ReturnState; attemptCount: number;
  providerItemId: string | null; receiptDigest: string | null; lastReason: string | null };

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function createEnvelope(input: {
  origin: RegisteredOrigin;
  executionId: string;
  recoveryId: string;
  lease: z.infer<typeof leaseSchema>;
  contextArtifactRef: string;
  contextDigest: string;
  resultArtifactRef: string;
  resultText: string;
  adapter: 'openai_api' | 'comind_fallback';
  authorizationRef: string;
  clearApproved: true;
  expiresAt: string;
  returnId?: string;
}): ReturnEnvelope {
  const origin = originSchema.parse(input.origin);
  const resultDigest = sha256(input.resultText);
  const returnId = input.returnId ?? randomUUID();
  const logicalKey = sha256(JSON.stringify([
    '1.0', origin.originId, input.executionId, input.recoveryId, resultDigest,
  ]));
  const envelope = returnSchema.parse({
    schemaVersion: '1.0', returnId, executionId: input.executionId,
    recoveryId: input.recoveryId, origin,
    lease: input.lease,
    contextArtifactRef: input.contextArtifactRef, contextDigest: input.contextDigest,
    resultArtifactRef: input.resultArtifactRef, resultDigest, resultText: input.resultText,
    adapter: input.adapter,
    destinationRef: input.adapter === 'openai_api' ? origin.conversationId : returnId,
    authorizationRef: input.authorizationRef, clearApproved: input.clearApproved,
    expiresAt: input.expiresAt, logicalKey,
  });
  if (Date.parse(envelope.expiresAt) <= Date.now()) throw new Error('return_expired');
  return envelope;
}

export interface ReturnStore {
  stage(envelope: ReturnEnvelope): Promise<ReturnRecord>;
  get(returnId: string): Promise<ReturnRecord | null>;
  claim(returnId: string, workerId: string): Promise<{ record: ReturnRecord; fromState: ReturnState; claimToken: string } | null>;
  transition(returnId: string, workerId: string, claimToken: string, state: ReturnState,
    evidence: { itemId?: string; receiptDigest?: string; reason?: string }): Promise<ReturnRecord>;
}

export type AdapterReceipt = { itemId: string; receiptDigest: string };
export interface ReturnAdapter {
  readonly ownerBinding: string;
  // null means no matching item was found in a complete, authoritative readback.
  findReceipt(envelope: ReturnEnvelope): Promise<AdapterReceipt | null>;
  send(envelope: ReturnEnvelope): Promise<AdapterReceipt>;
}

export type DispatchAuthority = {
  resolveOrigin(originId: string): Promise<RegisteredOrigin | null>;
  verifyLease(lease: z.infer<typeof leaseSchema>): Promise<boolean>;
  verifyClear(authorizationRef: string): Promise<boolean>;
};

export async function dispatchReturn(input: {
  returnId: string; workerId: string; store: ReturnStore;
  authority: DispatchAuthority; adapter: ReturnAdapter; now?: () => Date;
}): Promise<ReturnRecord> {
  const { store, returnId, workerId, authority, adapter } = input;
  const claim = await store.claim(returnId, workerId);
  if (!claim) throw new Error('return_not_claimable');
  const envelope = returnSchema.parse(claim.record.envelope);
  const move = (state: ReturnState, evidence: { itemId?: string; receiptDigest?: string; reason?: string }) =>
    store.transition(returnId, workerId, claim.claimToken, state, evidence);
  const reject = (reason: string) => move('AUTHORIZATION_REJECTED', { reason });
  if ((input.now ?? (() => new Date()))().getTime() >= Date.parse(envelope.expiresAt)) {
    return move('DEAD_LETTERED', { reason: 'return_expired' });
  }
  const current = await authority.resolveOrigin(envelope.origin.originId);
  if (!current || Object.entries(envelope.origin).some(([key, value]) =>
    current[key as keyof RegisteredOrigin] !== value)) {
    return reject('origin_binding_changed');
  }
  if (adapter.ownerBinding !== envelope.origin.ownerBinding) return reject('owner_binding_mismatch');
  if (!await authority.verifyLease(envelope.lease)) return reject('lease_invalid');
  if (!await authority.verifyClear(envelope.authorizationRef)) return reject('clear_invalid');
  if (envelope.adapter !== 'openai_api' || envelope.origin.surface !== 'openai_api') {
    return move('DESTINATION_UNAVAILABLE', { reason: 'api_adapter_incompatible' });
  }

  // A prior process may have sent the item and died before saving its receipt.
  // Never submit another item until a complete readback has ruled out that case.
  try {
    const prior = await adapter.findReceipt(envelope);
    if (prior) return move('RECEIPT_VERIFIED', prior);
  } catch {
    return move('DELIVERY_UNCERTAIN', { reason: 'preflight_readback_failed' });
  }
  if (claim.fromState === 'DELIVERY_UNCERTAIN') {
    return move('DELIVERY_UNCERTAIN', { reason: 'no_receipt_after_ambiguous_send' });
  }
  try {
    const receipt = await adapter.send(envelope);
    return move('RECEIPT_VERIFIED', receipt);
  } catch {
    return move('DELIVERY_UNCERTAIN', { reason: 'send_or_readback_ambiguous' });
  }
}
