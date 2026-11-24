import { Pool } from 'pg';
import { z } from 'zod';
import { loadPrivatePrincipals } from '../runbook/security.js';
import { PostgresReturnStore } from './postgres.js';
import { buildReturnFallbackService } from './fallback-service.js';

const config = z.strictObject({
  databaseUrl: z.string().url(),
  principalsFile: z.string().startsWith('/'),
  port: z.coerce.number().int().min(1024).max(65535),
  testOnly: z.literal('true'),
}).parse({
  databaseUrl: process.env.AED_CRP_TEST_DATABASE_URL,
  principalsFile: process.env.AED_CRP_PRINCIPALS_FILE,
  port: process.env.AED_CRP_TEST_PORT ?? '3012',
  testOnly: process.env.AED_CRP_TEST_ONLY,
});
const url = new URL(config.databaseUrl);
if (!['postgres:', 'postgresql:'].includes(url.protocol) ||
    url.pathname !== '/comind_crp_acceptance' ||
    !['db', 'localhost', '127.0.0.1'].includes(url.hostname)) {
  throw new Error('AED-CRP host requires the isolated local acceptance database');
}
await loadPrivatePrincipals(config.principalsFile);
const pool = new Pool({ connectionString: config.databaseUrl, max: 4,
  connectionTimeoutMillis: 3000, query_timeout: 5000 });
const app = buildReturnFallbackService({
  store: new PostgresReturnStore(pool),
  loadPrincipals: () => loadPrivatePrincipals(config.principalsFile),
});
app.get('/health', async () => ({ ok: true, service: 'aed-crp-test-return' }));
app.addHook('onClose', async () => { await pool.end(); });
try {
  await pool.query('SELECT 1 FROM comind.cm_aed_crp_return LIMIT 1');
  await app.listen({ host: '127.0.0.1', port: config.port });
} catch (error) {
  await app.close();
  throw error;
}
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => { void app.close(); });
}
