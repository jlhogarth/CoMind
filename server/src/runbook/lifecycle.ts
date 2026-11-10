import { z } from 'zod';

const identifier = z.string().regex(/^[A-Za-z0-9_.-]{1,160}$/);
const instant = z.iso.datetime({ precision: 3 });
const evidenceRef = z.string().trim().min(1).max(300);
const retentionClasses = ['consequential', 'routine', 'unknown'] as const;
type ReceivedObservation = { snapshot: unknown; plan?: unknown; retention?: unknown };

export const runbookLifecyclePolicy = {
  version: 1,
  owner: 'CoMind RunBook operations',
  reviewUnits: 300_000,
  escalationUnits: 750_000,
  rules: {
    measurement: 'DRB-LIFECYCLE-001',
    freshness: 'DRB-LIFECYCLE-002',
    rollover: 'DRB-LIFECYCLE-003',
    retention: 'DRB-LIFECYCLE-004',
  },
} as const;

const slotSchema = z.object({ volumeId: identifier, scheduledFor: instant });
export type LifecycleSlot = z.infer<typeof slotSchema>;

const snapshotSchema = z.object({
  documentId: identifier,
  revisionId: z.string().min(1).max(512).optional(),
  tabs: z.array(z.object({
    tabId: identifier,
    body: z.object({
      content: z.array(z.object({ endIndex: z.number().int().positive() })).min(1),
    }),
  })).min(1).max(100),
});

const planSchema = z.object({
  documentId: identifier,
  reviewedRevisionId: z.string().min(1).max(512),
  milestoneEvidence: evidenceRef,
  archiveEvidence: evidenceRef,
  handoffEvidence: evidenceRef,
  writerInventoryEvidence: evidenceRef,
  writers: z.array(z.object({ id: identifier, status: z.enum(['verified', 'unverified']) })),
});

const retentionSchema = z.object({
  classification: z.enum(retentionClasses),
  hold: z.enum(['clear', 'active', 'unknown']),
  eligibleAfter: instant,
  replacementEvidence: evidenceRef,
});

export function assessRetention(input: unknown, checkedAt: string) {
  const now = instant.parse(checkedAt);
  const record = retentionSchema.safeParse(input);
  if (!record.success) return 'blocked_missing_retention_evidence';
  if (record.data.classification !== 'routine') return 'blocked_protected_or_unknown_class';
  if (record.data.hold !== 'clear') return 'blocked_hold';
  if (record.data.eligibleAfter > now) return 'blocked_retention_window';
  return 'candidate_for_review';
}

export function evaluateLifecycle(
  slot: LifecycleSlot,
  checkedAt: string,
  observation: { kind: 'unavailable' } | ({ kind: 'received' } & ReceivedObservation),
) {
  const key = slotSchema.parse(slot);
  const now = instant.parse(checkedAt);
  if (now < key.scheduledFor) throw new Error('A lifecycle check cannot precede its scheduled slot');
  const snapshot = observation.kind === 'received' ? snapshotSchema.safeParse(observation.snapshot) : null;
  const tabs = snapshot?.success && snapshot.data.documentId === key.volumeId ? snapshot.data.tabs : [];
  const validTabs = tabs.length === new Set(tabs.map((tab) => tab.tabId)).size
    && tabs.every(({ body }) => body.content.every(({ endIndex }, i) =>
      i === 0 || endIndex > body.content[i - 1].endIndex));
  const indexedUnits = tabs.length && validTabs
    ? tabs.reduce((sum, tab) => sum + tab.body.content.at(-1)!.endIndex - 1, 0)
    : null;
  const approximateUtf16Units = indexedUnits !== null && Number.isSafeInteger(indexedUnits)
    ? indexedUnits
    : null;
  const size = approximateUtf16Units === null
    ? (observation.kind === 'unavailable' ? 'unavailable' : 'invalid')
    : approximateUtf16Units >= runbookLifecyclePolicy.escalationUnits
      ? 'escalation'
      : approximateUtf16Units >= runbookLifecyclePolicy.reviewUnits ? 'review' : 'below_review';

  const plan = observation.kind === 'received' ? planSchema.safeParse(observation.plan) : null;
  const blockers: string[] = [];
  if (size === 'unavailable' || size === 'invalid') blockers.push('measurement_unverified');
  if (snapshot?.success && !snapshot.data.revisionId) blockers.push('revision_unverified');
  if (!plan?.success) {
    blockers.push('rollover_evidence_incomplete');
  } else {
    if (plan.data.documentId !== key.volumeId || (snapshot?.success
      && (snapshot.data.documentId !== key.volumeId || (snapshot.data.revisionId
        && plan.data.reviewedRevisionId !== snapshot.data.revisionId)))) {
      blockers.push('reviewed_revision_mismatch');
    }
    if (plan.data.writers.some((writer) => writer.status !== 'verified')
      || new Set(plan.data.writers.map((writer) => writer.id)).size !== plan.data.writers.length) {
      blockers.push('writer_inventory_unverified');
    }
  }

  const retention = observation.kind === 'received' && observation.retention !== undefined
    ? z.array(z.unknown()).max(100).safeParse(observation.retention)
    : null;

  return {
    ...key,
    checkedAt: now,
    policyVersion: runbookLifecyclePolicy.version,
    approximateUtf16Units,
    size,
    rollover: blockers.length ? 'blocked' as const : 'ready_for_review' as const,
    blockers,
    retention: retention?.success ? {
      status: 'evaluated' as const,
      dispositions: retention.data.map((entry) => assessRetention(entry, now)),
    } : { status: retention ? 'invalid' as const : 'not_provided' as const },
    evidence: !blockers.length && plan?.success ? {
      revisionId: plan.data.reviewedRevisionId,
      milestone: plan.data.milestoneEvidence,
      archive: plan.data.archiveEvidence,
      handoff: plan.data.handoffEvidence,
      writerInventory: plan.data.writerInventoryEvidence,
    } : null,
  };
}

export type LifecycleEvaluation = ReturnType<typeof evaluateLifecycle>;
export type LifecycleReceipt = { eventId: string; evaluation: LifecycleEvaluation };

export interface LifecycleLedger {
  find(slot: LifecycleSlot): Promise<LifecycleReceipt | null>;
  record(evaluation: LifecycleEvaluation): Promise<LifecycleReceipt>;
}

export async function runLifecycleCheck(
  slot: LifecycleSlot,
  ledger: LifecycleLedger,
  read: () => Promise<ReceivedObservation>,
  clock: () => string = () => new Date().toISOString(),
): Promise<LifecycleReceipt> {
  const key = slotSchema.parse(slot);
  const existing = await ledger.find(key);
  if (existing) return existing;
  let observation: Parameters<typeof evaluateLifecycle>[2];
  try {
    observation = { kind: 'received', ...await read() };
  } catch {
    observation = { kind: 'unavailable' };
  }
  return ledger.record(evaluateLifecycle(key, clock(), observation));
}

// This reader can run independently of the evaluator. The caller supplies the last due slot.
export async function readLifecycleFreshness(slot: LifecycleSlot, ledger: Pick<LifecycleLedger, 'find'>) {
  const receipt = await ledger.find(slotSchema.parse(slot));
  if (!receipt) return { status: 'missed' as const, receipt };
  if (receipt.evaluation.policyVersion !== runbookLifecyclePolicy.version) {
    return { status: 'policy_changed' as const, receipt };
  }
  const size = receipt.evaluation.size;
  const status = size === 'below_review' || size === 'review' || size === 'escalation'
    ? 'current' as const : 'measurement_failed' as const;
  return { status, receipt };
}
