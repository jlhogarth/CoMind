import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';

const require = createRequire(import.meta.url);
const base = process.env.WEB001_URL || 'http://127.0.0.1:8765/';
const route = new URL('reading/contribute-question.html', base).href;
const launch = process.env.WEB001_CHROMIUM_PATH ? { executablePath: process.env.WEB001_CHROMIUM_PATH,
  args: ['--no-sandbox', '--disable-dev-shm-usage'] } : {};
const browser = await chromium.launch(launch);
const question = 'Synthetic: How could readers check a public claim?';
try {
  for (const [name, width, height] of [['desktop',1440,900], ['mobile',390,844]]) {
    const page = await browser.newPage({ viewport: { width, height }, reducedMotion: 'reduce', acceptDownloads: true });
    const outbound = [];
    const errors = [];
    page.on('request', request => outbound.push(request));
    page.on('pageerror', error => errors.push(error.message));

    assert.equal((await page.goto(route, { waitUntil: 'networkidle' })).status(), 200);
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.textContent), 'Skip to content');
    const requestsBeforeDraft = outbound.length;
    await page.getByLabel('Your question', { exact: true }).fill(question);
    await page.getByLabel('Why does it matter? (optional)', { exact: true }).fill('It is a fictional research exercise.');
    await page.getByRole('button', { name: 'Prepare research brief' }).click();
    assert.equal(await page.evaluate(() => document.activeElement.id), 'brief-heading');
    assert.match(await page.locator('#brief').innerText(), /fictional research exercise/);
    const [brief] = await Promise.all([page.waitForEvent('download'), page.locator('#export').click()]);
    assert.equal(brief.suggestedFilename(), 'comind-research-question.txt');
    assert.equal(outbound.length, requestsBeforeDraft);
    assert.equal(await page.locator('#review-contribution').isVisible(), false);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    if (!process.env.WEB001_SKIP_AXE) {
      await page.addScriptTag({ path: require.resolve('axe-core/axe.js') });
      const accessibility = await page.evaluate(() => axe.run(document, { runOnly: {
        type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'],
      } }));
      assert.deepEqual(accessibility.violations.map(({ id }) => id), [], name + ' accessibility violations');
    }
    assert.deepEqual(errors, []);

    // These provider fixtures exercise the browser contract only. Live acceptance must use real providers.
    if (!process.env.WEB001_PUBLIC_ONLY) {
      const requests = [];
      const api = 'https://ingestion.example.test';
      await page.route(route, async intercepted => {
        const original = await intercepted.fetch();
        const html = (await original.text()).replace('</head>',
          '<meta name="web001-test-contributions" content="' + api + '" data-sitekey="browser-test-key"></head>');
        await intercepted.fulfill({ response: original, body: html });
      });
      await page.route('https://challenges.cloudflare.com/**', intercepted => intercepted.fulfill({
        contentType: 'application/javascript', body: `window.turnstile = {
          render(selector, options) { queueMicrotask(() => options.callback('synthetic-challenge')); return 0; },
          remove() {}
        };`,
      }));
      await page.route(api + '/**', async intercepted => {
        const request = intercepted.request();
        const headers = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'POST, DELETE',
          'access-control-allow-headers': 'content-type, x-withdrawal-token, x-web001-test-access' };
        if (request.method() === 'OPTIONS') return intercepted.fulfill({ status: 204, headers });
        requests.push(request);
        if (request.method() === 'POST') {
          if (requests.length === 1) return intercepted.fulfill({ status: 503, headers, json: {} });
          return intercepted.fulfill({ status: 201, headers, json: {
            contribution_id: request.postDataJSON().contribution_id, expires_at: '2027-02-07T00:00:00Z',
          } });
        }
        return intercepted.fulfill({ status: 200, headers, json: { withdrawn: true } });
      });
      await page.goto(route, { waitUntil: 'networkidle' });
      await page.getByLabel('Your question', { exact: true }).fill(question);
      await page.getByRole('button', { name: 'Prepare research brief' }).click();
      await page.locator('#review-contribution').click();
      assert.equal(await page.evaluate(() => document.activeElement.id), 'contribution-heading');
      await page.locator('#share-question').fill(question + ' Edited before sharing.');
      await page.locator('#test-access').fill('a'.repeat(64));
      await page.locator('#share-submit').click();
      assert.equal(await page.locator('#share-consent').evaluate(control => control.validity.valueMissing), true);
      assert.equal(requests.length, 0);
      await page.locator('#share-consent').check();
      await page.locator('#share-submit').click();
      await page.getByText('Submission could not be confirmed. You can retry the same contribution.').waitFor();
      await page.locator('#share-submit').click();
      await page.getByText('Contribution received. Download the withdrawal receipt.').waitFor();
      assert.equal(await page.evaluate(() => document.activeElement.id), 'receipt-heading');
      assert.equal(requests.length, 2);
      assert.deepEqual(requests[0].postDataJSON(), requests[1].postDataJSON());
      assert.match(requests[1].postDataJSON().question, /Edited before sharing/);
      assert.equal(requests[1].postDataJSON().consent, true);
      assert.equal(requests[0].headers()['x-withdrawal-token'], requests[1].headers()['x-withdrawal-token']);
      const [receipt] = await Promise.all([page.waitForEvent('download'), page.locator('#save-receipt').click()]);
      assert.equal(receipt.suggestedFilename(), 'comind-withdrawal-receipt.json');
      await page.locator('#withdraw-access').fill('a'.repeat(64));
      await page.getByRole('button', { name: 'Withdraw contribution' }).click();
      await page.getByText('Contribution withdrawn. Its content and related research candidates were removed.').waitFor();
      assert.equal(requests.length, 3);
      assert.equal(requests[2].method(), 'DELETE');
      assert.equal(requests[2].headers()['x-withdrawal-token'], requests[1].headers()['x-withdrawal-token']);
      assert.deepEqual(errors, []);
    }
    console.log(name + ': draft, export, privacy, focus and responsive checks passed' +
      (process.env.WEB001_PUBLIC_ONLY ? '' : '; consent, retry, receipt and withdrawal passed against provider fixtures'));
    await page.close();
  }
} finally {
  await browser.close();
}
