import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const projectId = 'prj_LlncyOuGfti8EUaqxfWWoqPCeztI';
const teamId = 'team_sRwxGmpPaFW221zKHQS7YXwb';
const sandboxName = 'chist-pita-r5-internal';
const oidc = process.env.VERCEL_OIDC_TOKEN;
const databaseUrl = process.env.CHATGPT_ARCHIVE_DATABASE_URL;

if (!oidc) throw new Error('VERCEL_OIDC_TOKEN is required');
if (!databaseUrl) throw new Error('CHATGPT_ARCHIVE_DATABASE_URL is required');

const api = async (url, init = {}) => {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${oidc}`,
      ...(init.headers ?? {}),
    },
  });
  const text = await response.text();
  let payload = null;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = { raw: text.slice(0, 500) }; }
  if (!response.ok) {
    throw new Error(`Vercel API ${response.status}: ${JSON.stringify(payload)}`);
  }
  return payload;
};

let sessionId = null;
try {
  const created = await api(`https://api.vercel.com/v2/sandboxes?teamId=${encodeURIComponent(teamId)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      projectId,
      name: sandboxName,
      runtime: 'node24',
      region: 'iad1',
      timeout: 2400000,
      persistent: false,
      networkPolicy: {
        mode: 'custom',
        allowedDomains: ['registry.npmjs.org', 'aws-0-us-east-1.pooler.supabase.com'],
      },
      env: {
        CHATGPT_ARCHIVE_DATABASE_URL: databaseUrl,
      },
      tags: {
        purpose: 'chist-pita',
        phase: 'native-baseline-ingest',
      },
    }),
  });

  const root = created?.result ?? created;
  sessionId = root?.session?.id ?? root?.sandbox?.currentSessionId;
  if (!sessionId) throw new Error('Sandbox creation returned no session id');

  const repoRoot = resolve(process.cwd(), '../..');
  const archivePath = '/tmp/chist-server-source.tgz';
  execFileSync('tar', [
    '-czf', archivePath,
    '--exclude=server/node_modules',
    '--exclude=server/dist',
    '-C', repoRoot,
    'server',
  ], { stdio: 'inherit' });

  const sourceArchive = readFileSync(archivePath);
  await api(`https://api.vercel.com/v2/sandboxes/sessions/${encodeURIComponent(sessionId)}/fs/write?teamId=${encodeURIComponent(teamId)}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/gzip',
      'x-cwd': '/vercel',
    },
    body: sourceArchive,
  });

  console.log(JSON.stringify({
    status: 'CHIST_SANDBOX_READY',
    sandboxName,
    sessionId,
    sourceCommit: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
  }));
} catch (error) {
  if (sessionId) {
    try {
      await api(`https://api.vercel.com/v2/sandboxes/sessions/${encodeURIComponent(sessionId)}/stop?teamId=${encodeURIComponent(teamId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
    } catch {}
  }
  throw error;
}
