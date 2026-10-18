import test from 'node:test';import assert from 'node:assert/strict';
import {projectRunbookDecisions} from '../src/drb-decisions.mjs';
const id='00000000-0000-4000-8000-000000000001';
const fixture=()=>({version:'drb-002.v1',kind:'decisions',source:'comind_pm.pm_decision_records',
 source_relations:['comind_pm.pm_decision_records','comind_pm.pm_work_items','comind_pm.pm_projects'],request_id:id,
 project:'COMIND',lane:null,limit:25,more_available:false,retrieved_at:'2026-10-18T01:00:00Z',
 data:[{id,work_item_id:'00000000-0000-4000-8000-000000000002',project_id:'00000000-0000-4000-8000-000000000003',
 project_key:'COMIND',item_type:'lane',work_key:'PI-001',decision_needed:'Synthetic decision',options_json:'["a","b"]',
 selected_option:null,rationale:null,reversibility:'unknown',decided_by:null,decided_at:null,created_at:'2026-10-18T00:00:00Z',updated_at:'2026-10-18T00:00:00Z'}]});
test('project-decision projection preserves its source domain and relational identities',()=>{
 const input=fixture(),before=structuredClone(input),out=projectRunbookDecisions(input,'COMIND');
 assert.deepEqual(input,before);const [r]=out.records;assert.equal(r.sourceRelation,'comind_pm.pm_decision_records');
 assert.equal(r.sourceId,id);assert.equal(r.source.work_item_id,input.data[0].work_item_id);assert.equal(r.source.options_json,'["a","b"]');
 assert.equal(r.revision,null);assert.equal(r.decisionEnabled,false);assert.equal(out.coverage.total,null);
 assert.ok(r.blockers.some(x=>x.input==='concurrency revision'));
});
test('project-decision adapter rejects wrong project, missing joins, duplicate IDs and invalid provenance',()=>{
 for(const modify of [x=>x.project='OTHER',x=>x.data[0].project_key='OTHER',x=>delete x.data[0].work_item_id,
  x=>x.source_relations=['comind_pm.pm_decision_records'],x=>x.data.push(x.data[0]),x=>x.request_id='bad']){
  const x=fixture();modify(x);assert.throws(()=>projectRunbookDecisions(x,'COMIND'));
 }
});
