import { mkdir } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { verifyChatgptAuthentication } from './cbe-chatgpt-auth-check.mjs';
import { acquireChatgptProfileLock } from '../dist/browser-executor/chatgpt-profile-lock.js';

const moduleDir = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(moduleDir, '../..');
const profileDir = resolve(process.env.CBE_PROFILE_DIR?.trim() || '/workspaces/.comind-chatgpt-profile');
const timeoutMs = 30 * 60_000;

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
  await page.goto('https://chatgpt.com/', {
    waitUntil: 'domcontentloaded',
    timeout: 60_000,
  });

  console.log(JSON.stringify({
    status: 'ready_for_human_authentication',
    host: 'chatgpt.com',
    authenticationMaterialRecorded: false,
  }));

  const deadline = Date.now() + timeoutMs;
  let authenticated = false;
  while (Date.now() < deadline) {
    for (const candidate of context.pages()) {
      if (await verifyChatgptAuthentication(candidate)) {
        authenticated = true;
        break;
      }
    }
    if (authenticated) break;
    await page.waitForTimeout(1000);
  }

  if (!authenticated) {
    throw new Error('ChatGPT authentication was not detected within the bounded session window');
  }

  console.log(JSON.stringify({
    status: 'authenticated',
    host: 'chatgpt.com',
    externalProfilePreserved: true,
    authenticationMaterialRecorded: false,
    liveReturnVerified: false,
  }));
} finally {
  if (context) await context.close().catch(() => undefined);
  await lock.handle.release();
}
