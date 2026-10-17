import test from 'node:test';
import assert from 'node:assert/strict';
import { projectCanonicalPage as project } from '../src/canonical-projections.mjs';
// Synthetic fixtures only. No live source contents are asserted.
const id = '00000000-0000-4000-8000-000000000001';
const page = rows => ({state:'ok', observedAt:'2026-10-17T20:00:00Z', scope:'synthetic project scope', limit:25, moreAvailable:false, rows});
test('preserves Foundry lifecycle without inventing PI approval readiness', () => {
  for (const status of ['pending','approved','denied','cancelled','expired']) {
    const input = page([{authorization_request_id:id,status,reason:'Synthetic request',evidence_refs:[{secret:'excluded'}],metadata:{secret:'excluded'}}]);
    const before = structuredClone(input);
    const output = project('foundry',input);
    assert.deepEqual(input,before);
    assert.equal(output.records[0].lifecycle,status);
    assert.equal(output.records[0].revision,null);
    assert.equal(output.records[0].decisionEnabled,false);
    assert.equal(output.records[0].blockers.length,4);
    assert.equal(JSON.stringify(output).includes('secret'),false);
  }
});
test('domains cannot collide and project selections do not imply authority', () => {
  const a=project('project',page([{id,selected_option:'yes'}])).records[0];
  const b=project('lanes',page([{id,item_type:'lane',status:'review'}])).records[0];
  assert.notEqual(a.id,b.id); assert.equal(a.lifecycle,null);
  assert.equal(b.lifecycle,'review'); assert.equal(b.source.owner,null);
});
test('states and bounded coverage distinguish empty, unavailable and incomplete', () => {
  for (const state of ['ok','partial','missing','failed','forbidden']) {
    const out=project('foundry',{...page([]),state});
    assert.equal(out.state,state); assert.equal(out.coverage.total,null);
  }
  assert.equal(project('foundry',{...page([]),moreAvailable:true}).coverage.moreAvailable,true);
  assert.throws(()=>project('foundry',{...page([{authorization_request_id:id}]),state:'forbidden'}));
});
test('invalid pages fail without silently dropping records', () => {
  for (const rows of [[{}],[{authorization_request_id:id},{authorization_request_id:id.toUpperCase()}]]) assert.throws(()=>project('foundry',page(rows)));
  for (const patch of [{limit:101},{limit:0},{limit:1,rows:[{},{}]},{observedAt:null},{scope:''},{moreAvailable:null}]) assert.throws(()=>project('foundry',{...page([]),...patch}));
  assert.throws(()=>project('lanes',page([{id,item_type:'task'}])));
  assert.throws(()=>project('project',page([{id,rationale:{html:'unsafe'}}])));
});
test('unknown source lifecycle remains inspectable with resolver and evidence',()=>{
  const r=project('foundry',page([{authorization_request_id:id,status:'new_state'}])).records[0];
  assert.equal(r.lifecycle,'new_state'); assert.equal(r.blockers.at(-1).operation,'interpret lifecycle');
});
