import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createPlaywrightDriver, executeBrowserJob } from '../dist/browser-executor/worker.js';

const repositoryRoot = path.resolve(process.cwd(), '..');
const profileDir = process.env.CBE_PROFILE_DIR?.trim();
if (!profileDir) throw new Error('CBE_PROFILE_DIR is required');
const resolvedProfile = path.resolve(profileDir);
if (resolvedProfile === repositoryRoot || resolvedProfile.startsWith(`${repositoryRoot}${path.sep}`)) {
  throw new Error('Authenticated browser profile must not be stored inside the repository');
}

const result = await executeBrowserJob(
  {
    jobId: randomUUID(),
    caller: 'cbe-001-codespaces-authenticated-test',
    targetUrl: 'https://github.com/codespaces',
    actions: ['navigate', 'read', 'screenshot'],
    timeoutMs: 30_000,
    lease: {
      taskId: randomUUID(),
      leaseToken: randomUUID(),
      fencingEpoch: 1,
      workerInstanceId: 'cbe-001-codespaces-worker',
    },
    expectedResult: {
      requireOkResponse: true,
      finalHost: 'github.com',
    },
    authorityRef: 'L4A-CBE-001-Test',
  },
  { allowedHosts: ['github.com'], maxTimeoutMs: 60_000 },
  {
    leaseVerifier: async () => ({ valid: true }),
    driverFactory: () => createPlaywrightDriver({
      headless: true,
      persistentContextDir: resolvedProfile,
    }),
  }
);

assert.equal(result.status, 'succeeded', JSON.stringify(result));
const response = result.evidence.response;
assert.ok(response && typeof response === 'object' && !Array.isArray(response));
const finalUrl = response.finalUrl;
const title = response.title;
assert.equal(typeof finalUrl, 'string');
assert.equal(typeof title, 'string');
const final = new URL(finalUrl);
assert.equal(final.hostname, 'github.com');
assert.ok(final.pathname.startsWith('/codespaces'), `unexpected final path: ${final.pathname}`);
assert.equal(title.toLowerCase().includes('sign in'), false, 'authenticated proof was redirected to sign in');

const record = {
  schemaVersion: 1,
  proof: 'CBE-001 authenticated Codespaces browser proof',
  capturedAt: new Date().toISOString(),
  codespaceName: process.env.CODESPACE_NAME?.trim() || null,
  result,
};
const serialized = `${JSON.stringify(record, null, 2)}\n`;
const proofOutput = process.env.CBE_PROOF_OUTPUT?.trim();
if (proofOutput) {
  await writeFile(proofOutput, serialized, { mode: 0o600 });
}

console.log(JSON.stringify(record));
