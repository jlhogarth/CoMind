import test from 'node:test';
import assert from 'node:assert/strict';
import { projectFoundryRequests } from '../src/foundry-requests.mjs';

const projectId='11111111-1111-4111-8111-111111111111';
const row={authorization_request_id:'22222222-2222-4222-8222-222222222222',
 requesting_profile_id:'33333333-3333-4333-8333-333333333333',requesting_actor_id:'44444444-4444-4444-8444-444444444444',
 capability_id:'55555555-5555-4555-8555-555555555555',project_id:projectId,task_id:null,authority_level:'C1',
 environment:'isolated',target_kind:'github_issue',target_ref:'142',reason:'Synthetic fixture reason',
 evidence_refs:[{kind:'github_issue',ref:'142'}],status:'pending',requested_at:'2026-10-18T12:00:00Z',expires_at:null};
const envelope={version:'pi-foundry.v1',request_id:'66666666-6666-4666-8666-666666666666',
 retrieved_at:'2026-10-18T12:01:00Z',source:'comind.cm_foundry_authorization_request',project_id:projectId,
 limit:25,source_relations:['comind.cm_foundry_authorization_request'],more_available:false,data:[row]};

test('preserves canonical Foundry IDs and marks assessment controls unavailable',()=>{
 const projection=projectFoundryRequests(envelope,projectId);
 assert.equal(projection.records[0].id,row.authorization_request_id);
 assert.equal(projection.records[0].source.requesting_profile_id,row.requesting_profile_id);
 assert.equal(projection.records[0].source.evidence_refs[0].ref,'142');
 assert.equal(projection.observedAt,envelope.retrieved_at);
 assert.equal(projection.coverage.total,null);
 assert.equal(projection.records[0].decisionEnabled,false);
});
test('rejects mismatched project, repeated IDs, invalid vocabulary and unsupported source',()=>{
 for(const bad of [
  {...envelope,project_id:'77777777-7777-4777-8777-777777777777'},
  {...envelope,data:[row,row]},
  {...envelope,data:[{...row,status:'running'}]},
  {...envelope,source:'unreviewed.source'},
  {...envelope,source_relations:['comind.cm_foundry_authorization_request','comind.cm_foundry_agent_profile']},
 ])assert.throws(()=>projectFoundryRequests(bad,projectId));
});
