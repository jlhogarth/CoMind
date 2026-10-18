// Read-only, bounded source history. Evidence is data, never execution authority.
import { projectCanonicalPage } from './canonical-projections.mjs';
const uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x);
const instant=x=>typeof x==='string'&&/^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(x)&&Number.isFinite(Date.parse(x));
export function projectRunbookEvents(envelope,expectedProject){
 if(typeof expectedProject!=='string'||!/^[A-Z0-9_-]{1,64}$/.test(expectedProject))throw new TypeError('Expected project required');
 if(!envelope||envelope.version!=='drb-002.v1'||envelope.kind!=='events'||envelope.source!=='comind_pm.v_runbook_timeline'
  ||envelope.project!==expectedProject||!uuid(envelope.request_id)||!instant(envelope.retrieved_at)
  ||!Array.isArray(envelope.source_relations)||envelope.source_relations.length!==1||envelope.source_relations[0]!==envelope.source
  ||!(envelope.lane===null||(typeof envelope.lane==='string'&&/^[A-Z0-9_-]{1,64}$/.test(envelope.lane)))
  ||!Number.isInteger(envelope.limit)||envelope.limit<1||envelope.limit>100||typeof envelope.more_available!=='boolean'
  ||!Array.isArray(envelope.data)||envelope.data.length>envelope.limit)throw new TypeError('Invalid RunBook event envelope');
 const seen=new Set();
 for(const row of envelope.data){
  if(!row||!uuid(row.event_id)||seen.has(row.event_id.toLowerCase())||row.project_key!==expectedProject
   ||!instant(row.occurred_at)||(envelope.lane!==null&&row.work_key!==envelope.lane)||!Array.isArray(row.evidence))throw new TypeError('Invalid RunBook event scope');
  seen.add(row.event_id.toLowerCase());
  for(const field of ['project_key','work_key','action_summary','result_summary','outcome','next_action','source_system','source_ref']){
   const value=row[field]??null;if(value!==null&&(typeof value!=='string'||value.length>65536))throw new TypeError('Invalid event scalar');
  }
 }
 const output=projectCanonicalPage('events',{state:'ok',observedAt:envelope.retrieved_at,
  scope:`project:${expectedProject};work-item:${envelope.lane??'all'}`,
  limit:envelope.limit,moreAvailable:envelope.more_available,rows:envelope.data});
 return {...output,retrieval:{requestId:envelope.request_id,source:envelope.source,sourceRelations:[...envelope.source_relations]}};
}
