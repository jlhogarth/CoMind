import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

assert.equal(
  process.env.CBE_LIVE_CHATGPT_PROOF,
  'true',
  'Set CBE_LIVE_CHATGPT_PROOF=true to acknowledge an intentional live ChatGPT handoff proof'
);

const jobFile = process.env.CBE_HANDOFF_JOB_FILE?.trim();
assert.ok(jobFile, 'CBE_HANDOFF_JOB_FILE is required');
const absoluteJobFile = path.resolve(jobFile);
await readFile(absoluteJobFile, 'utf8');
assert.ok(process.env.CBE_PROFILE_DIR?.trim(), 'CBE_PROFILE_DIR is required');
assert.ok(process.env.DATABASE_URL?.trim(), 'DATABASE_URL is required');

const cliPath = path.resolve(process.cwd(), 'dist/browser-executor/chatgpt-handoff-cli.js');
const child = spawn(process.execPath, [cliPath, absoluteJobFile], {
  env: process.env,
  stdio: ['ignore', 'pipe', 'pipe'],
});

let stdout = '';
let stderr = '';
child.stdout.setEncoding('utf8');
child.stderr.setEncoding('utf8');
child.stdout.on('data', chunk => { stdout += chunk; });
child.stderr.on('data', chunk => { stderr += chunk; });

const exitCode = await new Promise((resolve, reject) => {
  child.once('error', reject);
  child.once('close', resolve);
});

const lines = stdout.trim().split(/\r?\n/).filter(Boolean);
assert.ok(lines.length > 0, `ChatGPT actuator emitted no machine-readable result. stderr=${stderr}`);
const result = JSON.parse(lines.at(-1));
assert.equal(exitCode, 0, JSON.stringify(result));
assert.equal(result.returnStatus, 'RETURNED', JSON.stringify(result));
assert.equal(result.conversationReturned, true, JSON.stringify(result));
assert.equal(result.conversationReturnImpossible, false, JSON.stringify(result));
assert.equal(result.controllerMayContinueImplementation, false, JSON.stringify(result));
assert.equal(result.ownershipReleased, true, JSON.stringify(result));

const proof = {
  schemaVersion: 1,
  proof: 'CBE-003 governed live ChatGPT conversation return',
  capturedAt: new Date().toISOString(),
  runtime: process.env.CODESPACES === 'true' ? 'github-codespaces' : 'self-hosted-node',
  result,
};

const proofOutput = process.env.CBE_PROOF_OUTPUT?.trim();
if (proofOutput) {
  await writeFile(proofOutput, `${JSON.stringify(proof, null, 2)}\n`, { mode: 0o600 });
}

console.log(JSON.stringify(proof));
