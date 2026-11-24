// Fail closed when the signed-in account control cannot be observed.
// A composer alone is available in logged-out experiences and proves no identity.
export async function verifyChatgptAuthentication(page) {
  const url = new URL(page.url());
  if (url.origin !== 'https://chatgpt.com') return false;
  const composer = page.locator('#prompt-textarea').first();
  const profile = page.getByTestId('accounts-profile-button').first();
  const login = page.getByRole('button', { name: /^(log in|sign in)$/i }).first();
  return await composer.isVisible().catch(() => false)
    && await profile.isVisible().catch(() => false)
    && !await login.isVisible().catch(() => true);
}

export async function bootstrapProfile({ chromium, profileDir, confirm, report }) {
  const context = await chromium.launchPersistentContext(profileDir, {
    headless: false,
    viewport: { width: 1440, height: 960 },
  });
  try {
    const page = context.pages()[0] ?? await context.newPage();
    await page.goto('https://chatgpt.com/', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await confirm();
    if (!await verifyChatgptAuthentication(page)) {
      throw new Error('Sign-in could not be verified from the composer and account control. Rerun bootstrap and complete sign-in. UI changes also require selector review.');
    }
    report();
  } finally {
    await context.close();
  }
}

// Give a restored profile a bounded chance to hydrate before asking for human sign-in.
export async function detectExistingChatgptSession({ context, page, verify = verifyChatgptAuthentication }) {
  for (let attempt = 0; attempt < 10; attempt++) {
    for (const candidate of context.pages()) {
      if (await verify(candidate)) return true;
    }
    if (attempt < 9) await page.waitForTimeout(500);
  }
  return false;
}

// Only offer sign-in when the destination loaded and a login control is visible.
export async function classifyChatgptAuthHandoff({ page, response }) {
  const httpStatus = response?.status() ?? null;
  if (httpStatus === null || httpStatus >= 400) {
    return { status: 'destination_unavailable', httpStatus };
  }
  const loginButton = page.getByRole('button', { name: /^(log in|sign in)$/i }).first();
  const loginLink = page.getByRole('link', { name: /^(log in|sign in)$/i }).first();
  const visible = async locator => await locator.isVisible().catch(() => false);
  if (await visible(loginButton) || await visible(loginLink)) {
    return { status: 'ready_for_human_authentication', httpStatus };
  }
  return { status: 'authentication_state_unverified', httpStatus };
}
