import { mkdir } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { classifyChatgptAuthHandoff, detectExistingChatgptSession, verifyChatgptAuthentication } from './cbe-chatgpt-auth-check.mjs';
import { acquireChatgptProfileLock } from '../dist/browser-executor/chatgpt-profile-lock.js';

const moduleDir = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(moduleDir, '../..');
const profileDir = resolve(process.env.CBE_PROFILE_DIR?.trim() || '/workspaces/.comind-chatgpt-profile');
const timeoutMs = 30 * 60_000;

async function authSignals(context) {
  return Promise.all(context.pages().map(async page => {
    if (new URL(page.url()).origin !== 'https://chatgpt.com') return { host: 'other' };
    const visible = async locator => locator.isVisible().catch(() => false);
    return {
      host: 'chatgpt.com',
      composerVisible: await visible(page.locator('#prompt-textarea').first()),
      profileVisible: await visible(page.getByTestId('accounts-profile-button').first()),
      loginVisible: await visible(page.getByRole('button', { name: /^(log in|sign in)$/i }).first())
        || await visible(page.getByRole('link', { name: /^(log in|sign in)$/i }).first()),
      accountTestIds: await page.locator('[data-testid]').evaluateAll(elements =>
        [...new Set(elements.map(element => element.getAttribute('data-testid'))
          .filter(value => /profile|account|avatar|user/i.test(value ?? '')))].slice(0, 12)
      ).catch(() => []),
    };
  }));
}

async function reportSignals(context, phase, httpStatus = null) {
  console.log(JSON.stringify({
    status: 'auth_signal_diagnostic', phase, httpStatus,
    pages: await authSignals(context), authenticationMaterialRecorded: false,
  }));
}

function insideRepository(candidate) {
  const rel = relative(repositoryRoot, candidate);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

if (insideRepository(profileDir)) {
  throw new Error('CBE_PROFILE_DIR must remain outside the repository');
}

await mkdir(profileDir, { recursive: true, mode: 0o700 });
const lock = await acquireChatgptProfileLock(profileDir);
if (!lock.acquired) {
  throw new Error('profile_actuator_busy');
}

let context;
try {
  context = await chromium.launchPersistentContext(profileDir, {
    headless: false,
    viewport: { width: 1440, height: 900 },
  });
  const page = context.pages()[0] ?? await context.newPage();
  // Inspect restored pages before navigating away from a usable signed-in tab.
  let authenticated = await detectExistingChatgptSession({ context, page });
  const reusedExistingSession = authenticated;
  if (!authenticated) {
    await reportSignals(context, 'restored_profile');
    const response = await page.goto('https://chatgpt.com/', {
      waitUntil: 'domcontentloaded', timeout: 60_000,
    });
    await reportSignals(context, 'destination_loaded', response?.status() ?? null);
    const handoff = await classifyChatgptAuthHandoff({ page, response });
    console.log(JSON.stringify({
      ...handoff,
      host: 'chatgpt.com',
      authenticationMaterialRecorded: false,
    }));
    if (handoff.status !== 'ready_for_human_authentication') {
      throw new Error('ChatGPT destination or authentication state could not be verified');
    }

    const deadline = Date.now() + timeoutMs;
    let previousSignals = '';
    let iteration = 0;
    while (Date.now() < deadline) {
      for (const candidate of context.pages()) {
        if (await verifyChatgptAuthentication(candidate)) {
          authenticated = true;
          break;
        }
      }
      if (authenticated) break;
      if (iteration++ % 5 === 0) {
        const signals = JSON.stringify(await authSignals(context));
        if (signals !== previousSignals) {
          console.log(JSON.stringify({
            status: 'auth_signal_diagnostic', phase: 'human_authentication',
            pages: JSON.parse(signals), authenticationMaterialRecorded: false,
          }));
          previousSignals = signals;
        }
      }
      await page.waitForTimeout(1000);
    }
  }

  if (!authenticated) {
    throw new Error('ChatGPT authentication was not detected within the bounded session window');
  }

  console.log(JSON.stringify({
    status: 'authenticated',
    host: 'chatgpt.com',
    externalProfilePreserved: true,
    reusedExistingSession,
    authenticationMaterialRecorded: false,
    liveReturnVerified: false,
  }));
} finally {
  if (context) await context.close().catch(() => undefined);
  await lock.handle.release();
}
