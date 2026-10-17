import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { buildRunbookQueryService } from './query-service.js';
import { createFileAudit, loadPrivatePrincipals } from './security.js';
import { createRunbookReadQuery, verifyRunbookReader } from './database.js';

const config = z.object({
  DRB_DATABASE_URL: z.string().url().refine(s => /^postgres(ql)?:/.test(s)),
  DRB_PRINCIPALS_FILE: z.string().min(1),
  DRB_AUDIT_FILE: z.string().min(1),
  DRB_PORT: z.coerce.number().int().min(1).max(65535).default(3011),
}).parse(process.env);
const principals = await loadPrivatePrincipals(config.DRB_PRINCIPALS_FILE);
const audit = createFileAudit(config.DRB_AUDIT_FILE);
// Separate credential only. Never fall back to the application or service-role connection.
const pool = new Pool({ connectionString: config.DRB_DATABASE_URL, max: 4,
  connectionTimeoutMillis: 3000, query_timeout: 5000 });
pool.on('error', () => console.error('RunBook database pool unavailable'));
try { await verifyRunbookReader(pool); } catch (error) { await pool.end(); throw error; }
try {
  await audit({ request_id: randomUUID(), observed_at: new Date().toISOString(), principal_id: null,
    operation: 'service.start', status: 200, project: null, kind: null });
} catch (error) { await pool.end(); throw error; }
const app = buildRunbookQueryService(createRunbookReadQuery(pool), principals, Date.now, {
  loadPrincipals: () => loadPrivatePrincipals(config.DRB_PRINCIPALS_FILE),
  audit,
});
app.addHook('onClose', async () => { await pool.end(); });
// Local binding requires an explicitly configured TLS gateway for remote consumers.
await app.listen({ host: '127.0.0.1', port: config.DRB_PORT });
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => { void app.close(); });
