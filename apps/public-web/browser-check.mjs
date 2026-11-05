import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

const base = process.env.WEB001_URL || 'http://127.0.0.1:8765/';
await mkdir('apps/public-web/evidence', { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  for (const [name, width, height] of [['desktop',1440,900],['laptop',1280,800],['tablet',768,1024],['mobile',390,844],['small-mobile',320,640]]) {
    const page = await browser.newPage({ viewport: { width, height }, reducedMotion: 'reduce' });
    const failures = [];
    page.on('pageerror', error => failures.push(error.message));
    page.on('requestfailed', request => failures.push(request.url() + ' ' + request.failure()?.errorText));
    page.on('response', response => { if (response.status() >= 400) failures.push(response.status() + ' ' + response.url()); });
    const response = await page.goto(base, { waitUntil: 'networkidle' });
    assert.equal(response.status(), 200);
    await page.screenshot({ path: `apps/public-web/evidence/${name}.png`, fullPage: true });
    const state = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth > innerWidth,
      missingTargets: [...document.querySelectorAll('nav a[href^="#"]')].filter(a => !document.getElementById(a.hash.slice(1))).map(a => a.hash),
      styles: [...document.styleSheets].map(s => s.href),
      reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
      background: getComputedStyle(document.body).backgroundColor,
      backgroundImage: getComputedStyle(document.body).backgroundImage,
    }));
    assert.deepEqual(failures, [], name + ' page load failures');
    await page.addScriptTag({ path: require.resolve('axe-core/axe.js') });
    const accessibility = await page.evaluate(() => axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } }));
    assert.deepEqual(accessibility.violations.map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.length })), [], name + ' accessibility violations');
    await page.keyboard.press('Tab');
    const focus = await page.evaluate(() => document.activeElement?.textContent?.trim());
    assert.equal(focus, 'Skip to content');
    assert.equal(state.overflow, false, `${name} horizontal overflow`);
    assert.deepEqual(state.missingTargets, []);
    assert.equal(state.reducedMotion, true);
    assert.ok(state.styles.some(s => s.endsWith('/brand/comind-brand.css')));
    assert.ok(state.background !== 'rgba(0, 0, 0, 0)' || state.backgroundImage !== 'none');
    console.log(JSON.stringify({ name, width, height, state, firstFocus: focus, accessibilityViolations: accessibility.violations.length, failures }));
    await page.close();
  }
} finally { await browser.close(); }
