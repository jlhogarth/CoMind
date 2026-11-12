import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const name = 'comind-web-001-ingestion-test';
const origin = 'https://' + name + '.jlhogarth.workers.dev';
const hyperdriveId = process.env.WEB001_HYPERDRIVE_ID;
const root = fileURLToPath(new URL('../../../', import.meta.url));
const site = fileURLToPath(new URL('../public/', import.meta.url));
const siteKey = process.env.WEB001_TURNSTILE_SITE_KEY;
const output = process.argv[2];
if (!output || !isAbsolute(output) || !relative(root, output).startsWith('..' + '/')) {
  throw new Error('Provide an unused absolute output directory outside the repository');
}
if (!siteKey || !/^[A-Za-z0-9_-]{10,100}$/.test(siteKey)) {
  throw new Error('WEB001_TURNSTILE_SITE_KEY must be the site key for the isolated Test hostname');
}
if (!/^[a-f0-9]{32}$/.test(hyperdriveId ?? '')) {
  throw new Error('WEB001_HYPERDRIVE_ID must identify the scoped Test binding');
}
await readFile(resolve(site, 'brand/comind-brand.css'));
await mkdir(output, { recursive: false });
const assets = resolve(output, 'public');
await cp(site, assets, { recursive: true });
for (const file of ['worker.mjs', 'worker-entry.mjs', 'package.json', 'package-lock.json']) {
  await cp(new URL('./' + file, import.meta.url), resolve(output, file));
}

const htmlPath = resolve(assets, 'reading/contribute-question.html');
const html = await readFile(htmlPath, 'utf8');
await writeFile(htmlPath, html.replace('</head>',
  '  <meta name="web001-test-contributions" content="' + origin + '" data-sitekey="' + siteKey + '">\n</head>'));
const headersPath = resolve(assets, '_headers');
const headers = await readFile(headersPath, 'utf8');
await writeFile(headersPath, headers
  .replace("script-src 'self';", "script-src 'self' https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com;")
  .replace("connect-src 'none';", "connect-src 'self' https://challenges.cloudflare.com;"));

await writeFile(resolve(output, 'wrangler.json'), JSON.stringify({
  name, main: './worker-entry.mjs', compatibility_date: '2026-08-06', workers_dev: true, preview_urls: false,
  assets: { directory: './public', html_handling: 'auto-trailing-slash', not_found_handling: '404-page',
    run_worker_first: ['/contributions', '/contributions/*'] },
  vars: { ALLOWED_ORIGIN: origin, COLLECTION_MODE: 'synthetic-test' },
  hyperdrive: [{ binding: 'WEB001_DB', id: hyperdriveId }],
  observability: { enabled: false },
  ratelimits: [{ name: 'VISITOR_RATE_LIMIT', namespace_id: '542001', simple: { limit: 6, period: 60 } }],
}, null, 2) + '\n');
console.log('Prepared the isolated WEB-001 synthetic preview outside the repository. The public preview assets are untouched.');
