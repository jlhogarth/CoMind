import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
import {projectRunbookEvents} from '../src/drb-events.mjs';import {readTrustedEvents} from '../src/trusted-reader.mjs';
const envelope=()=>{const project= randomUUID(),workItem=randomUUID(),eventId=randomUUID(),occurredAt='2026-10-18T20:59:00Z';return {version:'drb-002.v1',kind:'events',source:'comind_pm.v_runbook_timeline',source_relations:['comind_pm.v_runbook_timeline','comind_pm.pm_events','comind_pm.pm_work_items'],
 project:'COMIND',lane:'DRB-E2E',limit:1,more_available:true,next_cursor:{occurred_at:occurredAt,event_id:eventId},request_id:randomUUID(),retrieved_at:'2026-10-18T21:00:00Z',data:[{event_id:eventId,project_id:project,event_project_id:project,work_item_id:workItem,work_item_project_id:project,item_type:'lane',
 project_key:'COMIND',work_key:'DRB-E2E',occurred_at:occurredAt,action_summary:'Synthetic failure',result_summary:'Source claim',outcome:'fail',
 next_action:'Review',source_system:'test',source_ref:'javascript:untrusted-reference',evidence:[{note:'<img src=x onerror=alert(1)>'}]}]};};
test('RunBook projection preserves bounded historical evidence without claiming current authority',()=>{
 const input=envelope(),out=projectRunbookEvents(input,'COMIND');assert.equal(out.records[0].sourceId,input.data[0].event_id);
 assert.equal(out.records[0].source.source_ref,'javascript:untrusted-reference');assert.equal(out.records[0].decisionEnabled,false);
 assert.equal(out.records[0].sourceRelation,'comind_pm.v_runbook_timeline');assert.equal(out.records[0].observedAt,input.retrieved_at);
 assert.equal(out.records[0].lifecycle,null);assert.equal(out.records[0].revision,null);
 assert.equal(out.records[0].blockers.length,3);assert.equal(out.coverage.total,null);assert.equal(out.coverage.moreAvailable,true);
 assert.equal(out.retrieval.requestId,input.request_id);
 out.records[0].source.evidence[0].note='changed';assert.notEqual(input.data[0].evidence[0].note,'changed');
 const empty={...envelope(),data:[],more_available:false,next_cursor:null};assert.equal(projectRunbookEvents(empty,'COMIND').records.length,0);
});
test('RunBook projection rejects wrong scope, duplicate IDs, absent provenance and malformed payloads',()=>{
 for(const patch of [{project:'OTHER'},{kind:'decisions'},{source:'unreviewed.events'},{source_relations:[]},{request_id:'bad'},
 {retrieved_at:'yesterday'},{limit:0},{limit:101},{more_available:null},{lane:undefined}])assert.throws(()=>projectRunbookEvents({...envelope(),...patch},'COMIND'));
 for(const patch of [{project_key:'OTHER'},{project_id:'bad'},{event_project_id:randomUUID()},{work_item_id:'bad'},{work_item_project_id:'bad'},{work_key:'OTHER-LANE'},{event_id:'bad'},{occurred_at:'invalid'},{evidence:{}},{action_summary:{}}]){
  const input=envelope();input.data[0]={...input.data[0],...patch};assert.throws(()=>projectRunbookEvents(input,'COMIND'));
 }
 const input=envelope();input.limit=2;input.data.push({...input.data[0]});assert.throws(()=>projectRunbookEvents(input,'COMIND'),/scope/);
});
test('event canonical projection excludes unreviewed fields and rejects malformed evidence arrays',()=>{
 const input=envelope();input.data[0].unreviewed_secret='not released';
 const out=projectRunbookEvents(input,'COMIND');assert.equal(JSON.stringify(out).includes('unreviewed_secret'),false);
 input.data[0].evidence={secret:'must remain array'};assert.throws(()=>projectRunbookEvents(input,'COMIND'));
});
test('event cursor preserves microseconds, UUID order, and strict progress',()=>{
 const input=envelope(),last=input.data[0];last.event_id='00000000-0000-4000-8000-000000000001';last.occurred_at='2026-10-18T20:59:00.000400Z';
 const first={...last,event_id:'00000000-0000-4000-8000-000000000002',occurred_at:'2026-10-18T20:59:00.000500Z'};
 input.limit=2;input.data=[first,last];input.more_available=true;input.next_cursor={occurred_at:last.occurred_at,event_id:last.event_id};
 assert.equal(projectRunbookEvents(input,'COMIND').records.length,2);
 assert.throws(()=>projectRunbookEvents(input,'COMIND',{occurred_at:'2026-10-18T20:59:00.000500Z',event_id:first.event_id}),/advance/);
 const wrongOrder={...input,data:[last,first]};assert.throws(()=>projectRunbookEvents(wrongOrder,'COMIND'),/order/);
});
test('event retains canonical foreign keys and exposes mismatched project association as a blocker',()=>{
 const input=envelope();input.data[0].work_item_project_id=randomUUID();
 const out=projectRunbookEvents(input,'COMIND');
 assert.equal(out.records[0].source.work_item_id,input.data[0].work_item_id);
 assert.ok(out.records[0].blockers.some(x=>x.operation==='resolve event/work-item project association'));
 input.data[0].work_item_id=null;input.data[0].work_item_project_id=null;input.data[0].item_type=null;
 assert.equal(projectRunbookEvents(input,'COMIND').records[0].source.work_item_id,null);
});
test('event transport fixes route, carries no backend secret and rejects source/query mismatch',async()=>{
 const input=envelope();let request;
 const result=await readTrustedEvents('COMIND',{lane:'DRB-E2E',limit:1,fetchImpl:async(url,options)=>{
  request={url,options};return {ok:true,json:async()=>input};
 }});
 assert.equal(result.status,'ready');assert.equal(result.projection.domain,'events');assert.equal(request.url,'/api/pi/events?project=COMIND&limit=1&lane=DRB-E2E');
 assert.equal(request.options.credentials,'same-origin');assert.equal(request.options.headers,undefined);
 assert.equal(request.options.cache,'no-store');assert.equal(request.options.redirect,'error');
 assert.equal((await readTrustedEvents('COMIND',{fetchImpl:async()=>({ok:true,json:async()=>input})} )).status,'malformed');
 for(const code of [401,403,429,503])assert.equal((await readTrustedEvents('COMIND',{fetchImpl:async()=>({ok:false,status:code})})).envelope,undefined);
 await assert.rejects(readTrustedEvents('COMIND',{lane:'bad/sql'}));
});
test('event transport sends both keyset cursor components without changing project/lane scope',async()=>{
 const input=envelope(),cursor={occurred_at:input.data[0].occurred_at,event_id:'ffffffff-ffff-4fff-8fff-ffffffffffff'};let url;
 const result=await readTrustedEvents('COMIND',{lane:'DRB-E2E',limit:1,cursor,fetchImpl:async(path)=>{url=path;return {ok:true,json:async()=>input};}});
 assert.equal(result.status,'ready');const parsed=new URL(url,'http://reader.test');
 assert.equal(parsed.searchParams.get('project'),'COMIND');assert.equal(parsed.searchParams.get('lane'),'DRB-E2E');
 assert.equal(parsed.searchParams.get('cursor_occurred_at'),cursor.occurred_at);assert.equal(parsed.searchParams.get('cursor_event_id'),cursor.event_id);
});
