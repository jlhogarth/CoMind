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
  throw new Error('Browser profile must not be stored inside the repository');
}

assert.equal(process.env.CODESPACES, 'true', 'runtime proof must execute inside GitHub Codespaces');
const codespaceName = process.env.CODESPACE_NAME?.trim();
assert.ok(codespaceName, 'CODESPACE_NAME is required');

const result = await executeBrowserJob(
  {
    jobId: randomUUID(),
    caller: 'cbe-001-codespaces-runtime-test',
    targetUrl: 'https://github.com/jlhogarth/CoMind',
    actions: ['navigate', 'read', 'screenshot'],
    timeoutMs: 30_000,
    lease: {
      taskId: randomUUID(),
      leaseToken: randomUUID(),
      fencingEpoch: 1,
      workerInstanceId: 'cbe-001-codespaces-runtime-worker',
    },
    expectedResult: {
      requireOkResponse: true,
      finalHost: 'github.com',
      titleIncludes: 'GitHub',
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
assert.equal(response.statusCode, 200, `unexpected status: ${response.statusCode}`);
assert.equal(new URL(response.finalUrl).hostname, 'github.com');
assert.ok(response.screenshot && typeof response.screenshot === 'object');

const record = {
  schemaVersion: 1,
  proof: 'CBE-001 GitHub Codespaces runtime browser proof',
  capturedAt: new Date().toISOString(),
  codespaceName,
  runtime: 'github-codespaces',
  authenticationRequired: false,
  result,
};
const serialized = `${JSON.stringify(record, null, 2)}\n`;
const proofOutput = process.env.CBE_PROOF_OUTPUT?.trim();
if (proofOutput) {
  await writeFile(proofOutput, serialized, { mode: 0o600 });
}

console.log(JSON.stringify(record));
