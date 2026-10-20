import { projectCanonicalPage } from './canonical-projections.mjs';
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

// Project decisions remain distinct from Foundry authorization and human-action assessment.
export function projectRunbookDecisions(envelope, expectedProject) {
  if (typeof expectedProject !== 'string' || !/^[A-Z0-9_-]{1,64}$/.test(expectedProject)) throw new TypeError('Expected project required');
  if (!envelope || envelope.version !== 'drb-002.v1' || envelope.kind !== 'decisions'
    || envelope.source !== 'comind_pm.pm_decision_records' || envelope.project !== expectedProject
    || !uuid(envelope.request_id) || !Array.isArray(envelope.data)
    || !Array.isArray(envelope.source_relations)
    || !envelope.source_relations.includes('comind_pm.pm_work_items')
    || !envelope.source_relations.includes('comind_pm.pm_projects')) throw new TypeError('Invalid DRB decision envelope');
  for (const row of envelope.data) {
    if (!row || row.project_key !== expectedProject || !uuid(row.project_id) || !uuid(row.work_item_id)
      || row.item_type === undefined || !row.work_key || (envelope.lane !== null && row.work_key !== envelope.lane)) {
      throw new TypeError('Decision scope mismatch');
    }
  }
  const output = projectCanonicalPage('project', {
    state: 'ok', observedAt: envelope.retrieved_at,
    scope: `project:${expectedProject};work-item:${envelope.lane ?? 'all'}`,
    limit: envelope.limit, moreAvailable: envelope.more_available, rows: envelope.data,
  });
  return { ...output, retrieval: { requestId: envelope.request_id,
    source: envelope.source, sourceRelations: [...envelope.source_relations] } };
}
