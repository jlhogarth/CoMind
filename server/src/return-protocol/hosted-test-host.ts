import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Pool } from 'pg';
import { z } from 'zod';
import { loadPrivatePrincipals, validatePrincipals } from '../runbook/security.js';
import { buildReturnFallbackService } from './fallback-service.js';
import { PostgresReturnStore } from './postgres.js';

// This acceptance entry point is deliberately bound to the isolated Test project.
// The normal API server and the shared Supabase main database cannot start it.
export const AED_CRP_TEST_RAILWAY_PROJECT = 'ff31f299-0771-4126-9381-731417771e12';
export const AED_CRP_TEST_RAILWAY_ENVIRONMENT = 'f9371d64-57a4-4b2e-8665-84fe040ef90c';

const schema = z.strictObject({
  databaseUrl: z.string().url(),
  principalsJson: z.string().min(1).max(65536),
  port: z.coerce.number().int().min(1024).max(65535),
  testOnly: z.literal('true'),
  projectId: z.literal(AED_CRP_TEST_RAILWAY_PROJECT),
  environmentId: z.literal(AED_CRP_TEST_RAILWAY_ENVIRONMENT),
});

export function parseHostedTestConfig(environment: NodeJS.ProcessEnv) {
  const config = schema.parse({
    databaseUrl: environment.AED_CRP_TEST_DATABASE_URL,
    principalsJson: environment.AED_CRP_PRINCIPALS_JSON,
    port: environment.PORT,
    testOnly: environment.AED_CRP_TEST_ONLY,
    projectId: environment.RAILWAY_PROJECT_ID,
    environmentId: environment.RAILWAY_ENVIRONMENT_ID,
  });
  const url = new URL(config.databaseUrl);
  if (!['postgres:', 'postgresql:'].includes(url.protocol) ||
      !url.hostname.endsWith('.railway.internal') || url.pathname !== '/railway' ||
      url.searchParams.has('sslmode') || url.hash) {
    throw new Error('AED-CRP hosted Test requires its private Railway database');
  }
  validatePrincipals(JSON.parse(config.principalsJson));
  return config;
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const config = parseHostedTestConfig(process.env);
  const directory = await mkdtemp(join(tmpdir(), 'aed-crp-principals-'));
  const principalsFile = join(directory, 'principals.json');
  await writeFile(principalsFile, config.principalsJson, { mode: 0o600, flag: 'wx' });
  const pool = new Pool({ connectionString: config.databaseUrl, max: 4,
    connectionTimeoutMillis: 3000, query_timeout: 5000 });
  const app = buildReturnFallbackService({
    store: new PostgresReturnStore(pool),
    loadPrincipals: () => loadPrivatePrincipals(principalsFile),
  });
  app.get('/live', async () => ({ ok: true, service: 'aed-crp-return-api', environment: 'test' }));
  app.get('/ready', async (_request, reply) => {
    try {
      await loadPrivatePrincipals(principalsFile);
      await pool.query('SELECT 1 FROM comind.cm_aed_crp_return LIMIT 1');
      return { ready: true, returnApi: true, dispatcher: false };
    } catch {
      return reply.code(503).send({ ready: false });
    }
  });
  app.addHook('onClose', async () => {
    await pool.end();
    await rm(directory, { recursive: true, force: true });
  });
  try {
    await loadPrivatePrincipals(principalsFile);
    await pool.query('SELECT 1 FROM comind.cm_aed_crp_return LIMIT 1');
    await app.listen({ host: '0.0.0.0', port: config.port });
  } catch (error) {
    await app.close();
    throw error;
  }
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => { void app.close(); });
  }
}
