import Fastify from 'fastify';
import { createHash, timingSafeEqual, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { validatePrincipals, type Principal, type AccessAudit } from './security.js';
export type { Principal } from './security.js';

const requestSchema = z.object({
  project: z.string().regex(/^[A-Z0-9_-]{1,64}$/),
  lane: z.string().regex(/^[A-Z0-9_-]{1,64}$/).optional(),
  kind: z.enum(['lanes', 'events', 'authority', 'verifications', 'decisions']),
  since: z.string().datetime({ offset: true }).optional(),
  limit: z.number().int().min(1).max(100).default(25),
}).strict();
export type ReadQuery = (sql: string, params: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
const sources = {
  lanes: ['v_runbook_lane_state', 'last_event_at', 'work_key'],
  events: ['v_runbook_timeline', 'occurred_at', 'event_id'],
  authority: ['v_runbook_authority', 'effective_at', 'authorization_id'],
  verifications: ['v_runbook_verification', 'verified_at', 'verification_id'],
  decisions: ['pm_decision_records', 'updated_at', 'id'],
} as const;
// Explicit projection avoids leaking details/conditions or future columns through SELECT *.
const columns = {
  lanes: 's.project_key,w.id,w.project_id,w.item_type,s.work_key,s.title,s.status,s.priority,s.owner,s.current_summary,s.last_event_at,s.next_action,w.updated_at',
  events: 's.event_id,COALESCE(e.project_id,w.project_id) AS project_id,e.project_id AS event_project_id,e.work_item_id,w.project_id AS work_item_project_id,w.item_type,s.project_key,s.work_key,s.occurred_at,s.action_summary,s.result_summary,s.outcome,s.next_action,s.source_system,s.source_ref,s.evidence',
  authority: 'authorization_id,project_key,work_key,effective_at,authorization_type,decision,scope,authorized_by,expires_at,source_system,source_ref,evidence',
  verifications: 'verification_id,project_key,work_key,verified_at,check_name,outcome,result_summary,verified_by,event_id,evidence',
  decisions: 'd.id,d.work_item_id,w.project_id,w.item_type,p.project_key,w.work_key,d.decision_needed,d.options::text AS options_json,d.selected_option,d.rationale,d.reversibility,d.decided_by,d.decided_at,d.created_at,d.updated_at',
} as const;
const digest = (value: string) => createHash('sha256').update(value).digest();

type SecurityOptions = {
  loadPrincipals?: () => Promise<Principal[]>;
  audit?: (record: AccessAudit) => Promise<void>;
};
export function buildRunbookQueryService(read: ReadQuery, principals: Principal[], now = Date.now, options: SecurityOptions = {}) {
  const initial = validatePrincipals(principals);
  const app = Fastify({ logger: false, bodyLimit: 4096, requestTimeout: 10000, trustProxy: false });
  const windows = new Map<string, { start: number; count: number }>();
  let active = 0;
  const records = new WeakMap<object, AccessAudit>();
  let globalWindow = { start: now(), count: 0 };
  app.addHook('onRequest', async (request, reply) => {
    const record: AccessAudit = { request_id: randomUUID(), observed_at: new Date(now()).toISOString(),
      principal_id: null, operation: request.method === 'POST' && request.url === '/v1/runbook/query' ? 'runbook.query' : 'unsupported',
      status: 0, project: null, kind: null };
    records.set(request, record);
    const time = now();
    if (time - globalWindow.start >= 60000) globalWindow = { start: time, count: 0 };
    if (++globalWindow.count > 300) {
      reply.header('Retry-After', '60');
      return reply.code(429).send({ request_id: record.request_id, error: 'global_rate_limited' });
    }
  });
  app.setErrorHandler((error, request, reply) => {
    const code = error && typeof error === 'object' && 'statusCode' in error ? Number(error.statusCode) : 500;
    const status = Number.isInteger(code) && code >= 400 && code < 500 ? code : 500;
    return reply.code(status).send({ request_id: records.get(request)?.request_id,
      error: status === 413 ? 'request_too_large' : 'request_rejected' });
  });
  app.addHook('onSend', async (request, reply, payload) => {
    reply.header('Cache-Control', 'no-store');
    reply.header('X-Content-Type-Options', 'nosniff');
    const record = records.get(request);
    if (record && options.audit) {
      record.status = reply.statusCode;
      try { await options.audit(record); }
      catch {
        reply.code(503).type('application/json');
        return JSON.stringify({ request_id: record.request_id, error: 'audit_unavailable' });
      }
    }
    return payload;
  });
  app.post('/v1/runbook/query', async (request, reply) => {
    const record = records.get(request)!;
    const requestId = record.request_id;
    const fail = (status: number, error: string) => reply.code(status).send({ request_id: requestId, error });
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ') || header.length > 1024) return fail(401, 'unauthorized');
    const supplied = digest(header.slice(7));
    let current: Principal[];
    try { current = options.loadPrincipals ? validatePrincipals(await options.loadPrincipals()) : initial; }
    catch { return fail(503, 'credentials_unavailable'); }
    const principal = current.find(p => timingSafeEqual(digest(p.token), supplied));
    if (!principal || principal.disabled || Date.parse(principal.expiresAt) <= now()) return fail(401, 'unauthorized');
    record.principal_id = principal.id;
    const time = now();
    let window = windows.get(principal.id);
    if (!window || time - window.start >= 60000) {
      if (windows.size >= 1024 && !windows.has(principal.id)) {
        for (const [id, old] of windows) if (time - old.start >= 60000) windows.delete(id);
        if (windows.size >= 1024) return fail(503, 'identity_capacity');
      }
      window = { start: time, count: 0 }; windows.set(principal.id, window);
    }
    if (++window.count > 60) { reply.header('Retry-After', '60'); return fail(429, 'rate_limited'); }
    const parsed = requestSchema.safeParse(request.body);
    if (!parsed.success) return fail(400, 'invalid_query');
    const input = parsed.data;
    record.project = input.project; record.kind = input.kind;
    if (!principal.projects.includes(input.project)) return fail(403, 'forbidden');
    if (active >= 4) { reply.header('Retry-After', '1'); return fail(429, 'busy'); }
    const [view, timestamp, tie] = sources[input.kind];
    // work_key is globally UNIQUE in pm_work_items. Both sides retain reader RLS.
    const laneJoin = input.kind === 'lanes'
      ? " JOIN comind_pm.pm_work_items w ON w.work_key = s.work_key AND w.item_type = 'lane'" : '';
    const decisionJoin = input.kind === 'decisions'
      ? ' JOIN comind_pm.pm_work_items w ON w.id = d.work_item_id JOIN comind_pm.pm_projects p ON p.id = w.project_id' : '';
    const eventJoin = input.kind === 'events'
      ? ' LEFT JOIN comind_pm.pm_events e ON e.id = s.event_id LEFT JOIN comind_pm.pm_work_items w ON w.id = e.work_item_id' : '';
    const from = input.kind === 'decisions' ? `comind_pm.${view} d${decisionJoin}`
      : input.kind === 'events' ? `comind_pm.${view} s${eventJoin}` : `comind_pm.${view} s${laneJoin}`;
    const projectColumn = input.kind === 'decisions' ? 'p.project_key' : 's.project_key';
    const laneColumn = input.kind === 'decisions' ? 'w.work_key' : 's.work_key';
    const timestampColumn = input.kind === 'decisions' ? 'd.updated_at' : `s.${timestamp}`;
    const tieColumn = input.kind === 'decisions' ? 'd.id' : `s.${tie}`;
    active++;
    try {
      const result = await read(
        `SELECT ${columns[input.kind]} FROM ${from}
         WHERE ${projectColumn} = $1 AND ($2::text IS NULL OR ${laneColumn} = $2)
         AND ($3::timestamptz IS NULL OR ${timestampColumn} > $3::timestamptz)
         ORDER BY ${timestampColumn} DESC NULLS LAST, ${tieColumn} DESC LIMIT $4`,
        [input.project, input.lane ?? null, input.since ?? null, input.limit + 1]);
      const more = result.rows.length > input.limit;
      const data = result.rows.slice(0, input.limit);
      const body = { version: 'drb-002.v1', request_id: requestId,
        retrieved_at: new Date(now()).toISOString(), source: `comind_pm.${view}`,
        project: input.project, lane: input.lane ?? null, kind: input.kind,
        limit: input.limit, source_relations: input.kind === 'events'
          ? [`comind_pm.${view}`, 'comind_pm.pm_events', 'comind_pm.pm_work_items']
          : ['lanes', 'decisions'].includes(input.kind)
            ? [`comind_pm.${view}`, 'comind_pm.pm_work_items', ...(input.kind === 'decisions' ? ['comind_pm.pm_projects'] : [])]
            : [`comind_pm.${view}`],
        more_available: more, data };
      if (Buffer.byteLength(JSON.stringify(body)) > 262144) return fail(413, 'result_too_large');
      return body;
    } catch {
      return fail(503, 'runbook_unavailable');
    } finally { active--; }
  });
  return app;
}
