import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createInterface } from 'node:readline/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stdin as input, stdout as output } from 'node:process';
import { chromium } from 'playwright';
import { bootstrapProfile } from './cbe-chatgpt-auth-check.mjs';

const moduleDir = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(moduleDir, '../..');

function insideRepository(candidate) {
  const rel = relative(repositoryRoot, candidate);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

function profileDirectory() {
  const raw = process.env.CBE_PROFILE_DIR?.trim();
  assert.ok(raw, 'CBE_PROFILE_DIR is required and must point outside the repository');
  const absolute = resolve(raw);
  assert.equal(
    insideRepository(absolute),
    false,
    'CBE_PROFILE_DIR must remain outside the repository'
  );
  return absolute;
}

const profileDir = profileDirectory();
await mkdir(profileDir, { recursive: true, mode: 0o700 });

const readline = createInterface({ input, output });
try {
  await bootstrapProfile({
    chromium,
    profileDir,
    async confirm() {
      output.write('Sign into ChatGPT in the opened browser and complete MFA there.\n');
      output.write('Do not copy authentication material into the terminal or repository.\n');
      await readline.question('Press Enter after ChatGPT sign-in is complete: ');
    },
    report() {
      output.write('Signed-in UI verified. External profile preserved; live return remains unverified.\n');
    },
  });
} finally {
  readline.close();
}

