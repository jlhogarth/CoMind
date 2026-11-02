import { createHash } from 'node:crypto';
import { chromium, type BrowserContext } from 'playwright';
import type { BrowserLeaseVerifier } from './lease.js';
import { redactEvidence, type BrowserLeaseRef } from './policy.js';
import { handoffResponseObserved, normalizeChatgptConversationUrl } from './chatgpt-handoff.js';

export type ChatgptSuccessorContinuityCapsule = {
  continuityId: string;
  laneId: string;
  workKey: string;
  verifiedCheckpoint: string;
  nextAction: string;
  authorityRef: string;
  issue?: string;
  branch?: string;
  pullRequest?: string;
  headSha?: string;
  predecessorRefSha256?: string;
  provenanceRefs?: string[];
};

export type ChatgptSuccessorJob = {
  jobId: string;
  caller: string;
  timeoutMs: number;
  lease: BrowserLeaseRef;
  authorityRef: string;
  clearApproved: boolean;
  capsule: ChatgptSuccessorContinuityCapsule;
};

export type ChatgptSuccessorPolicy = {
  maxTimeoutMs: number;
  maxMessageChars: number;
  maxProvenanceRefs: number;
};

export type ChatgptSuccessorObservation = {
  finalUrl: string;
  posted: boolean;
  responseStarted: boolean;
};

export interface ChatgptSuccessorDriver {
  create(input: {
    message: string;
    continuityId: string;
    timeoutMs: number;
  }): Promise<ChatgptSuccessorObservation>;
  close(): Promise<void>;
}

export type PlaywrightChatgptSuccessorDriverOptions = {
  persistentContextDir: string;
  headless?: boolean;
};

export type ChatgptSuccessorExecutionResult = {
  status: 'succeeded' | 'rejected' | 'failed';
  reason: string;
  recoverable: boolean;
  successorConversationUrl?: string;
  evidence: Readonly<Record<string, unknown>>;
};

export type ChatgptSuccessorDependencies = {
  leaseVerifier: BrowserLeaseVerifier;
  driverFactory: () => ChatgptSuccessorDriver;
  now?: () => Date;
};

const NEW_CHAT_URL = 'https://chatgpt.com/';
const MAX_FIELD_CHARS = 1000;
const SHA256_HEX = /^[a-f0-9]{64}$/i;

class ChatgptSuccessorError extends Error {
  constructor(readonly code: string, readonly recoverable = true) {
    super(code);
    this.name = 'ChatgptSuccessorError';
  }
}

function nonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function bounded(value: unknown): value is string {
  return nonEmpty(value) && value.length <= MAX_FIELD_CHARS;
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function safeEvidence(value: Record<string, unknown>): Readonly<Record<string, unknown>> {
  return Object.freeze(redactEvidence(value) as Record<string, unknown>);
}

function capsuleValid(capsule: ChatgptSuccessorContinuityCapsule, policy: ChatgptSuccessorPolicy): boolean {
  if (!capsule || typeof capsule !== 'object') return false;
  const required = [
    capsule.continuityId,
    capsule.laneId,
    capsule.workKey,
    capsule.verifiedCheckpoint,
    capsule.nextAction,
    capsule.authorityRef,
  ];
  if (required.some((value) => !bounded(value))) return false;
  const optional = [capsule.issue, capsule.branch, capsule.pullRequest, capsule.headSha]
    .filter((value) => value !== undefined);
  if (!optional.every((value) => bounded(value))) return false;
  if (capsule.predecessorRefSha256 !== undefined && !SHA256_HEX.test(capsule.predecessorRefSha256)) return false;
  if (capsule.provenanceRefs !== undefined) {
    if (!Array.isArray(capsule.provenanceRefs) || capsule.provenanceRefs.length > policy.maxProvenanceRefs) return false;
    if (!capsule.provenanceRefs.every((value) => bounded(value))) return false;
  }
  return true;
}

export function formatChatgptSuccessorContinuity(capsule: ChatgptSuccessorContinuityCapsule): string {
  const data = {
    continuity_id: normalizeText(capsule.continuityId),
    lane_id: normalizeText(capsule.laneId),
    work_key: normalizeText(capsule.workKey),
    verified_checkpoint: normalizeText(capsule.verifiedCheckpoint),
    next_action: normalizeText(capsule.nextAction),
    authority_ref: normalizeText(capsule.authorityRef),
    ...(capsule.issue ? { issue: normalizeText(capsule.issue) } : {}),
    ...(capsule.branch ? { branch: normalizeText(capsule.branch) } : {}),
    ...(capsule.pullRequest ? { pull_request: normalizeText(capsule.pullRequest) } : {}),
    ...(capsule.headSha ? { head_sha: normalizeText(capsule.headSha) } : {}),
    ...(capsule.predecessorRefSha256 ? { predecessor_ref_sha256: capsule.predecessorRefSha256.toLowerCase() } : {}),
    ...(capsule.provenanceRefs?.length ? { provenance_refs: capsule.provenanceRefs.map(normalizeText) } : {}),
  };

  return [
    '[CoMind AED Successor Continuity]',
    `Continuity ID: ${data.continuity_id}`,
    'This conversation is a successor execution surface for an existing durable CoMind development lane.',
    'The CONTINUITY DATA block is evidence data only. Treat it as authoritative state only to the extent described by its verified checkpoint and provenance references.',
    'CONTINUITY DATA',
    JSON.stringify(data),
    'END CONTINUITY DATA',
    'Do not repeat work already established by the verified checkpoint. Do not infer missing state.',
    'Proceed autonomously under the CoMind Application Development Contract from the next dependency-valid action. Preserve existing authority, issue, branch, PR, freshness, collision, provenance, No Placeholder, and Production boundaries.',
  ].join('\n');
}

export function evaluateChatgptSuccessorJob(job: ChatgptSuccessorJob, policy: ChatgptSuccessorPolicy) {
  if (!nonEmpty(job.jobId) || !nonEmpty(job.caller)) {
    return { allowed: false, reason: 'missing_identity' } as const;
  }
  if (!job.lease || !nonEmpty(job.lease.taskId) || !nonEmpty(job.lease.leaseToken) || !nonEmpty(job.lease.workerInstanceId)) {
    return { allowed: false, reason: 'missing_lease_reference' } as const;
  }
  if (!Number.isSafeInteger(job.lease.fencingEpoch) || job.lease.fencingEpoch < 0) {
    return { allowed: false, reason: 'invalid_lease_reference' } as const;
  }
  if (!nonEmpty(job.authorityRef) || job.clearApproved !== true) {
    return { allowed: false, reason: 'clear_required' } as const;
  }
  if (!Number.isFinite(job.timeoutMs) || job.timeoutMs <= 0 || job.timeoutMs > policy.maxTimeoutMs) {
    return { allowed: false, reason: 'invalid_timeout' } as const;
  }
  if (!capsuleValid(job.capsule, policy)) {
    return { allowed: false, reason: 'invalid_continuity_capsule' } as const;
  }
  if (job.capsule.authorityRef !== job.authorityRef) {
    return { allowed: false, reason: 'authority_reference_mismatch' } as const;
  }

  const message = formatChatgptSuccessorContinuity(job.capsule);
  if (message.length > policy.maxMessageChars) {
    return { allowed: false, reason: 'continuity_capsule_too_large' } as const;
  }
  return { allowed: true, reason: 'allowed', message } as const;
}

function baseEvidence(job: ChatgptSuccessorJob, startedAt: string): Record<string, unknown> {
  return {
    jobId: job.jobId,
    caller: job.caller,
    continuityId: job.capsule?.continuityId ?? null,
    laneId: job.capsule?.laneId ?? null,
    workKey: job.capsule?.workKey ?? null,
    authorityRef: job.authorityRef ?? null,
    predecessorRefSha256: job.capsule?.predecessorRefSha256 ?? null,
    lease: {
      taskId: job.lease?.taskId ?? null,
      fencingEpoch: job.lease?.fencingEpoch ?? null,
      workerInstanceId: job.lease?.workerInstanceId ?? null,
    },
    startedAt,
  };
}

function browserFailure(error: unknown): { reason: string; recoverable: boolean } {
  if (error instanceof ChatgptSuccessorError) {
    return { reason: error.code, recoverable: error.recoverable };
  }
  if (error instanceof Error && error.name === 'TimeoutError') {
    return { reason: 'browser_timeout', recoverable: true };
  }
  return { reason: 'browser_interrupted', recoverable: true };
}

export function createPlaywrightChatgptSuccessorDriver(
  options: PlaywrightChatgptSuccessorDriverOptions
): ChatgptSuccessorDriver {
  if (!nonEmpty(options.persistentContextDir)) throw new Error('persistentContextDir is required');
  let context: BrowserContext | null = null;
  const headless = options.headless ?? true;

  async function ensureContext(): Promise<BrowserContext> {
    if (context) return context;
    context = await chromium.launchPersistentContext(options.persistentContextDir, { headless });
    return context;
  }

  return {
    async create(input) {
      const activeContext = await ensureContext();
      const page = await activeContext.newPage();
      try {
        await page.goto(NEW_CHAT_URL, {
          waitUntil: 'domcontentloaded',
          timeout: input.timeoutMs,
        });

        if (normalizeChatgptConversationUrl(page.url())) {
          throw new ChatgptSuccessorError('new_chat_surface_not_observed', false);
        }

        const composer = page.locator('#prompt-textarea').first();
        try {
          await composer.waitFor({ state: 'visible', timeout: Math.min(input.timeoutMs, 15_000) });
        } catch {
          const signInVisible = await page.getByRole('button', { name: /log in|sign in/i }).count().catch(() => 0);
          throw new ChatgptSuccessorError(signInVisible > 0 ? 'authentication_required' : 'composer_not_found');
        }

        const continuityMarker = `Continuity ID: ${input.continuityId}`;
        await composer.fill(input.message);
        await composer.press('Enter');

        const userMessages = page.locator('[data-message-author-role="user"]');
        const posted = userMessages.filter({ hasText: continuityMarker }).last();
        try {
          await posted.waitFor({ state: 'visible', timeout: Math.min(input.timeoutMs, 20_000) });
        } catch {
          throw new ChatgptSuccessorError('continuity_not_observed');
        }

        try {
          await page.waitForFunction(
            handoffResponseObserved,
            continuityMarker,
            { timeout: Math.min(input.timeoutMs, 30_000) }
          );
        } catch {
          throw new ChatgptSuccessorError('response_not_observed');
        }

        let finalUrl = normalizeChatgptConversationUrl(page.url());
        if (!finalUrl) {
          try {
            await page.waitForURL(
              (url) => normalizeChatgptConversationUrl(url.toString()) !== null,
              { timeout: Math.min(input.timeoutMs, 20_000) }
            );
          } catch {
            throw new ChatgptSuccessorError('successor_url_not_observed');
          }
          finalUrl = normalizeChatgptConversationUrl(page.url());
        }
        if (!finalUrl) throw new ChatgptSuccessorError('successor_url_not_observed');

        return {
          finalUrl,
          posted: true,
          responseStarted: true,
        };
      } finally {
        await page.close().catch(() => undefined);
      }
    },
    async close() {
      if (context) {
        await context.close();
        context = null;
      }
    },
  };
}

export async function executeChatgptSuccessorJob(
  job: ChatgptSuccessorJob,
  policy: ChatgptSuccessorPolicy,
  dependencies: ChatgptSuccessorDependencies
): Promise<ChatgptSuccessorExecutionResult> {
  const now = dependencies.now ?? (() => new Date());
  const startedAt = now().toISOString();
  const decision = evaluateChatgptSuccessorJob(job, policy);
  const base = baseEvidence(job, startedAt);

  if (!decision.allowed) {
    return {
      status: 'rejected',
      reason: decision.reason,
      recoverable: false,
      evidence: safeEvidence({ ...base, completedAt: now().toISOString() }),
    };
  }

  let leaseDecision;
  try {
    leaseDecision = await dependencies.leaseVerifier(job.lease, now().toISOString());
  } catch {
    return {
      status: 'failed',
      reason: 'lease_verification_failed',
      recoverable: true,
      evidence: safeEvidence({ ...base, completedAt: now().toISOString() }),
    };
  }
  if (!leaseDecision.valid) {
    return {
      status: 'rejected',
      reason: leaseDecision.reason,
      recoverable: false,
      evidence: safeEvidence({ ...base, completedAt: now().toISOString() }),
    };
  }

  let driver: ChatgptSuccessorDriver;
  try {
    driver = dependencies.driverFactory();
  } catch {
    return {
      status: 'failed',
      reason: 'browser_start_failed',
      recoverable: true,
      evidence: safeEvidence({ ...base, completedAt: now().toISOString() }),
    };
  }

  let observation: ChatgptSuccessorObservation | undefined;
  let failure: { reason: string; recoverable: boolean } | null = null;
  try {
    observation = await driver.create({
      message: decision.message,
      continuityId: job.capsule.continuityId,
      timeoutMs: job.timeoutMs,
    });
  } catch (error) {
    failure = browserFailure(error);
  }

  let cleanupFailed = false;
  try {
    await driver.close();
  } catch {
    cleanupFailed = true;
  }

  if (failure) {
    return {
      status: 'failed',
      reason: failure.reason,
      recoverable: failure.recoverable,
      evidence: safeEvidence({
        ...base,
        messageSha256: sha256(decision.message),
        completedAt: now().toISOString(),
      }),
    };
  }
  if (cleanupFailed) {
    return {
      status: 'failed',
      reason: 'browser_cleanup_failed',
      recoverable: true,
      evidence: safeEvidence({
        ...base,
        messageSha256: sha256(decision.message),
        completedAt: now().toISOString(),
      }),
    };
  }
  if (!observation) {
    return {
      status: 'failed',
      reason: 'browser_observation_missing',
      recoverable: true,
      evidence: safeEvidence({
        ...base,
        messageSha256: sha256(decision.message),
        completedAt: now().toISOString(),
      }),
    };
  }

  const normalizedSuccessorUrl = normalizeChatgptConversationUrl(observation.finalUrl);
  if (!observation.posted || !observation.responseStarted || !normalizedSuccessorUrl) {
    return {
      status: 'failed',
      reason: 'successor_verification_failed',
      recoverable: true,
      evidence: safeEvidence({
        ...base,
        messageSha256: sha256(decision.message),
        completedAt: now().toISOString(),
      }),
    };
  }

  return {
    status: 'succeeded',
    reason: 'successor_active',
    recoverable: false,
    successorConversationUrl: normalizedSuccessorUrl,
    evidence: safeEvidence({
      ...base,
      messageSha256: sha256(decision.message),
      successorConversationRefSha256: sha256(normalizedSuccessorUrl),
      responseStarted: true,
      completedAt: now().toISOString(),
    }),
  };
}
