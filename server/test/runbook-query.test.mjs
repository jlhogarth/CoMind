import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRunbookQueryService } from '../dist/runbook/query-service.js';
const token='a'.repeat(48), headers={authorization:`Bearer ${token}`};
const principals=[{id:'test',token,projects:['COMIND']}];
const payload={project:'COMIND',kind:'events'};
test('authentication, scope and strict bounds precede DB access',async()=>{
 let calls=0;const app=buildRunbookQueryService(async()=>{calls++;return {rows:[]};},principals);
 try{for(const [h,p,status] of [[{},payload,401],[headers,{...payload,project:'OTHER'},403],
 [headers,{...payload,sql:'delete'},400],[headers,{...payload,limit:101},400],[headers,{...payload,since:'yesterday'},400]]){
 assert.equal((await app.inject({method:'POST',url:'/v1/runbook/query',headers:h,payload:p})).statusCode,status);
 }assert.equal(calls,0);}finally{await app.close();}
});
test('fixed parameterized SQL, explicit projections, provenance and truncation',async()=>{
 const app=buildRunbookQueryService(async(sql,params)=>{
 assert.match(sql,/FROM comind_pm.v_runbook_timeline/);assert.doesNotMatch(sql,/SELECT \*/);
 assert.deepEqual(params,['COMIND','DRB-002',null,2]);return {rows:[{event_id:'fixture-1'},{event_id:'fixture-2'}]};},principals);
 try{const res=await app.inject({method:'POST',url:'/v1/runbook/query',headers,payload:{...payload,lane:'DRB-002',limit:1}});
 assert.equal(res.statusCode,200);assert.equal(res.headers['cache-control'],'no-store');
 assert.equal(res.json().data.length,1);assert.equal(res.json().more_available,true);
 assert.equal(res.json().source,'comind_pm.v_runbook_timeline');}finally{await app.close();}
});
test('database failure and oversized evidence fail closed',async()=>{
 for(const [read,status] of [[async()=>{throw Error('secret URL');},503],[async()=>({rows:[{evidence:'x'.repeat(262145)}]}),413]]){
 const app=buildRunbookQueryService(read,principals);try{
 const res=await app.inject({method:'POST',url:'/v1/runbook/query',headers,payload});
 assert.equal(res.statusCode,status);assert.doesNotMatch(res.body,/secret URL/);
 }finally{await app.close();}}
});
test('per principal rate control resets',async()=>{
 let time=0,calls=0;const app=buildRunbookQueryService(async()=>{calls++;return {rows:[]};},principals,()=>time);
 try{for(let i=0;i<60;i++)assert.equal((await app.inject({method:'POST',url:'/v1/runbook/query',headers,payload})).statusCode,200);
 assert.equal((await app.inject({method:'POST',url:'/v1/runbook/query',headers,payload})).statusCode,429);
 assert.equal(calls,60);time=60000;
 assert.equal((await app.inject({method:'POST',url:'/v1/runbook/query',headers,payload})).statusCode,200);
 }finally{await app.close();}
});
test('all query surfaces select the expected view',async()=>{
 for(const [kind,view] of [['lanes','lane_state'],['events','timeline'],['authority','authority'],['verifications','verification']]){
 const app=buildRunbookQueryService(async(sql,params)=>{assert.match(sql,new RegExp('comind_pm.v_runbook_'+view));
 assert.equal(params[2],'2026-10-17T00:00:00Z');return {rows:[]};},principals);
 try{assert.equal((await app.inject({method:'POST',url:'/v1/runbook/query',headers,payload:{...payload,kind,since:'2026-10-17T00:00:00Z'}})).statusCode,200);
 }finally{await app.close();}}
});
test('concurrent capacity rejects the fifth query',async()=>{
 const releases=[];const app=buildRunbookQueryService(()=>new Promise(resolve=>releases.push(()=>resolve({rows:[]}))),principals);
 try{await app.ready();const requests=Array.from({length:4},()=>app.inject({method:'POST',url:'/v1/runbook/query',headers,payload}));
 while(releases.length<4)await new Promise(resolve=>setImmediate(resolve));
 assert.equal((await app.inject({method:'POST',url:'/v1/runbook/query',headers,payload})).statusCode,429);
 releases.forEach(release=>release());assert.ok((await Promise.all(requests)).every(res=>res.statusCode===200));
 }finally{releases.forEach(release=>release());await app.close();}
});
test('lane projection adds canonical UUIDs and explicit fields without arbitrary metadata',async()=>{
 const app=buildRunbookQueryService(async(sql,params)=>{
  assert.match(sql,/w\.id,w\.project_id,w\.item_type/);
  assert.match(sql,/JOIN comind_pm\.pm_work_items w ON w\.work_key = s\.work_key AND w\.item_type = 'lane'/);
  assert.match(sql,/s\.owner/);assert.doesNotMatch(sql,/metadata|SELECT \*/);
  assert.deepEqual(params,['COMIND',null,null,26]);return {rows:[]};
 },principals);
 try{
  const res=await app.inject({method:'POST',url:'/v1/runbook/query',headers,payload:{project:'COMIND',kind:'lanes'}});
  assert.equal(res.statusCode,200);assert.equal(res.json().limit,25);
  assert.deepEqual(res.json().source_relations,['comind_pm.v_runbook_lane_state','comind_pm.pm_work_items']);
 }finally{await app.close();}
});
