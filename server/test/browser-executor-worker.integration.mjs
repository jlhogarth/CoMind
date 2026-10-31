import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPlaywrightDriver, executeBrowserJob } from '../dist/browser-executor/worker.js';

const targetUrl = process.env.CBE_TARGET_URL ?? 'https://playwright.dev/';
const expectedTitle = process.env.CBE_EXPECT_TITLE ?? 'Playwright';
const target = new URL(targetUrl);
const persistentContextDir = await mkdtemp(join(tmpdir(), 'comind-cbe-001-'));

try {
  const result = await executeBrowserJob(
    {
      jobId: randomUUID(),
      caller: 'cbe-001-github-actions-test',
      targetUrl,
      actions: ['navigate', 'read', 'screenshot'],
      timeoutMs: 30_000,
      lease: {
        taskId: randomUUID(),
        leaseToken: randomUUID(),
        fencingEpoch: 1,
        workerInstanceId: 'cbe-001-github-actions-worker',
      },
      expectedResult: {
        requireOkResponse: true,
        finalHost: target.hostname,
        titleIncludes: expectedTitle,
      },
      authorityRef: 'L4A-CBE-001-Test',
    },
    { allowedHosts: [target.hostname], maxTimeoutMs: 60_000 },
    {
      leaseVerifier: async () => ({ valid: true }),
      driverFactory: () => createPlaywrightDriver({ headless: true, persistentContextDir }),
    }
  );
  assert.equal(result.status, 'succeeded', JSON.stringify(result));
  const serialized = JSON.stringify(result.evidence);
  assert.equal(serialized.includes('leaseToken'), false);
  assert.match(serialized, /screenshot/);
  console.log(JSON.stringify(result));
} finally {
  await rm(persistentContextDir, { recursive: true, force: true });
}
