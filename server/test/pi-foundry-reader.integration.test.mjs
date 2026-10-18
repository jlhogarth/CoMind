import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {buildPiReadGateway} from '../dist/primary-interface/read-gateway.js';
import {createFoundryReadQuery,verifyFoundryReader} from '../dist/foundry-read.js';

const raw=process.env.FOUNDRY_PI_TEST_ADMIN_URL;
test('isolated Foundry request reader enforces restricted login, RLS and PI UUID scope',{skip:!raw},async()=>{
 const adminUrl=new URL(raw);
 assert.ok(['127.0.0.1','localhost'].includes(adminUrl.hostname),'test requires loopback PostgreSQL');
 assert.equal(adminUrl.pathname,'/comind_ci','test requires disposable comind_ci database');
 const admin=new Pool({connectionString:raw});let reader,gateway;
 const projectId='11111111-1111-4111-8111-111111111111',otherProjectId='77777777-7777-4777-8777-777777777777';
 try{
  assert.ok(Number((await admin.query('SHOW server_version_num')).rows[0].server_version_num)>=170000);
  assert.ok((await admin.query("SELECT to_regclass('comind.cm_foundry_authorization_request') AS t")).rows[0].t);
  const password=randomBytes(32).toString('hex');
  await admin.query('DROP ROLE IF EXISTS comind_foundry_query_login');
  await admin.query(`CREATE ROLE comind_foundry_query_login LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT`);
  await admin.query(await (await import('node:fs/promises')).readFile(new URL('../../db/test/pi_foundry_reader.sql',import.meta.url),'utf8'));
  const org=(await admin.query("INSERT INTO comind.cm_org(name,slug) VALUES($1,$2) RETURNING org_id",['PI Foundry Test '+randomUUID(),'pi-foundry-'+randomUUID()])).rows[0].org_id;
  const actor=(await admin.query("INSERT INTO comind.cm_actor(org_id,kind,handle,display_name) VALUES($1,'agent',$2,'Synthetic Foundry reader fixture') RETURNING actor_id",[org,'pi-foundry-'+randomUUID()])).rows[0].actor_id;
  await admin.query("INSERT INTO comind.cm_project(project_id,org_id,title,slug,created_by) VALUES($1,$3,'PI Foundry allowed fixture',$4,$6),($2,$3,'PI Foundry other fixture',$5,$6)",
   [projectId,otherProjectId,org,'pi-foundry-allowed-'+randomUUID(),'pi-foundry-other-'+randomUUID(),actor]);
  const capability=(await admin.query("INSERT INTO comind.cm_foundry_capability(capability_code,description,action,target_kind,max_authority,risk_class,cost_bearing,adapter) VALUES($1,'Synthetic read fixture','read','github_issue','C1','low',false,'github') RETURNING capability_id",['pi.foundry.read.'+randomUUID()])).rows[0].capability_id;
  const allowedId=randomUUID(),hiddenId=randomUUID();
  for(const [id,project,status] of [[allowedId,projectId,'pending'],[hiddenId,otherProjectId,'approved']]){
   await admin.query(`INSERT INTO comind.cm_foundry_authorization_request
    (authorization_request_id,requesting_profile_id,requesting_actor_id,capability_id,project_id,authority_level,environment,target_kind,target_ref,reason,evidence_refs,status)
    VALUES($1,NULL,$2,$3,$4,'C1','isolated','github_issue','142','Synthetic Foundry request reason','[{"kind":"issue","ref":"142"}]'::jsonb,$5)`,[id,actor,capability,project,status]);
  }
  const readerUrl=new URL(raw);readerUrl.username='comind_foundry_query_login';readerUrl.password=password;
  reader=new Pool({connectionString:readerUrl.toString(),max:1});
  await verifyFoundryReader(reader);await assert.rejects(verifyFoundryReader(admin),/least-privilege/);
  const read=createFoundryReadQuery(reader);
  const scoped=await read(projectId,1);assert.equal(scoped.rows.length,1);assert.equal(scoped.rows[0].authorization_request_id,allowedId);
  assert.equal(scoped.moreAvailable,false);assert.equal((await read(otherProjectId,1)).rows.length,0,'RLS hides a different project UUID');
  await assert.rejects(reader.query("INSERT INTO comind.cm_foundry_authorization_request(requesting_actor_id,capability_id,authority_level,target_kind,reason) VALUES(gen_random_uuid(),gen_random_uuid(),'C1','github_issue','denied')"),e=>e.code==='42501');
  await assert.rejects(reader.query('SELECT * FROM comind.cm_project'),e=>e.code==='42501');
  await assert.rejects(read(projectId,1).then(()=>reader.query('UPDATE comind.cm_foundry_authorization_request SET status=\'denied\'')));
  const operator={id:'pi-test-operator',token:randomBytes(32).toString('hex'),projects:['COMIND'],foundryProjectIds:[projectId],expiresAt:'2099-01-01T00:00:00Z'};
  const audit=[];
  gateway=await buildPiReadGateway({upstream:'http://127.0.0.1:3011',origin:'http://127.0.0.1:8000',backendId:'unused',
   loadSessions:async()=>[operator],loadBackend:async()=>[],readFoundry:read,audit:async row=>audit.push(row)});
  const headers={cookie:'__Host-comind_pi='+operator.token};
  const response=await gateway.inject({url:'/api/pi/foundry-requests?project_id='+projectId,headers});
  assert.equal(response.statusCode,200);assert.equal(response.json().data[0].authorization_request_id,allowedId);
  assert.equal(response.json().data[0].requesting_profile_id,null);assert.equal(response.json().source,'comind.cm_foundry_authorization_request');
  assert.equal(response.json().more_available,false);
  assert.equal((await gateway.inject({url:'/api/pi/foundry-requests?project_id='+otherProjectId,headers})).statusCode,403);
  assert.equal((await gateway.inject({url:'/api/pi/foundry-requests?project_id=bad',headers})).statusCode,400);
  assert.ok(audit.some(row=>row.operation==='pi.foundry'&&row.project===projectId&&row.status===200));
  assert.equal(JSON.stringify(audit).includes('Synthetic Foundry request reason'),false);
 }finally{
  if(gateway)await gateway.close();
  if(reader)await reader.end();
  await admin.query('DROP POLICY IF EXISTS pi_foundry_reader_test ON comind.cm_foundry_authorization_request').catch(()=>{});
  await admin.query('REVOKE ALL ON comind.cm_foundry_authorization_request FROM comind_foundry_query_login').catch(()=>{});
  await admin.query('REVOKE ALL ON SCHEMA comind FROM comind_foundry_query_login').catch(()=>{});
  await admin.query('DROP ROLE IF EXISTS comind_foundry_query_login').catch(()=>{});
  await admin.end();
 }
});
