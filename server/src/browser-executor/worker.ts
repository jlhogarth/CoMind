import { createHash } from 'node:crypto';
import { chromium, type Browser, type BrowserContext } from 'playwright';
import type { BrowserLeaseVerifier } from './lease.js';
import {
  evaluateBrowserJob,
  redactEvidence,
  type BrowserExpectedResult,
  type BrowserJob,
  type BrowserPolicy,
} from './policy.js';

export type BrowserScreenshotEvidence = {
  sha256: string;
  byteLength: number;
};

export type BrowserNavigationObservation = {
  finalUrl: string;
  title: string;
  statusCode: number | null;
  ok: boolean | null;
  screenshot?: BrowserScreenshotEvidence;
  metrics?: { contextStartupMs: number; navigationMs: number; titleBytes: number; screenshotBytes: number; modelRequests: 0 };
};

export interface BrowserDriver {
  navigate(input: {
    targetUrl: string;
    timeoutMs: number;
    captureScreenshot: boolean;
  }): Promise<BrowserNavigationObservation>;
  close(): Promise<void>;
}

export type PlaywrightDriverOptions = {
  headless?: boolean;
  persistentContextDir?: string;
};

export type BrowserExecutionResult = {
  status: 'succeeded' | 'rejected' | 'failed';
  reason: string;
  recoverable: boolean;
  evidence: Readonly<Record<string, unknown>>;
};

export type BrowserWorkerDependencies = {
  leaseVerifier: BrowserLeaseVerifier;
  driverFactory: () => BrowserDriver;
  now?: () => Date;
};

const EXECUTABLE_ACTIONS = new Set(['navigate', 'read', 'screenshot']);

function safeEvidence(value: Record<string, unknown>): Readonly<Record<string, unknown>> {
  return Object.freeze(redactEvidence(value) as Record<string, unknown>);
}

function baseEvidence(job: BrowserJob, startedAt: string): Record<string, unknown> {
  return {
    jobId: job.jobId,
    caller: job.caller,
    targetUrl: job.targetUrl,
    actions: [...job.actions],
    expectedResult: { ...job.expectedResult },
    authorityRef: job.authorityRef ?? null,
    lease: {
      taskId: job.lease.taskId,
      fencingEpoch: job.lease.fencingEpoch,
      workerInstanceId: job.lease.workerInstanceId,
    },
    startedAt,
  };
}

function expectedMismatch(
  observation: BrowserNavigationObservation,
  expected: BrowserExpectedResult
): string | null {
  if (expected.requireOkResponse === true && observation.ok !== true) {
    return 'expected_http_ok_not_met';
  }
  if (expected.finalHost) {
    let host: string;
    try {
      host = new URL(observation.finalUrl).hostname;
    } catch {
      return 'final_url_invalid';
    }
    if (host !== expected.finalHost) return 'expected_final_host_not_met';
  }
  if (
    expected.titleIncludes
    && !observation.title.toLowerCase().includes(expected.titleIncludes.toLowerCase())
  ) {
    return 'expected_title_not_met';
  }
  return null;
}

function browserFailureReason(error: unknown): string {
  return error instanceof Error && error.name === 'TimeoutError'
    ? 'browser_timeout'
    : 'browser_interrupted';
}

export function createPlaywrightDriver(options: PlaywrightDriverOptions = {}): BrowserDriver {
  let browser: Browser | null = null;
  let context: BrowserContext | null = null;
  const headless = options.headless ?? true;

  async function ensureContext(): Promise<BrowserContext> {
    if (context) return context;
    if (options.persistentContextDir) {
      context = await chromium.launchPersistentContext(options.persistentContextDir, { headless });
      return context;
    }
    browser = await chromium.launch({ headless });
    context = await browser.newContext();
    return context;
  }

  return {
    async navigate(input) {
      const contextStart = performance.now();
      const activeContext = await ensureContext();
      const contextStartupMs = Math.round(performance.now() - contextStart);
      const page = await activeContext.newPage();
      try {
        const navigationStart = performance.now();
        const response = await page.goto(input.targetUrl, {
          waitUntil: 'domcontentloaded',
          timeout: input.timeoutMs,
        });
        const navigationMs = Math.round(performance.now() - navigationStart);
        const title = await page.title();
        const screenshot = input.captureScreenshot
          ? await page.screenshot({ type: 'png' })
          : null;
        return {
          finalUrl: page.url(),
          title,
          metrics: { contextStartupMs, navigationMs, titleBytes: Buffer.byteLength(title, 'utf8'), screenshotBytes: screenshot?.byteLength ?? 0, modelRequests: 0 },
          statusCode: response?.status() ?? null,
          ok: response?.ok() ?? null,
          ...(screenshot
            ? {
                screenshot: {
                  sha256: createHash('sha256').update(screenshot).digest('hex'),
                  byteLength: screenshot.byteLength,
                },
              }
            : {}),
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
      if (browser) {
        await browser.close();
        browser = null;
      }
    },
  };
}

export async function executeBrowserJob(
  job: BrowserJob,
  policy: BrowserPolicy,
  dependencies: BrowserWorkerDependencies
): Promise<BrowserExecutionResult> {
  const now = dependencies.now ?? (() => new Date());
  const startedAt = now().toISOString();
  const base = baseEvidence(job, startedAt);
  const policyDecision = evaluateBrowserJob(job, policy);
  if (!policyDecision.allowed) {
    return {
      status: 'rejected',
      reason: policyDecision.reason,
      recoverable: false,
      evidence: safeEvidence({ ...base, completedAt: now().toISOString() }),
    };
  }

  if (job.actions.some((action) => !EXECUTABLE_ACTIONS.has(action))) {
    return {
      status: 'rejected',
      reason: 'action_not_bound_cbe_001',
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

  let driver: BrowserDriver;
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

  let observation: BrowserNavigationObservation | undefined;
  let executionFailure: string | null = null;
  try {
    observation = await driver.navigate({
      targetUrl: job.targetUrl,
      timeoutMs: job.timeoutMs,
      captureScreenshot: job.actions.includes('screenshot'),
    });
  } catch (error) {
    executionFailure = browserFailureReason(error);
  }

  let cleanupFailed = false;
  try {
    await driver.close();
  } catch {
    cleanupFailed = true;
  }

  if (executionFailure) {
    return {
      status: 'failed',
      reason: executionFailure,
      recoverable: true,
      evidence: safeEvidence({ ...base, completedAt: now().toISOString() }),
    };
  }
  if (cleanupFailed) {
    return {
      status: 'failed',
      reason: 'browser_cleanup_failed',
      recoverable: true,
      evidence: safeEvidence({
        ...base,
        response: observation,
        completedAt: now().toISOString(),
      }),
    };
  }
  if (!observation) {
    return {
      status: 'failed',
      reason: 'browser_observation_missing',
      recoverable: true,
      evidence: safeEvidence({ ...base, completedAt: now().toISOString() }),
    };
  }

  const mismatch = expectedMismatch(observation, job.expectedResult);
  if (mismatch) {
    return {
      status: 'failed',
      reason: mismatch,
      recoverable: false,
      evidence: safeEvidence({
        ...base,
        response: observation,
        completedAt: now().toISOString(),
      }),
    };
  }

  return {
    status: 'succeeded',
    reason: 'completed',
    recoverable: false,
    evidence: safeEvidence({
      ...base,
      response: observation,
      completedAt: now().toISOString(),
    }),
  };
}
