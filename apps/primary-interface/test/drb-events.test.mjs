import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
import {projectRunbookEvents} from '../src/drb-events.mjs';import {readTrustedEvents} from '../src/trusted-reader.mjs';
const envelope=()=>({version:'drb-002.v1',kind:'events',source:'comind_pm.v_runbook_timeline',source_relations:['comind_pm.v_runbook_timeline'],
 project:'COMIND',lane:'DRB-E2E',limit:1,more_available:true,request_id:randomUUID(),retrieved_at:'2026-10-18T21:00:00Z',data:[{event_id:randomUUID(),
 project_key:'COMIND',work_key:'DRB-E2E',occurred_at:'2026-10-18T20:59:00Z',action_summary:'Synthetic failure',result_summary:'Source claim',outcome:'fail',
 next_action:'Review',source_system:'test',source_ref:'javascript:untrusted-reference',evidence:[{note:'<img src=x onerror=alert(1)>'}]}]});
test('RunBook projection preserves bounded historical evidence without claiming current authority',()=>{
 const input=envelope(),out=projectRunbookEvents(input,'COMIND');assert.equal(out.records[0].sourceId,input.data[0].event_id);
 assert.equal(out.records[0].source.source_ref,'javascript:untrusted-reference');assert.equal(out.records[0].decisionEnabled,false);
 assert.equal(out.records[0].sourceRelation,'comind_pm.v_runbook_timeline');assert.equal(out.records[0].observedAt,input.retrieved_at);
 assert.equal(out.records[0].lifecycle,null);assert.equal(out.records[0].revision,null);
 assert.equal(out.records[0].blockers.length,3);assert.equal(out.coverage.total,null);assert.equal(out.coverage.moreAvailable,true);
 assert.equal(out.retrieval.requestId,input.request_id);
 out.records[0].source.evidence[0].note='changed';assert.notEqual(input.data[0].evidence[0].note,'changed');
 const empty={...envelope(),data:[],more_available:false};assert.equal(projectRunbookEvents(empty,'COMIND').records.length,0);
});
test('RunBook projection rejects wrong scope, duplicate IDs, absent provenance and malformed payloads',()=>{
 for(const patch of [{project:'OTHER'},{kind:'decisions'},{source:'unreviewed.events'},{source_relations:[]},{request_id:'bad'},
 {retrieved_at:'yesterday'},{limit:0},{limit:101},{more_available:null},{lane:undefined}])assert.throws(()=>projectRunbookEvents({...envelope(),...patch},'COMIND'));
 for(const patch of [{project_key:'OTHER'},{work_key:'OTHER-LANE'},{event_id:'bad'},{occurred_at:'invalid'},{evidence:{}},{action_summary:{}}]){
  const input=envelope();input.data[0]={...input.data[0],...patch};assert.throws(()=>projectRunbookEvents(input,'COMIND'));
 }
 const input=envelope();input.limit=2;input.data.push({...input.data[0]});assert.throws(()=>projectRunbookEvents(input,'COMIND'),/scope/);
});
test('event canonical projection excludes unreviewed fields and rejects malformed evidence arrays',()=>{
 const input=envelope();input.data[0].unreviewed_secret='not released';
 const out=projectRunbookEvents(input,'COMIND');assert.equal(JSON.stringify(out).includes('unreviewed_secret'),false);
 input.data[0].evidence={secret:'must remain array'};assert.throws(()=>projectRunbookEvents(input,'COMIND'));
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
