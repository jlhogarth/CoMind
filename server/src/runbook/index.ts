import { Pool } from 'pg';
import { z } from 'zod';
import { buildRunbookQueryService } from './query-service.js';
import { createRunbookReadQuery, verifyRunbookReader } from './database.js';

const config = z.object({
  DRB_DATABASE_URL: z.string().url().refine(s => /^postgres(ql)?:/.test(s)),
  DRB_PRINCIPALS: z.string().transform(s => JSON.parse(s)).pipe(z.array(z.object({
    id: z.string().min(1), token: z.string().min(32), projects: z.array(z.string().regex(/^[A-Z0-9_-]{1,64}$/)).min(1),
  }).strict()).min(1)),
  DRB_PORT: z.coerce.number().int().min(1).max(65535).default(3011),
}).parse(process.env);
// Separate credential only. Never fall back to the application or service-role connection.
const pool = new Pool({ connectionString: config.DRB_DATABASE_URL, max: 4,
  connectionTimeoutMillis: 3000, query_timeout: 5000 });
pool.on('error', () => console.error('RunBook database pool unavailable'));
try { await verifyRunbookReader(pool); } catch (error) { await pool.end(); throw error; }
const app = buildRunbookQueryService(createRunbookReadQuery(pool), config.DRB_PRINCIPALS);
app.addHook('onClose', async () => { await pool.end(); });
// Local binding requires an explicitly configured TLS gateway for remote consumers.
await app.listen({ host: '127.0.0.1', port: config.DRB_PORT });
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => { void app.close(); });
