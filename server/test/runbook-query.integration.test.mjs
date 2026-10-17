import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, chmod, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFileAudit, loadPrivatePrincipals } from '../dist/runbook/security.js';
import { randomBytes } from 'node:crypto';
import { Pool } from 'pg';
import { projectRunbookLanes } from '../../apps/primary-interface/src/drb-lanes.mjs';
import { buildRunbookQueryService } from '../dist/runbook/query-service.js';
import { createRunbookReadQuery, verifyRunbookReader } from '../dist/runbook/database.js';

const raw=process.env.DRB_TEST_ADMIN_URL;
test('isolated PostgreSQL 17 reader privilege and HTTP proof',{skip:!raw},async()=>{
 const url=new URL(raw);
 assert.ok(['127.0.0.1','localhost'].includes(url.hostname),'test must be loopback');
 assert.equal(url.pathname,'/drb_test','test database must be drb_test');
 const admin=new Pool({connectionString:raw});let reader,app,privateDirectory;
 try{
  const version=await admin.query('show server_version_num');assert.ok(Number(version.rows[0].server_version_num)>=170000);
  assert.equal((await admin.query("select to_regnamespace('comind_pm') as n")).rows[0].n,null,'requires fresh disposable database');
  for(const file of ['db/test/bootstrap_supabase_compat.sql','db/migrations/20261006_001_comind_pm_ledger.sql',
    'db/migrations/20261006_002_comind_pm_ledger_hardening.sql','db/migrations/20261016_001_durable_runbook_foundation.sql']){
   await admin.query(await readFile(new URL('../../'+file,import.meta.url),'utf8'));
  }
  const password=randomBytes(32).toString('hex');
  await admin.query(`CREATE ROLE comind_runbook_query_login LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`);
  await admin.query(await readFile(new URL('../../db/test/drb_002_reader.sql',import.meta.url),'utf8'));
  await admin.query(`INSERT INTO comind_pm.pm_projects(project_key,name) VALUES ('OTHER','Synthetic other project');
    INSERT INTO comind_pm.pm_work_items(project_id,work_key,title,item_type) SELECT id, project_key||'-FIXTURE', 'Synthetic lane', 'lane' FROM comind_pm.pm_projects;
    INSERT INTO comind_pm.pm_events(project_id,work_item_id,event_type,actor,summary) SELECT project_id,id,'action','test fixture','Synthetic event' FROM comind_pm.pm_work_items WHERE work_key like '%-FIXTURE';
    INSERT INTO comind_pm.pm_authorizations(project_id,work_item_id,event_id,authorization_type,decision,scope,authorized_by)
      SELECT project_id,work_item_id,id,'approval','approved','Synthetic scope','test fixture' FROM comind_pm.pm_events WHERE summary='Synthetic event';
    INSERT INTO comind_pm.pm_verifications(project_id,work_item_id,event_id,verification_type,check_name,outcome,verified_by)
      SELECT project_id,work_item_id,id,'fixture','Synthetic check','pass','test fixture' FROM comind_pm.pm_events WHERE summary='Synthetic event';`);
  url.username='comind_runbook_query_login';url.password=password;
  reader=new Pool({connectionString:url.toString(),max:1});
  await verifyRunbookReader(reader);
  await assert.rejects(verifyRunbookReader(admin),/least-privilege/);
  await admin.query('grant update on comind_pm.pm_projects to comind_runbook_query_login');
  await assert.rejects(verifyRunbookReader(reader),/least-privilege/);
  await admin.query('revoke update on comind_pm.pm_projects from comind_runbook_query_login');
  await admin.query('alter table comind_pm.pm_projects disable row level security');
  await assert.rejects(verifyRunbookReader(reader),/least-privilege/);
  await admin.query('alter table comind_pm.pm_projects enable row level security');
  await verifyRunbookReader(reader);
  for(const view of ['lane_state','timeline','authority','verification']){
   const result=await reader.query(`select project_key from comind_pm.v_runbook_${view}`);
   assert.ok(result.rows.length>0);assert.ok(result.rows.every(r=>r.project_key==='COMIND'));
  }
  for(const sql of ["insert into comind_pm.pm_projects(project_key,name) values ('EVIL','denied')",
    "update comind_pm.pm_work_items set title='denied'",'delete from comind_pm.pm_events',
    'truncate comind_pm.pm_events cascade','create table public.denied(id int)','set role service_role',
    'select * from comind_pm.pm_snapshots']){
   await assert.rejects(reader.query(sql),error=>error.code==='42501');
  }
  const read=createRunbookReadQuery(reader);
  await assert.rejects(read('select 1/0',[]));
  assert.equal((await read('select 42 as answer',[])).rows[0].answer,42,'connection recovers after rollback');
  await assert.rejects(read('select pg_sleep(5)',[]),error=>error.code==='57014');
  assert.equal((await read('select 42 as answer',[])).rows[0].answer,42,'connection recovers after timeout');
  const token=randomBytes(32).toString('hex');
  privateDirectory=await mkdtemp(join(tmpdir(),'drb-integration-'));
  const credentialPath=join(privateDirectory,'principals.json'),auditPath=join(privateDirectory,'access.jsonl');
  const identity={id:'fixture-consumer',token,expiresAt:'2099-01-01T00:00:00Z',projects:['COMIND','OTHER']};
  await writeFile(credentialPath,JSON.stringify([identity]),{mode:0o600});
  app=buildRunbookQueryService(read,[identity],Date.now,{
    loadPrincipals:()=>loadPrivatePrincipals(credentialPath),audit:createFileAudit(auditPath),
  });
  for(const kind of ['lanes','events','authority','verifications']){
   for(const project of ['COMIND','OTHER']){
    const res=await app.inject({method:'POST',url:'/v1/runbook/query',headers:{authorization:'Bearer '+token},payload:{kind,project}});
    assert.equal(res.statusCode,200);assert.equal(res.json().data.length>0,project==='COMIND');
    if(kind==='lanes' && project==='COMIND') {
     const projected=projectRunbookLanes(res.json(),'COMIND');
     const canonical=(await admin.query("select id,project_id from comind_pm.pm_work_items where work_key='COMIND-FIXTURE'")).rows[0];
     assert.equal(projected.records[0].sourceId,canonical.id);
     assert.equal(projected.records[0].source.project_id,canonical.project_id);
     assert.equal(projected.records[0].source.owner,null);
     assert.equal(projected.records[0].source.item_type,'lane');
     assert.equal(projected.coverage.total,null);
    }
   }
  }
  const req={method:'POST',url:'/v1/runbook/query',headers:{authorization:'Bearer '+token},payload:{kind:'lanes',project:'COMIND'}};
  await writeFile(credentialPath,JSON.stringify([{...identity,disabled:true}]));
  assert.equal((await app.inject(req)).statusCode,401,'revocation applies before DB read');
  await writeFile(credentialPath,JSON.stringify([identity]));
  await chmod(auditPath,0o644);
  const withheld=await app.inject(req);assert.equal(withheld.statusCode,503);assert.equal(withheld.json().data,undefined);
  await chmod(auditPath,0o600);assert.equal((await app.inject(req)).statusCode,200);
  const auditRecords=(await readFile(auditPath,'utf8')).trim().split('\n').map(JSON.parse);
  assert.ok(auditRecords.some(r=>r.status===401));assert.ok(auditRecords.some(r=>r.status===200));
  assert.equal(JSON.stringify(auditRecords).includes(token),false);
  const original=(await admin.query("select name from comind_pm.pm_projects where project_key='COMIND'")).rows[0].name;
  await assert.rejects(read("update comind_pm.pm_projects set name='denied'",[]));
  assert.equal((await admin.query("select name from comind_pm.pm_projects where project_key='COMIND'")).rows[0].name,original);
 }finally{if(app)await app.close();if(reader)await reader.end();await admin.end();if(privateDirectory)await rm(privateDirectory,{recursive:true,force:true});}
});
