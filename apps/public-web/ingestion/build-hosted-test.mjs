import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { build } = require('esbuild');
const output = process.argv[2];
const siteKey = process.env.WEB001_TURNSTILE_SITE_KEY;
if (!output || !/^[A-Za-z0-9_-]{10,100}$/.test(siteKey ?? '')) {
  throw new Error('Provide the bundle path and the hostname-bound WEB001_TURNSTILE_SITE_KEY');
}
const origin = 'https://comind-web-001-ingestion-test.jlhogarth.workers.dev';
const routes = [
  ['reading/contribute-question.html', '../public/', 'text/html; charset=utf-8'],
  ['curiosity-draft.js', '../public/', 'application/javascript; charset=utf-8'],
  ['site.css', '../public/', 'text/css; charset=utf-8'],
  ...['comind-brand', 'tokens', 'layout', 'motion', 'experience', 'mode-native']
    .map(name => ['brand/' + name + '.css', '../../../', 'text/css; charset=utf-8']),
];
const assets = Object.fromEntries(await Promise.all(routes.map(async ([path, base, type]) => {
  const content = await readFile(new URL(base + path, import.meta.url), 'utf8');
  return ['/' + path, [type, type.startsWith('text/html')
    ? content.replace('</head>', '<meta name="web001-test-contributions" content="' + origin +
      '" data-sitekey="' + siteKey + '">\n</head>')
    : content]];
})));
const app = `
import ingestion from './worker-entry.mjs';
const assets = ${JSON.stringify(assets)};
const csp = "default-src 'none'; script-src 'self' https://challenges.cloudflare.com; style-src 'self'; frame-src https://challenges.cloudflare.com; connect-src 'self' https://challenges.cloudflare.com; img-src 'self' data:; base-uri 'none'; frame-ancestors 'none'; form-action 'none'";
export default {fetch(request,env) {
  const url=new URL(request.url);
  if (url.pathname==='/contributions' || url.pathname.startsWith('/contributions/')) return ingestion.fetch(request,env);
  if (request.method!=='GET' && request.method!=='HEAD') return new Response(null,{status:405});
  if (url.pathname==='/' || url.pathname==='/reading/contribute-question') {
    return Response.redirect(new URL('/reading/contribute-question.html',url));
  }
  const asset=Object.hasOwn(assets,url.pathname) && assets[url.pathname];
  if (!asset) {
    const target = new URL('https://comind-web-001-preview.jlhogarth.workers.dev');
    target.pathname = url.pathname;
    return Response.redirect(target);
  }
  return new Response(request.method==='HEAD'?null:asset[1],{headers:{
    'content-type':asset[0],'content-security-policy':csp,'cache-control':'no-store',
    'x-content-type-options':'nosniff','referrer-policy':'no-referrer','x-robots-tag':'noindex, nofollow',
  }});
}};`;
const result = await build({
  stdin: { contents: app, resolveDir: fileURLToPath(new URL('./', import.meta.url)), sourcefile: 'hosted-test.mjs' },
  bundle: true, platform: 'node', format: 'esm', target: 'es2022', minify: true, write: false,
  conditions: ['workerd'],
  external: ['pg-native', 'cloudflare:*'],
  nodePaths: [require.resolve('pg/package.json').replace(/\/pg\/package\.json$/, '')],
  banner: { js: "import {createRequire} from 'node:module'; const require = createRequire('file:///hosted-test.mjs');" },
});
await writeFile(output, result.outputFiles[0].contents);
