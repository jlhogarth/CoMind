import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const repositoryRoot = path.resolve(process.cwd(), '..');
const profileDir = process.env.CBE_PROFILE_DIR?.trim();
if (!profileDir) throw new Error('CBE_PROFILE_DIR is required');
const resolvedProfile = path.resolve(profileDir);
if (resolvedProfile === repositoryRoot || resolvedProfile.startsWith(`${repositoryRoot}${path.sep}`)) {
  throw new Error('Authenticated browser profile must not be stored inside the repository');
}

await mkdir(resolvedProfile, { recursive: true, mode: 0o700 });
const context = await chromium.launchPersistentContext(resolvedProfile, { headless: false });
const page = context.pages()[0] ?? await context.newPage();

try {
  await page.goto('https://github.com/codespaces', {
    waitUntil: 'domcontentloaded',
    timeout: 30_000,
  });
  console.log(JSON.stringify({ status: 'ready_for_human_authentication', host: 'github.com' }));

  const deadline = Date.now() + 30 * 60_000;
  let authenticated = false;
  while (Date.now() < deadline) {
    const current = new URL(page.url());
    const userLogin = await page.locator('meta[name="user-login"]').getAttribute('content').catch(() => null);
    if (current.hostname === 'github.com' && current.pathname.startsWith('/codespaces') && userLogin?.trim()) {
      console.log(JSON.stringify({ status: 'authenticated', host: 'github.com', path: '/codespaces' }));
      authenticated = true;
      break;
    }
    await page.waitForTimeout(1000);
  }
  if (!authenticated) {
    throw new Error('GitHub authentication was not detected within the bounded session window');
  }
} finally {
  await context.close();
}
