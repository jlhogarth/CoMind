import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, chmod, rm, symlink, rename } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildRunbookQueryService } from '../dist/runbook/query-service.js';
import { createFileAudit, loadPrivatePrincipals } from '../dist/runbook/security.js';
const token='a'.repeat(48), nextToken='b'.repeat(48);
const principal={id:'fixture',token,expiresAt:'2099-01-01T00:00:00Z',projects:['COMIND']};
const headers={authorization:'Bearer '+token};
const payload={project:'COMIND',kind:'events'};
const request={method:'POST',url:'/v1/runbook/query',headers,payload};

test('expiry, revocation and rotation take effect before querying the DB',async()=>{
 let config=[principal],calls=0,time=Date.parse('2026-10-17T00:00:00Z');
 const audit=[];
 const app=buildRunbookQueryService(async()=>{calls++;return {rows:[]};},config,()=>time,{
  loadPrincipals:async()=>config,audit:async record=>audit.push(structuredClone(record)),
 });
 try{
  assert.equal((await app.inject(request)).statusCode,200);
  config=[{...principal,disabled:true}];assert.equal((await app.inject(request)).statusCode,401);
  config=[{...principal,expiresAt:'2026-10-17T00:00:00Z'}];assert.equal((await app.inject(request)).statusCode,401);
  config=[{...principal,token:nextToken}];assert.equal((await app.inject(request)).statusCode,401);
  assert.equal((await app.inject({...request,headers:{authorization:'Bearer '+nextToken}})).statusCode,200);
  assert.equal(calls,2);assert.equal(audit.length,5);
  assert.equal(JSON.stringify(audit).includes(token),false);
 }finally{await app.close();}
});
test('credential loader and audit failure withhold data without leaking contents',async()=>{
 for(const options of [{loadPrincipals:async()=>{throw Error('sensitive credential path');}},
   {audit:async()=>{throw Error('sensitive audit path');}}]){
  const app=buildRunbookQueryService(async()=>({rows:[{summary:'sensitive evidence'}]}),[principal],Date.now,options);
  try{const res=await app.inject(request);assert.equal(res.statusCode,503);
   assert.doesNotMatch(res.body,/sensitive/);
  }finally{await app.close();}
 }
});
test('audit covers parsing failures, unsupported routes and rejects before authentication',async()=>{
 const audit=[];let calls=0;
 const app=buildRunbookQueryService(async()=>{calls++;return {rows:[]};},[principal],Date.now,{audit:async r=>audit.push({...r})});
 try{
  const bad=await app.inject({...request,payload:'{broken',headers:{...headers,'content-type':'application/json'}});
  assert.equal(bad.statusCode,400);
  assert.equal((await app.inject({method:'GET',url:'/unsupported?secret=excluded'})).statusCode,404);
  for(let i=0;i<298;i++)assert.equal((await app.inject({...request,headers:{}})).statusCode,401);
  assert.equal((await app.inject({...request,headers:{}})).statusCode,429);
  assert.equal(calls,0);assert.equal(audit.length,301);
  assert.equal(JSON.stringify(audit).includes('excluded'),false);
 }finally{await app.close();}
});
test('private file credentials enforce permissions and reload atomically replaced contents',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'drb-security-'));
 try{
  const path=join(dir,'principals.json');await writeFile(path,JSON.stringify([principal]),{mode:0o600});
  assert.equal((await loadPrivatePrincipals(path))[0].token,token);
  const replacement=join(dir,'replacement.json');
  await writeFile(replacement,JSON.stringify([{...principal,token:nextToken}]),{mode:0o600});
  await rename(replacement,path);
  assert.equal((await loadPrivatePrincipals(path))[0].token,nextToken);
  await chmod(path,0o644);await assert.rejects(loadPrivatePrincipals(path),/permissions/);
  await chmod(path,0o600);const linked=join(dir,'linked');await symlink(path,linked);
  await assert.rejects(loadPrivatePrincipals(linked));
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('audit serializes concurrent appends, persists JSON and fails closed at capacity',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'drb-audit-'));
 const record={request_id:'fixture-request',observed_at:'2026-10-17T00:00:00Z',principal_id:'fixture',operation:'runbook.query',status:200,project:'COMIND',kind:'events'};
 try{
  const path=join(dir,'audit.jsonl'),audit=createFileAudit(path);
  await Promise.all(Array.from({length:10},(_,i)=>audit({...record,request_id:'fixture-'+i})));
  const lines=(await readFile(path,'utf8')).trim().split('\n').map(JSON.parse);
  assert.equal(lines.length,10);assert.equal(new Set(lines.map(r=>r.request_id)).size,10);
  const bounded=createFileAudit(join(dir,'bounded.jsonl'),Buffer.byteLength(JSON.stringify(record)+'\n'));
  await bounded(record);await assert.rejects(bounded(record),/capacity/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
