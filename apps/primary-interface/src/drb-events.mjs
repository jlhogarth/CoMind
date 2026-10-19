// Read-only, bounded source history. Evidence is data, never execution authority.
import { projectCanonicalPage } from './canonical-projections.mjs';
const uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x);
const instant=x=>typeof x==='string'&&/^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(x)&&Number.isFinite(Date.parse(x));
const epochMicros=x=>{if(!instant(x))return null;const match=x.match(/\.(\d+)(?=Z|[+-]\d\d:\d\d)$/);const fraction=(match?.[1]??'').padEnd(6,'0').slice(0,6);return BigInt(Date.parse(x))*1000n+BigInt(fraction.slice(3));};
export function projectRunbookEvents(envelope,expectedProject,cursor){
 if(typeof expectedProject!=='string'||!/^[A-Z0-9_-]{1,64}$/.test(expectedProject))throw new TypeError('Expected project required');
 if(!envelope||envelope.version!=='drb-002.v1'||envelope.kind!=='events'||envelope.source!=='comind_pm.v_runbook_timeline'
  ||envelope.project!==expectedProject||!uuid(envelope.request_id)||!instant(envelope.retrieved_at)
  ||!Array.isArray(envelope.source_relations)||envelope.source_relations.length!==3||envelope.source_relations[0]!==envelope.source
  ||envelope.source_relations[1]!=='comind_pm.pm_events'||envelope.source_relations[2]!=='comind_pm.pm_work_items'
  ||!(envelope.lane===null||(typeof envelope.lane==='string'&&/^[A-Z0-9_-]{1,64}$/.test(envelope.lane)))
  ||!Number.isInteger(envelope.limit)||envelope.limit<1||envelope.limit>100||typeof envelope.more_available!=='boolean'
  ||(envelope.more_available!==(envelope.next_cursor!==null))
  ||(envelope.next_cursor!==null&&(!envelope.next_cursor||!uuid(envelope.next_cursor.event_id)||!instant(envelope.next_cursor.occurred_at)))
  ||!Array.isArray(envelope.data)||envelope.data.length>envelope.limit)throw new TypeError('Invalid RunBook event envelope');
 const seen=new Set();let previous=null;
 for(const row of envelope.data){
  if(!row||!uuid(row.event_id)||seen.has(row.event_id.toLowerCase())||row.project_key!==expectedProject
   ||!uuid(row.project_id)||(row.event_project_id!==null&&(!uuid(row.event_project_id)||row.event_project_id.toLowerCase()!==row.project_id.toLowerCase()))
   ||(row.work_item_id!==null&&!uuid(row.work_item_id))||(row.work_item_project_id!==null&&!uuid(row.work_item_project_id))
   ||(row.item_type!==null&&(typeof row.item_type!=='string'||row.item_type.length>64))
   ||(row.work_item_id===null&&(row.work_item_project_id!==null||row.item_type!==null))
   ||(row.work_item_id!==null&&(row.work_item_project_id===null||row.item_type===null))
   ||!instant(row.occurred_at)||(envelope.lane!==null&&row.work_key!==envelope.lane)||!Array.isArray(row.evidence))throw new TypeError('Invalid RunBook event scope');
  seen.add(row.event_id.toLowerCase());
  if(previous){const time=epochMicros(previous.occurred_at)-epochMicros(row.occurred_at);
   if(time<0n||(time===0n&&previous.event_id.toLowerCase()<=row.event_id.toLowerCase()))throw new TypeError('RunBook event order is not descending by timestamp and event ID');}
  previous=row;
  for(const field of ['project_key','work_key','action_summary','result_summary','outcome','next_action','source_system','source_ref']){
   const value=row[field]??null;if(value!==null&&(typeof value!=='string'||value.length>65536))throw new TypeError('Invalid event scalar');
  }
 }
 if(envelope.more_available&&(envelope.data.length!==envelope.limit||!previous
  ||epochMicros(envelope.next_cursor.occurred_at)!==epochMicros(previous.occurred_at)
  ||envelope.next_cursor.event_id.toLowerCase()!==previous.event_id.toLowerCase()))throw new TypeError('Invalid RunBook event cursor lineage');
 if(cursor&&(!instant(cursor.occurred_at)||!uuid(cursor.event_id)||envelope.data.some(row=>{
  const delta=epochMicros(row.occurred_at)-epochMicros(cursor.occurred_at);
  return delta>0n||(delta===0n&&row.event_id.toLowerCase()>=cursor.event_id.toLowerCase());
 })))throw new TypeError('RunBook event page did not advance beyond its cursor');
 const output=projectCanonicalPage('events',{state:'ok',observedAt:envelope.retrieved_at,
  scope:`project:${expectedProject};work-item:${envelope.lane??'all'}`,
  limit:envelope.limit,moreAvailable:envelope.more_available,rows:envelope.data});
 for(let i=0;i<output.records.length;i++){
  const row=envelope.data[i];
  if(row.work_item_project_id!==null&&row.work_item_project_id.toLowerCase()!==row.project_id.toLowerCase()){
   output.records[i].blockers.push({operation:'resolve event/work-item project association',input:'matching canonical project UUIDs',resolver:'PI/DRB source owner',evidence:'comind_pm.pm_events.work_item_id'});
  }
 }
 return {...output,retrieval:{requestId:envelope.request_id,source:envelope.source,sourceRelations:[...envelope.source_relations]}};
}
