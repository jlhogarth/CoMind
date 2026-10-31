export type BrowserAction =
  | 'navigate'
  | 'read'
  | 'screenshot'
  | 'click'
  | 'type'
  | 'download'
  | 'upload';

export type BrowserExpectedResult = {
  requireOkResponse?: boolean;
  finalHost?: string;
  titleIncludes?: string;
};

export type BrowserLeaseRef = {
  taskId: string;
  leaseToken: string;
  fencingEpoch: number;
  workerInstanceId: string;
};

export type BrowserJob = {
  jobId: string;
  caller: string;
  targetUrl: string;
  actions: BrowserAction[];
  timeoutMs: number;
  lease: BrowserLeaseRef;
  expectedResult: BrowserExpectedResult;
  authorityRef?: string;
  clearApproved?: boolean;
};

export type BrowserPolicy = {
  allowedHosts: readonly string[];
  maxTimeoutMs: number;
};

const KNOWN_ACTIONS = new Set<string>([
  'navigate',
  'read',
  'screenshot',
  'click',
  'type',
  'download',
  'upload',
]);
const MUTATING_ACTIONS = new Set<BrowserAction>(['click', 'type', 'download', 'upload']);
const SECRET_KEY = /(cookie|authorization|password|token|secret|storageState|mfa)/i;
const URL_KEY = /(?:url|uri)$/i;

function nonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function evaluateBrowserJob(job: BrowserJob, policy: BrowserPolicy) {
  if (!nonEmpty(job.jobId) || !nonEmpty(job.caller)) {
    return { allowed: false, reason: 'missing_identity' } as const;
  }
  if (
    !job.lease
    || !nonEmpty(job.lease.taskId)
    || !nonEmpty(job.lease.leaseToken)
    || !nonEmpty(job.lease.workerInstanceId)
  ) {
    return { allowed: false, reason: 'missing_lease_reference' } as const;
  }
  if (!Number.isSafeInteger(job.lease.fencingEpoch) || job.lease.fencingEpoch < 0) {
    return { allowed: false, reason: 'invalid_lease_reference' } as const;
  }
  if (!Array.isArray(job.actions) || job.actions.length === 0 || job.actions.some((action) => !KNOWN_ACTIONS.has(action))) {
    return { allowed: false, reason: 'invalid_actions' } as const;
  }
  if (!job.expectedResult || typeof job.expectedResult !== 'object' || Array.isArray(job.expectedResult)) {
    return { allowed: false, reason: 'expected_result_required' } as const;
  }
  if (!Number.isFinite(job.timeoutMs) || job.timeoutMs <= 0 || job.timeoutMs > policy.maxTimeoutMs) {
    return { allowed: false, reason: 'invalid_timeout' } as const;
  }

  let url: URL;
  try {
    url = new URL(job.targetUrl);
  } catch {
    return { allowed: false, reason: 'invalid_url' } as const;
  }
  if (url.protocol !== 'https:') return { allowed: false, reason: 'https_required' } as const;
  if (url.username || url.password) return { allowed: false, reason: 'embedded_credentials_forbidden' } as const;
  if (!policy.allowedHosts.includes(url.hostname)) return { allowed: false, reason: 'host_not_allowed' } as const;

  const consequential = job.actions.some((action) => MUTATING_ACTIONS.has(action));
  if (consequential && (!nonEmpty(job.authorityRef) || job.clearApproved !== true)) {
    return { allowed: false, reason: 'clear_required' } as const;
  }
  return { allowed: true, reason: 'allowed', consequential } as const;
}

export function sanitizeEvidenceUrl(value: string): string {
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return value;
    url.username = '';
    url.password = '';
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    return value;
  }
}

export function redactEvidence(value: unknown, keyHint = ''): unknown {
  if (SECRET_KEY.test(keyHint)) return '[REDACTED]';
  if (Array.isArray(value)) return value.map((item) => redactEvidence(item));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, redactEvidence(item, key)])
    );
  }
  if (typeof value === 'string' && URL_KEY.test(keyHint)) return sanitizeEvidenceUrl(value);
  return value;
}
