// Read-only, bounded source history. Evidence is data, never execution authority.
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
 const seen=new Set(),fields=['event_id','project_key','work_key','occurred_at','action_summary','result_summary','outcome','next_action','source_system','source_ref'];
 const records=envelope.data.map(row=>{
  if(!row||!uuid(row.event_id)||seen.has(row.event_id.toLowerCase())||row.project_key!==expectedProject
   ||!instant(row.occurred_at)||(envelope.lane!==null&&row.work_key!==envelope.lane)||!Array.isArray(row.evidence))throw new TypeError('Invalid RunBook event scope');
  seen.add(row.event_id.toLowerCase());
  const source=Object.fromEntries(fields.map(field=>{
   const value=row[field]??null;if(value!==null&&(typeof value!=='string'||value.length>65536))throw new TypeError('Invalid event scalar');
   return [field,value];
  }));
  return {sourceId:row.event_id,source:{...source,evidence:structuredClone(row.evidence)},decisionEnabled:false};
 });
 return {version:'pi-runbook-events.v1',records,observedAt:envelope.retrieved_at,
  retrieval:{requestId:envelope.request_id,source:envelope.source,sourceRelations:[...envelope.source_relations]},
  coverage:{kind:'bounded-window',returned:records.length,limit:envelope.limit,moreAvailable:envelope.more_available,total:null}};
}
