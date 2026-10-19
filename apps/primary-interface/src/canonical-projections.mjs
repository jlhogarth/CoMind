// Pure repository projections. Inputs must come from a separately reviewed trusted reader.
// No networking, credentials, authorization, evidence verification or decision execution.
const SOURCES = Object.freeze({
  foundry: { relation: 'comind.cm_foundry_authorization_request', key: 'authorization_request_id',
    fields: ['authorization_request_id','status','reason','authority_level','environment','target_kind','target_ref','requested_at','expires_at'],
    statuses: ['pending','approved','denied','cancelled','expired'] },
  project: { relation: 'comind_pm.pm_decision_records', key: 'id',
    fields: ['id','work_item_id','decision_needed','selected_option','rationale','decided_at','created_at','updated_at'] },
  lanes: { relation: 'comind_pm.pm_work_items', key: 'id',
    fields: ['id','project_id','work_key','item_type','title','status','owner','current_summary','last_event_at','updated_at'],
    statuses: ['backlog','ready','in_progress','blocked','review','done','canceled','deferred'] },
});
const nonempty = x => typeof x === 'string' && x.trim().length > 0;
const uuid = x => typeof x === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x);
const instant = x => nonempty(x) && /^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(x) && Number.isFinite(Date.parse(x));
function blocker(operation, input, resolver, evidence) { return { operation, input, resolver, evidence }; }

/** page: state, observedAt, scope, limit, moreAvailable, rows.
 * scope is a trusted-reader assertion, not authenticated here. No totals are inferred.
 * A page is a bounded window, never a complete registry or a lossless feed.
 */
export function projectCanonicalPage(domain, page) {
  const spec = SOURCES[domain];
  if (!spec) throw new TypeError('Unsupported canonical domain');
  if (!page || !['ok','partial','missing','failed','forbidden'].includes(page.state)) throw new TypeError('Invalid source state');
  if (!instant(page.observedAt) || !nonempty(page.scope)) throw new TypeError('Observation time and reviewed scope required');
  if (!Number.isInteger(page.limit) || page.limit < 1 || page.limit > 100) throw new TypeError('Limit must be 1..100');
  if (!Array.isArray(page.rows) || page.rows.length > page.limit || typeof page.moreAvailable !== 'boolean') throw new TypeError('Invalid bounded page');
  if (!['ok','partial'].includes(page.state) && (page.rows.length || page.moreAvailable)) throw new TypeError('Unavailable source cannot carry records');
  const seen = new Set();
  const records = page.rows.map(row => {
    if (!row || !uuid(row[spec.key])) throw new TypeError('Malformed canonical identifier');
    const key = row[spec.key].toLowerCase();
    if (seen.has(key)) throw new TypeError('Duplicate canonical identifier');
    seen.add(key);
    if (domain === 'lanes' && row.item_type !== 'lane') throw new TypeError('Lane source contains non-lane row');
    const source = Object.fromEntries(spec.fields.map(field => {
      const value = row[field] ?? null;
      if (value !== null && typeof value !== 'string') throw new TypeError(`Invalid scalar ${field}`);
      return [field, value];
    }));
    const gaps = domain === 'lanes'
      ? ['dependencies','issue/PR/head verification','next authority boundary','RunBook event identity']
      : ['canonical lane and RunBook joins','concurrency revision','recommendation and consequence provenance','verified evidence expiry and conflict policy'];
    const blockers = gaps.map(input => blocker('complete read-only detail', input, domain === 'foundry' ? 'PI/Foundry integration owner' : 'PI/DRB integration owner', spec.relation));
    if (spec.statuses && !spec.statuses.includes(row.status)) blockers.push(blocker('interpret lifecycle', 'recognized canonical status', 'canonical source owner', `${spec.relation}.status`));
    return { id: `${spec.relation}:${row[spec.key]}`, sourceRelation: spec.relation,
      sourceId: row[spec.key], source, observedAt: page.observedAt,
      lifecycle: domain === 'project' ? null : source.status,
      revision: null, decisionEnabled: false, blockers };
  });
  return { version: 'pi-canonical-read.v1', domain, sourceRelation: spec.relation,
    state: page.state, observedAt: page.observedAt, scope: page.scope,
    coverage: { kind: 'bounded-window', returned: records.length, limit: page.limit,
      moreAvailable: page.moreAvailable, total: null }, records };
}
