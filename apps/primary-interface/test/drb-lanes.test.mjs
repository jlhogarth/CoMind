import test from 'node:test';
import assert from 'node:assert/strict';
import { projectRunbookLanes } from '../src/drb-lanes.mjs';
// Synthetic source contracts only.
const id='00000000-0000-4000-8000-000000000001';
const fixture=()=>({version:'drb-002.v1',kind:'lanes',source:'comind_pm.v_runbook_lane_state',
 source_relations:['comind_pm.v_runbook_lane_state','comind_pm.pm_work_items'],request_id:id,
 project:'COMIND',lane:null,limit:25,more_available:false,retrieved_at:'2026-10-17T21:00:00Z',
 data:[{id,project_id:id,project_key:'COMIND',item_type:'lane',work_key:'PI-001',status:'review',owner:'Synthetic owner'}]});
test('DRB response preserves canonical lane identity, owner, coverage and retrieval lineage',()=>{
 const input=fixture(),before=structuredClone(input);const out=projectRunbookLanes(input,'COMIND');
 assert.deepEqual(input,before);assert.equal(out.records[0].sourceId,id);
 assert.equal(out.records[0].source.owner,'Synthetic owner');assert.equal(out.coverage.total,null);
 assert.equal(out.retrieval.requestId,id);assert.equal(out.records[0].decisionEnabled,false);
});
test('empty and bounded incomplete DRB responses remain distinct',()=>{
 const input={...fixture(),data:[]};assert.equal(projectRunbookLanes(input,'COMIND').records.length,0);
 assert.equal(projectRunbookLanes({...input,more_available:true},'COMIND').coverage.moreAvailable,true);
});
test('wrong project, lane, provenance, duplicate and absent UUID fail rather than invent identity',()=>{
 for(const modify of [x=>x.project='OTHER',x=>x.lane='OTHER',x=>x.data[0].project_key='OTHER',
 x=>delete x.data[0].id,x=>x.data.push(x.data[0]),x=>x.source_relations=[],x=>x.request_id='bad']){
 const x=fixture();modify(x);assert.throws(()=>projectRunbookLanes(x,'COMIND'));
 }
});
