import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createInterface } from 'node:readline/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stdin as input, stdout as output } from 'node:process';
import { chromium } from 'playwright';

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

const context = await chromium.launchPersistentContext(profileDir, {
  headless: false,
  viewport: { width: 1440, height: 960 },
});

const page = context.pages()[0] ?? await context.newPage();
await page.goto('https://chatgpt.com/', { waitUntil: 'domcontentloaded', timeout: 60_000 });

output.write('\nCoMind CBE ChatGPT authentication bootstrap\n');
output.write(`Persistent profile: ${profileDir}\n`);
output.write('Sign into ChatGPT in the opened browser window. Complete any MFA in that browser.\n');
output.write('Do not copy cookies, tokens, passwords, or storage state into this terminal or repository.\n');
output.write('When the normal ChatGPT conversation composer is visible, return here and press Enter.\n\n');

const readline = createInterface({ input, output });
try {
  await readline.question('Press Enter after ChatGPT sign-in is complete: ');

  const composer = page.locator(
    'textarea[data-testid="prompt-textarea"], #prompt-textarea, [contenteditable="true"][data-lexical-editor="true"]'
  ).first();

  const composerVisible = await composer.isVisible().catch(() => false);
  const currentUrl = page.url();
  const authenticated = currentUrl.startsWith('https://chatgpt.com/') && composerVisible;

  if (!authenticated) {
    throw new Error(
      'Authentication could not be verified. Keep the browser open, complete ChatGPT sign-in, and rerun this bootstrap if necessary.'
    );
  }

  output.write('\nAuthentication verified. The external Playwright profile is ready for CBE-003.\n');
  output.write('No browser authentication material was exported or written to the repository.\n');
} finally {
  readline.close();
  await context.close();
}
