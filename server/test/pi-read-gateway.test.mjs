import test from 'node:test';import assert from 'node:assert/strict';
import {createServer} from 'node:http';import {randomBytes,randomUUID} from 'node:crypto';
import {buildPiReadGateway} from '../dist/primary-interface/read-gateway.js';
const session={id:'operator-fixture',token:randomBytes(32).toString('hex'),projects:['COMIND'],expiresAt:'2099-01-01T00:00:00Z'};
const backend={...session,id:'reader-fixture',token:randomBytes(32).toString('hex')};
const headers={cookie:'__Host-comind_pi='+session.token};
async function setup(handler=(_req,res)=>res.end('{}'),extra={}){
 const server=createServer(handler);await new Promise(r=>server.listen(0,'127.0.0.1',r));const audit=[];
 const app=await buildPiReadGateway({upstream:`http://127.0.0.1:${server.address().port}`,origin:'http://127.0.0.1:8000',backendId:backend.id,
 loadSessions:async()=>[session],loadBackend:async()=>[backend],audit:async r=>audit.push(structuredClone(r)),...extra});
 return {app,audit,close:async()=>{await app.close();server.closeAllConnections();await new Promise(r=>server.close(r));}};
}
const query='/api/pi/lanes?project=COMIND';
test('authentication, expiry, scope and cross-origin denial precede DRB access',async()=>{
 let calls=0,principals=[session];const x=await setup(()=>{calls++;},{loadSessions:async()=>principals});
 try{
  for(const [url,h,status] of [[query,{},401],[query,{cookie:headers.cookie+'; '+headers.cookie},401],
   ['/api/pi/lanes?project=OTHER',headers,403],[query,{...headers,origin:'https://evil.invalid'},403],
   [query,{...headers,'sec-fetch-site':'cross-site'},403],[query+'&sql=delete',headers,400]])assert.equal((await x.app.inject({url,headers:h})).statusCode,status);
  for(const patch of [{disabled:true},{expiresAt:'2000-01-01T00:00:00Z'},{token:randomBytes(32).toString('hex')}]){
   principals=[{...session,...patch}];assert.equal((await x.app.inject({url:query,headers})).statusCode,401);
  }
  assert.equal(calls,0);assert.equal(JSON.stringify(x.audit).includes(session.token),false);
 }finally{await x.close();}
});
test('successful read uses backend credential and strips unreviewed response fields',async()=>{
 const id=randomUUID();const x=await setup(async(req,res)=>{
  assert.equal(req.headers.authorization,'Bearer '+backend.token);let body='';for await(const chunk of req)body+=chunk;
  assert.deepEqual(JSON.parse(body),{project:'COMIND',limit:25,kind:'lanes'});
  res.setHeader('content-type','application/json');res.end(JSON.stringify({version:'drb-002.v1',request_id:id,retrieved_at:new Date().toISOString(),source:'comind_pm.v_runbook_lane_state',source_relations:['comind_pm.v_runbook_lane_state','comind_pm.pm_work_items'],project:'COMIND',lane:null,limit:25,kind:'lanes',more_available:false,private:backend.token,data:[{id,project_id:randomUUID(),project_key:'COMIND',item_type:'lane',work_key:'PI-TEST',private:backend.token}]}));
 });
 try{const out=await x.app.inject({url:query,headers});assert.equal(out.statusCode,200);assert.equal(out.json().data[0].id,id);
  assert.equal(out.headers['cache-control'],'no-store');assert.doesNotMatch(out.body,new RegExp(backend.token));assert.equal(out.json().private,undefined);
 }finally{await x.close();}
});
test('project decisions use the same trusted session boundary and preserve source joins',async()=>{
 const id=randomUUID(),workItem=randomUUID(),projectId=randomUUID();let calls=0;
 const x=await setup(async(req,res)=>{
  calls++;assert.equal(req.headers.authorization,'Bearer '+backend.token);let body='';for await(const chunk of req)body+=chunk;
  assert.deepEqual(JSON.parse(body),{project:'COMIND',limit:25,kind:'decisions'});
  res.setHeader('content-type','application/json');res.end(JSON.stringify({version:'drb-002.v1',request_id:id,retrieved_at:new Date().toISOString(),
   source:'comind_pm.pm_decision_records',source_relations:['comind_pm.pm_decision_records','comind_pm.pm_work_items','comind_pm.pm_projects'],
   project:'COMIND',lane:null,kind:'decisions',limit:25,more_available:false,private:backend.token,data:[{id,work_item_id:workItem,project_id:projectId,
   project_key:'COMIND',item_type:'lane',work_key:'PI-001',decision_needed:'Synthetic decision',options_json:'[]',selected_option:null,rationale:null,
   reversibility:'unknown',decided_by:null,decided_at:null,created_at:new Date().toISOString(),updated_at:new Date().toISOString(),private:backend.token}]}));
 });
 try{
  const out=await x.app.inject({url:'/api/pi/decisions?project=COMIND',headers});assert.equal(out.statusCode,200);
  assert.equal(out.json().data[0].work_item_id,workItem);assert.equal(out.json().data[0].private,undefined);assert.doesNotMatch(out.body,new RegExp(backend.token));
  assert.equal(x.audit.at(-1).operation,'pi.decisions');
  assert.equal((await x.app.inject({url:'/api/pi/decisions?project=OTHER',headers})).statusCode,403);assert.equal(calls,1);
 }finally{await x.close();}
});
test('Foundry request read uses native UUID scope, separate session allowlist and reviewed fields',async()=>{
 const projectId=randomUUID(),requestId=randomUUID(),profileId=randomUUID(),actorId=randomUUID(),capabilityId=randomUUID();
 const foundrySession={...session,foundryProjectIds:[projectId]};let reads=0;
 const x=await setup(undefined,{loadSessions:async()=>[foundrySession],readFoundry:async(project,limit)=>{
  reads++;assert.equal(project,projectId);assert.equal(limit,25);
  return {moreAvailable:false,rows:[{authorization_request_id:requestId,requesting_profile_id:profileId,
   requesting_actor_id:actorId,capability_id:capabilityId,project_id:projectId,task_id:null,authority_level:'C1',
   environment:'isolated',target_kind:'github_issue',target_ref:'142',reason:'Synthetic reason',
   evidence_refs:[{kind:'issue',ref:'142'}],status:'pending',requested_at:new Date().toISOString(),expires_at:null,unreviewed_private:'secret'}]};
 }});
 try{
  const out=await x.app.inject({url:'/api/pi/foundry-requests?project_id='+projectId,headers});
  assert.equal(out.statusCode,200);assert.equal(out.json().source,'comind.cm_foundry_authorization_request');
  assert.equal(out.json().data[0].authorization_request_id,requestId);assert.equal(out.json().data[0].project_id,projectId);
  assert.equal(out.json().data[0].unreviewed_private,undefined);assert.equal(out.json().data[0].decisionEnabled,undefined);
  assert.equal(x.audit.at(-1).operation,'pi.foundry');assert.equal(x.audit.at(-1).project,projectId);
  assert.equal((await x.app.inject({url:'/api/pi/foundry-requests?project_id='+randomUUID(),headers})).statusCode,403);
  assert.equal((await x.app.inject({url:'/api/pi/foundry-requests?project_id=not-a-uuid',headers})).statusCode,400);
  assert.equal(reads,1);
 }finally{await x.close();}
});
test('decision source mismatch, redirect and audit failure withhold the entire result',async()=>{
 const id=randomUUID(),body={version:'drb-002.v1',request_id:id,retrieved_at:new Date().toISOString(),
  source:'comind_pm.pm_decision_records',source_relations:['comind_pm.pm_decision_records','comind_pm.pm_work_items','comind_pm.pm_projects'],
  project:'OTHER',lane:null,kind:'decisions',limit:25,more_available:false,data:[]};
 for(const handler of [(_q,r)=>{r.setHeader('content-type','application/json');r.end(JSON.stringify(body));},
  (_q,r)=>{r.statusCode=302;r.setHeader('location','https://evil.invalid');r.end();},
  (_q,r)=>{r.setHeader('content-type','application/json');r.end(JSON.stringify({...body,project:'COMIND',source:'unreviewed.relation'}));}]){
  const x=await setup(handler);try{
   const result=await x.app.inject({url:'/api/pi/decisions?project=COMIND',headers});assert.ok([502,503].includes(result.statusCode));
   assert.equal(result.json().data,undefined);
  }finally{await x.close();}
 }
 const audit=await setup(undefined,{audit:async()=>{throw Error('private audit path');}});
 try{const result=await audit.app.inject({url:'/api/pi/decisions?project=COMIND',headers});assert.equal(result.statusCode,503);assert.equal(result.json().data,undefined);}
 finally{await audit.close();}
});
test('upstream redirects, invalid scope, oversized bodies and timeout fail closed',async()=>{
 const handlers=[(_q,r)=>{r.statusCode=302;r.setHeader('Location','https://evil.invalid');r.end();},
 (_q,r)=>{r.setHeader('content-type','application/json');r.end(JSON.stringify({project:'OTHER'}));},
 (_q,r)=>{r.setHeader('content-type','application/json');r.end('x'.repeat(262145));},()=>{}];
 for(const handler of handlers){const x=await setup(handler,{timeoutMs:50});try{
  const out=await x.app.inject({url:query,headers});assert.ok([502,503].includes(out.statusCode));assert.equal(out.json().data,undefined);
 }finally{await x.close();}}
});
test('credential store and audit failure redact details and withhold data',async()=>{
 for(const extra of [{loadSessions:async()=>{throw Error('private path');}},{loadBackend:async()=>{throw Error('private path');}},{audit:async()=>{throw Error('private path');}}]){
  const x=await setup((_q,r)=>{r.statusCode=503;r.end();},extra);try{const out=await x.app.inject({url:query,headers});assert.equal(out.statusCode,503);assert.doesNotMatch(out.body,/private path/);}finally{await x.close();}
 }
});
test('untrusted upstream origins and repeated unauthenticated requests are rejected',async()=>{
 await assert.rejects(buildPiReadGateway({upstream:'https://evil.invalid',origin:'http://127.0.0.1:8000'}));
 const x=await setup();try{for(let i=0;i<120;i++)assert.equal((await x.app.inject({url:query})).statusCode,401);
 assert.equal((await x.app.inject({url:query})).statusCode,429);}finally{await x.close();}
});
test('RunBook timeline preserves canonical event scope, strips extras and enforces session boundary',async()=>{
 const eventId=randomUUID(),occurredAt=new Date().toISOString(),body={version:'drb-002.v1',request_id:randomUUID(),retrieved_at:new Date().toISOString(),
  source:'comind_pm.v_runbook_timeline',source_relations:['comind_pm.v_runbook_timeline','comind_pm.pm_events','comind_pm.pm_work_items'],project:'COMIND',lane:'DRB-E2E',kind:'events',limit:1,
  more_available:true,next_cursor:{occurred_at:occurredAt,event_id:eventId},data:[{event_id:eventId,project_id:randomUUID(),event_project_id:null,work_item_id:null,work_item_project_id:null,item_type:null,project_key:'COMIND',work_key:'DRB-E2E',occurred_at:occurredAt,action_summary:'Synthetic event',
   result_summary:'Recorded',outcome:'pass',next_action:null,source_system:'test',source_ref:'test-reference',evidence:[],private:backend.token}]};
 let calls=0;const x=await setup(async(req,res)=>{
  calls++;assert.equal(req.headers.authorization,'Bearer '+backend.token);let request='';for await(const part of req)request+=part;
  assert.deepEqual(JSON.parse(request),{project:'COMIND',lane:'DRB-E2E',limit:1,kind:'events'});
  res.setHeader('content-type','application/json');res.end(JSON.stringify(body));
 });
 try{
  const query='/api/pi/events?project=COMIND&lane=DRB-E2E&limit=1';
  assert.equal((await x.app.inject({url:query})).statusCode,401);
  const result=await x.app.inject({url:query,headers});assert.equal(result.statusCode,200);assert.equal(result.json().data[0].event_id,eventId);
  assert.equal(result.json().data[0].private,undefined);assert.equal(result.headers['cache-control'],'no-store');assert.equal(x.audit.at(-1).operation,'pi.events');
  assert.equal((await x.app.inject({url:'/api/pi/events?project=OTHER',headers})).statusCode,403);
  assert.equal((await x.app.inject({url:query,headers:{...headers,origin:'https://evil.invalid'}})).statusCode,403);
  body.data[0].project_key='OTHER';assert.equal((await x.app.inject({url:query,headers})).statusCode,503);
  assert.equal(calls,2);assert.equal(JSON.stringify(x.audit).includes('Synthetic event'),false);
 }finally{await x.close();}
});
