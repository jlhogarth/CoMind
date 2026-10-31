export type BrowserAction = 'navigate' | 'read' | 'click' | 'type' | 'download' | 'upload';

export type BrowserJob = {
  jobId: string;
  caller: string;
  targetUrl: string;
  actions: BrowserAction[];
  timeoutMs: number;
  leaseId: string;
  authorityRef?: string;
  clearApproved?: boolean;
};

export type BrowserPolicy = {
  allowedHosts: readonly string[];
  maxTimeoutMs: number;
};

const MUTATING_ACTIONS = new Set<BrowserAction>(['click', 'type', 'download', 'upload']);

export function evaluateBrowserJob(job: BrowserJob, policy: BrowserPolicy) {
  if (!job.jobId || !job.caller || !job.leaseId) return { allowed: false, reason: 'missing_identity' } as const;
  if (!Number.isFinite(job.timeoutMs) || job.timeoutMs <= 0 || job.timeoutMs > policy.maxTimeoutMs) {
    return { allowed: false, reason: 'invalid_timeout' } as const;
  }

  let url: URL;
  try { url = new URL(job.targetUrl); } catch { return { allowed: false, reason: 'invalid_url' } as const; }
  if (url.protocol !== 'https:') return { allowed: false, reason: 'https_required' } as const;
  if (!policy.allowedHosts.includes(url.hostname)) return { allowed: false, reason: 'host_not_allowed' } as const;

  const consequential = job.actions.some((action) => MUTATING_ACTIONS.has(action));
  if (consequential && (!job.authorityRef || job.clearApproved !== true)) {
    return { allowed: false, reason: 'clear_required' } as const;
  }
  return { allowed: true, reason: 'allowed', consequential } as const;
}

const SECRET_KEY = /(cookie|authorization|password|token|secret|storageState|mfa)/i;

export function redactEvidence(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactEvidence);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [
      key,
      SECRET_KEY.test(key) ? '[REDACTED]' : redactEvidence(item),
    ]));
  }
  return value;
}
