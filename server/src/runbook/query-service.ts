import Fastify from 'fastify';
import { createHash, timingSafeEqual, randomUUID } from 'node:crypto';
import { z } from 'zod';

const requestSchema = z.object({
  project: z.string().regex(/^[A-Z0-9_-]{1,64}$/),
  lane: z.string().regex(/^[A-Z0-9_-]{1,64}$/).optional(),
  kind: z.enum(['lanes', 'events', 'authority', 'verifications']),
  since: z.string().datetime({ offset: true }).optional(),
  limit: z.number().int().min(1).max(100).default(25),
}).strict();
export type Principal = { id: string; token: string; projects: string[] };
export type ReadQuery = (sql: string, params: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
const sources = {
  lanes: ['v_runbook_lane_state', 'last_event_at', 'work_key'],
  events: ['v_runbook_timeline', 'occurred_at', 'event_id'],
  authority: ['v_runbook_authority', 'effective_at', 'authorization_id'],
  verifications: ['v_runbook_verification', 'verified_at', 'verification_id'],
} as const;
// Explicit projection avoids leaking details/conditions or future columns through SELECT *.
const columns = {
  lanes: 'project_key,work_key,title,status,current_summary,last_event_at,next_action',
  events: 'event_id,project_key,work_key,occurred_at,action_summary,result_summary,outcome,next_action,source_system,source_ref,evidence',
  authority: 'authorization_id,project_key,work_key,effective_at,authorization_type,decision,scope,authorized_by,expires_at,source_system,source_ref,evidence',
  verifications: 'verification_id,project_key,work_key,verified_at,check_name,outcome,result_summary,verified_by,event_id,evidence',
} as const;
const digest = (value: string) => createHash('sha256').update(value).digest();

export function buildRunbookQueryService(read: ReadQuery, principals: Principal[], now = Date.now) {
  if (!principals.length || new Set(principals.map(p => p.id)).size !== principals.length
      || new Set(principals.map(p => p.token)).size !== principals.length
      || principals.some(p => !p.id || p.token.length < 32 || !p.projects.length)) {
    throw new Error('Invalid RunBook principal configuration');
  }
  const app = Fastify({ logger: false, bodyLimit: 4096, requestTimeout: 10000, trustProxy: false });
  const windows = new Map<string, { start: number; count: number }>();
  let active = 0;
  app.addHook('onSend', async (_request, reply) => {
    reply.header('Cache-Control', 'no-store');
    reply.header('X-Content-Type-Options', 'nosniff');
  });
  app.post('/v1/runbook/query', async (request, reply) => {
    const requestId = randomUUID();
    const fail = (status: number, error: string) => reply.code(status).send({ request_id: requestId, error });
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ') || header.length > 1024) return fail(401, 'unauthorized');
    const supplied = digest(header.slice(7));
    const principal = principals.find(p => timingSafeEqual(digest(p.token), supplied));
    if (!principal) return fail(401, 'unauthorized');
    const time = now();
    let window = windows.get(principal.id);
    if (!window || time - window.start >= 60000) {
      window = { start: time, count: 0 }; windows.set(principal.id, window);
    }
    if (++window.count > 60) { reply.header('Retry-After', '60'); return fail(429, 'rate_limited'); }
    const parsed = requestSchema.safeParse(request.body);
    if (!parsed.success) return fail(400, 'invalid_query');
    const input = parsed.data;
    if (!principal.projects.includes(input.project)) return fail(403, 'forbidden');
    if (active >= 4) { reply.header('Retry-After', '1'); return fail(429, 'busy'); }
    const [view, timestamp, tie] = sources[input.kind];
    active++;
    try {
      const result = await read(
        `SELECT ${columns[input.kind]} FROM comind_pm.${view}
         WHERE project_key = $1 AND ($2::text IS NULL OR work_key = $2)
         AND ($3::timestamptz IS NULL OR ${timestamp} > $3::timestamptz)
         ORDER BY ${timestamp} DESC NULLS LAST, ${tie} DESC LIMIT $4`,
        [input.project, input.lane ?? null, input.since ?? null, input.limit + 1]);
      const more = result.rows.length > input.limit;
      const data = result.rows.slice(0, input.limit);
      const body = { version: 'drb-002.v1', request_id: requestId,
        retrieved_at: new Date(now()).toISOString(), source: `comind_pm.${view}`,
        project: input.project, lane: input.lane ?? null, kind: input.kind,
        more_available: more, data };
      if (Buffer.byteLength(JSON.stringify(body)) > 262144) return fail(413, 'result_too_large');
      return body;
    } catch {
      return fail(503, 'runbook_unavailable');
    } finally { active--; }
  });
  return app;
}
