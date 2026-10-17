import { projectCanonicalPage } from './canonical-projections.mjs';
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
// Trusted-server consumer adapter only; no token, fetch or browser session behavior.
export function projectRunbookLanes(envelope, expectedProject) {
  if (typeof expectedProject !== 'string' || !/^[A-Z0-9_-]{1,64}$/.test(expectedProject)) throw new TypeError('Expected project required');
  if (!envelope || envelope.version !== 'drb-002.v1' || envelope.kind !== 'lanes'
    || envelope.source !== 'comind_pm.v_runbook_lane_state' || envelope.project !== expectedProject
    || !uuid(envelope.request_id) || !Array.isArray(envelope.data)
    || !Array.isArray(envelope.source_relations)
    || !envelope.source_relations.includes('comind_pm.pm_work_items')) throw new TypeError('Invalid DRB lane envelope');
  for (const row of envelope.data) {
    if (!row || row.project_key !== expectedProject || !uuid(row.project_id)
      || (envelope.lane !== null && row.work_key !== envelope.lane)) throw new TypeError('Lane scope mismatch');
  }
  const output = projectCanonicalPage('lanes', {
    state: 'ok', observedAt: envelope.retrieved_at,
    scope: `project:${expectedProject};lane:${envelope.lane ?? 'all'}`,
    limit: envelope.limit, moreAvailable: envelope.more_available, rows: envelope.data,
  });
  return { ...output, retrieval: { requestId: envelope.request_id,
    source: envelope.source, sourceRelations: [...envelope.source_relations] } };
}
