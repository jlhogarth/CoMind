// Real PostgreSQL -> RunBook capture -> restricted reader -> HTTP -> PI gateway -> Chromium.
// Requires a fresh disposable loopback database. Never points at Supabase or production.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {readFile,writeFile,mkdtemp,rm,mkdir,chmod} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,extname} from 'node:path';
import {randomBytes,randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {buildRunbookQueryService} from '../dist/runbook/query-service.js';
import {createRunbookReadQuery,verifyRunbookReader} from '../dist/runbook/database.js';
import {buildPiReadGateway} from '../dist/primary-interface/read-gateway.js';
import {loadPrivatePrincipals,createFileAudit} from '../dist/runbook/security.js';

const raw=process.env.DRB_SYSTEM_ADMIN_URL;
assert.ok(raw,'DRB_SYSTEM_ADMIN_URL is required; system proof must not silently skip');
const target=new URL(raw);
assert.ok(['postgres:','postgresql:'].includes(target.protocol));
assert.ok(['127.0.0.1','localhost'].includes(target.hostname),'only loopback Test databases allowed');
assert.equal(target.pathname,'/drb_system_test','only dedicated drb_system_test database allowed');
assert.equal(target.search,'','connection options not allowed');assert.equal(target.hash,'');
const require=createRequire(import.meta.url),{chromium}=require(process.env.PI_PLAYWRIGHT_MODULE||'playwright');
const base=resolve(new URL('../../',import.meta.url).pathname),directory=await mkdtemp(join(tmpdir(),'drb-system-'));
const output=process.env.DRB_SYSTEM_ARTIFACT_DIR?resolve(process.env.DRB_SYSTEM_ARTIFACT_DIR):join(directory,'evidence');
await mkdir(output,{recursive:true,mode:0o700});
const admin=new Pool({connectionString:raw,max:2,connectionTimeoutMillis:3000,query_timeout:5000});
const checks=[],check=name=>{checks.push(name);console.log('PASS: '+name);};
let reader,drb,gateway,web,browser;
try{
 assert.ok(Number((await admin.query('show server_version_num')).rows[0].server_version_num)>=170000);
 assert.equal((await admin.query("select count(*)::int as n from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind in ('r','p') and n.nspname not in ('pg_catalog','information_schema') and n.nspname !~ '^pg_toast'")).rows[0].n,0,'fresh disposable database required');
 for(const path of ['db/test/bootstrap_supabase_compat.sql','db/migrations/20261006_001_comind_pm_ledger.sql',
  'db/migrations/20261006_002_comind_pm_ledger_hardening.sql','db/migrations/20261016_001_durable_runbook_foundation.sql'])await admin.query(await readFile(join(base,path),'utf8'));
 const password=randomBytes(32).toString('hex');
 await admin.query(`CREATE ROLE comind_runbook_query_login LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`);
 await admin.query(await readFile(join(base,'db/test/drb_002_reader.sql'),'utf8'));
 await admin.query("insert into comind_pm.pm_projects(project_key,name) values ('OTHER','Synthetic denied project'); insert into comind_pm.pm_work_items(project_id,work_key,title,item_type,status) select id,project_key||'-E2E','Isolated system test lane','lane','in_progress' from comind_pm.pm_projects where project_key in ('COMIND','OTHER')");
 const capture=async(project,summary,outcome='pass',result='Captured in the Test RunBook',occurredAt=null)=>{
  const client=await admin.connect();try{
   await client.query('begin');await client.query('set local role service_role');
   const row=await client.query(`select comind_pm.record_runbook_event(p_project_key=>$1,p_work_key=>$2,p_event_type=>'verification',
    p_actor=>'isolated system test',p_actor_type=>'system',p_summary=>$3,p_result_summary=>$4,p_outcome=>$5,
    p_source_system=>'manual',p_source_ref=>'server/test/runbook-system.e2e.mjs',
    p_occurred_at=>COALESCE($6::timestamptz,now()),p_evidence=>$7::jsonb,p_next_action=>'Continue isolated acceptance') as id`,[project,project+'-E2E',summary,result,outcome,occurredAt,JSON.stringify([{kind:'test',ref:'isolated-e2e',note:'Synthetic <img src=x onerror=alert(1)> evidence'}])]);
   await client.query('commit');return row.rows[0].id;
  }catch(error){await client.query('rollback');throw error;}finally{client.release();}
 };
 const invalidBefore=(await admin.query('select count(*)::int as n from comind_pm.pm_events')).rows[0].n;
 await assert.rejects(admin.query(`select comind_pm.record_runbook_event(p_project_key=>'COMIND',p_event_type=>'test',
  p_actor=>'isolated system test',p_summary=>'Invalid source must be rejected',p_source_system=>'isolated-e2e')`),e=>e.code==='23514');
 assert.equal((await admin.query('select count(*)::int as n from comind_pm.pm_events')).rows[0].n,invalidBefore);
 check('invalid capture source is rejected without a partial event');
 const tiedAt=new Date(Date.now()+1000).toISOString();
 const eventId=await capture('COMIND','Test RunBook capture accepted','pass','Captured in the Test RunBook',tiedAt);
 const tiedEventIds=[eventId,await capture('COMIND','Same-time event B','pass','Captured in the Test RunBook',tiedAt),await capture('COMIND','Same-time event C','pass','Captured in the Test RunBook',tiedAt),await capture('COMIND','Same-time event D','pass','Captured in the Test RunBook',tiedAt),await capture('COMIND','Same-time event E','pass','Captured in the Test RunBook',tiedAt)];
 await capture('OTHER','Denied project event must never reach this browser');
 check('actual migrations and service_role capture function, synthetic records only');
 const snapshot=async()=> (await admin.query("select jsonb_agg(to_jsonb(e) order by id)::text as ledger from comind_pm.pm_events e")).rows[0].ledger;
 let before=await snapshot();
 await assert.rejects(admin.query('update comind_pm.pm_events set summary=$1 where id=$2',['rewrite denied',eventId]),/append.only/i);
 await assert.rejects(admin.query('delete from comind_pm.pm_events where id=$1',[eventId]),/append.only/i);
 assert.equal(await snapshot(),before);check('append-only update/delete denial preserves original event');
 target.username='comind_runbook_query_login';target.password=password;
 reader=new Pool({connectionString:target.toString(),max:2,connectionTimeoutMillis:1000,query_timeout:5000});
 reader.on('error',()=>{});await verifyRunbookReader(reader);
 await assert.rejects(reader.query("update comind_pm.pm_work_items set title='denied'"),e=>e.code==='42501');
 // Even an HTTP identity authorized for OTHER cannot escape the COMIND-only database policy.
 const backend={id:'system-test-reader',token:randomBytes(32).toString('hex'),projects:['COMIND','OTHER'],expiresAt:new Date(Date.now()+3600000).toISOString()};
 const operator={id:'system-test-operator',token:randomBytes(32).toString('hex'),projects:['COMIND'],expiresAt:backend.expiresAt};
 const credentials=join(directory,'backend.json'),sessions=join(directory,'sessions.json'),drbAudit=join(directory,'drb.jsonl'),piAudit=join(directory,'pi.jsonl');
 await writeFile(credentials,JSON.stringify([backend]),{mode:0o600});await writeFile(sessions,JSON.stringify([operator]),{mode:0o600});
 const startDrb=async(port=0)=>{
  const app=buildRunbookQueryService(createRunbookReadQuery(reader),[backend],Date.now,{loadPrincipals:()=>loadPrivatePrincipals(credentials),audit:createFileAudit(drbAudit)});
  await app.listen({host:'127.0.0.1',port});return app;
 };
 drb=await startDrb();const upstream=`http://127.0.0.1:${drb.server.address().port}`;
 const denied=await drb.inject({method:'POST',url:'/v1/runbook/query',headers:{authorization:'Bearer '+backend.token},payload:{project:'OTHER',kind:'events'}});
 assert.equal(denied.statusCode,200);assert.deepEqual(denied.json().data,[]);check('restricted database reader excludes OTHER despite backend HTTP scope');
 web=createServer(async(req,res)=>{
  try{
   if(req.url.startsWith('/api/pi/')){const out=await gateway.inject({method:req.method,url:req.url,headers:req.headers});res.writeHead(out.statusCode,out.headers);res.end(out.body);return;}
   const pathname=new URL(req.url,'http://127.0.0.1').pathname;
   if(!pathname.startsWith('/apps/primary-interface/')&&!pathname.startsWith('/brand/'))throw Error('unavailable');
   const file=resolve(base,decodeURIComponent(pathname).slice(1));
   if(!file.startsWith(base+'/apps/primary-interface/')&&!file.startsWith(base+'/brand/'))throw Error('unavailable');
   if(!['.html','.mjs','.css'].includes(extname(file)))throw Error('unavailable');
   res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
   res.setHeader('Content-Type',({'.html':'text/html','.mjs':'text/javascript','.css':'text/css'})[extname(file)]);res.end(await readFile(file));
  }catch{res.statusCode=404;res.end('Unavailable');}
 });
 await new Promise(r=>web.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${web.address().port}`;
 gateway=await buildPiReadGateway({upstream,origin,backendId:backend.id,loadSessions:()=>loadPrivatePrincipals(sessions),
  loadBackend:()=>loadPrivatePrincipals(credentials),audit:createFileAudit(piAudit)});
 browser=await chromium.launch({headless:true});const context=await browser.newContext({viewport:{width:1200,height:900}});
 await context.addCookies([{name:'__Host-comind_pi',value:operator.token,domain:'127.0.0.1',path:'/',httpOnly:true,secure:true,sameSite:'Strict'}]);
 const page=await context.newPage(),requests=[],errors=[],eventResponses=[];
 page.on('pageerror',error=>errors.push(error.message));page.on('request',r=>requests.push({url:r.url(),headers:r.headers()}));
 page.on('response',response=>{if(response.url().includes('/api/pi/events'))eventResponses.push({url:response.url(),status:response.status()});});
 await page.goto(origin+'/apps/primary-interface/reader.html#/lanes');
 await page.getByLabel('Project',{exact:true}).fill('COMIND');await page.getByLabel('Lane filter (optional)',{exact:true}).fill('COMIND-E2E');
 const work=(await admin.query("select id,project_id,current_summary from comind_pm.pm_work_items where work_key='COMIND-E2E'")).rows[0];
 const eventRead=await drb.inject({method:'POST',url:'/v1/runbook/query',headers:{authorization:'Bearer '+backend.token},payload:{kind:'events',project:'COMIND',lane:'COMIND-E2E'}});
 assert.equal(eventRead.statusCode,200);
 const canonicalEvent=eventRead.json().data.find(row=>row.event_id===eventId);assert.ok(canonicalEvent);
 assert.equal(canonicalEvent.project_id,work.project_id);assert.equal(canonicalEvent.work_item_id,work.id);
 assert.equal(canonicalEvent.work_item_project_id,work.project_id);assert.equal(canonicalEvent.item_type,'lane');
 const pageOne=await drb.inject({method:'POST',url:'/v1/runbook/query',headers:{authorization:'Bearer '+backend.token},payload:{kind:'events',project:'COMIND',lane:'COMIND-E2E',limit:2}});
 assert.equal(pageOne.statusCode,200);assert.equal(pageOne.json().more_available,true);assert.equal(pageOne.json().data.length,2);
 assert.ok(pageOne.json().data.every(row=>Date.parse(row.occurred_at)===Date.parse(tiedAt)));
 const pageTwo=await drb.inject({method:'POST',url:'/v1/runbook/query',headers:{authorization:'Bearer '+backend.token},payload:{kind:'events',project:'COMIND',lane:'COMIND-E2E',limit:2,
  cursor_occurred_at:pageOne.json().next_cursor.occurred_at,cursor_event_id:pageOne.json().next_cursor.event_id}});
 assert.equal(pageTwo.statusCode,200);assert.equal(pageTwo.json().more_available,true);assert.equal(pageTwo.json().data.length,2);
 const pageThree=await drb.inject({method:'POST',url:'/v1/runbook/query',headers:{authorization:'Bearer '+backend.token},payload:{kind:'events',project:'COMIND',lane:'COMIND-E2E',limit:2,
  cursor_occurred_at:pageTwo.json().next_cursor.occurred_at,cursor_event_id:pageTwo.json().next_cursor.event_id}});
 assert.equal(pageThree.statusCode,200);assert.equal(pageThree.json().more_available,false);assert.equal(pageThree.json().data.length,1);
 const pagedIds=[...pageOne.json().data,...pageTwo.json().data,...pageThree.json().data].map(row=>row.event_id);
 assert.deepEqual(pagedIds,tiedEventIds.slice().sort().reverse());assert.equal(new Set(pagedIds).size,5);
 check('same-timestamp event rows use descending event UUID order and keyset continuation without omissions or duplicates');
 check('limit plus one reports overflow on the first page and no next page on the final bounded page');
 const projectIsolation=await drb.inject({method:'POST',url:'/v1/runbook/query',headers:{authorization:'Bearer '+backend.token},payload:{kind:'events',project:'OTHER',lane:'OTHER-E2E',limit:2}});
 assert.equal(projectIsolation.statusCode,200);assert.deepEqual(projectIsolation.json().data,[]);
 check('project isolation excludes records belonging to OTHER');
 const readEvents=async()=>{await page.getByRole('button',{name:'Read RunBook events',exact:true}).click();};
 await page.locator('#event-limit').selectOption('2');
 await readEvents();
 for(const id of pageOne.json().data.map(row=>row.event_id))await page.locator('#event-list').getByText(id,{exact:true}).waitFor();
 await page.getByText('Each page request observes the changing source independently; pages do not share a snapshot.',{exact:false}).waitFor();
 const arrivingEventId=await capture('COMIND','Synthetic event arrived between page requests','pass','Observed after the first bounded page',new Date(Date.parse(tiedAt)+10000).toISOString());
 before=await snapshot();
 check('reader labels each event page as an independent observation of a changing source');
 await page.getByRole('button',{name:'Read older events',exact:true}).click();
 for(const id of pageTwo.json().data.map(row=>row.event_id))await page.locator('#event-list').getByText(id,{exact:true}).waitFor();
 assert.equal(await page.locator('#event-list').getByText(arrivingEventId,{exact:true}).count(),0,
  'newer append must not be implied to belong to the continuation of the earlier page cursor');
 assert.match(await page.locator('#event-status').innerText(),/independently; pages do not share a snapshot/);
 check('a newer append between requests does not change the earlier cursor window or imply snapshot consistency');
 await page.getByRole('button',{name:'Read older events',exact:true}).click();
 const pageThreeIds=pageThree.json().data.map(row=>row.event_id);
 for(const id of pageThreeIds)await page.locator('#event-list').getByText(id,{exact:true}).waitFor();
 await page.getByText('No next page is reported for this bounded response.',{exact:false}).waitFor();
 await page.getByRole('button',{name:'Back to newer events',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('#event-status')?.textContent.startsWith('Page 2:')
  ||document.querySelector('#event-status')?.textContent.startsWith('Trusted reader'));
 assert.match(await page.locator('#event-status').innerText(),/^Page 2:/,
  `browser did not restore page 2: url=${page.url()} state=${JSON.stringify(await page.evaluate(()=>history.state))} responses=${JSON.stringify(eventResponses)} errors=${JSON.stringify(errors)}`);
 for(const id of pageTwo.json().data.map(row=>row.event_id))await page.locator('#event-list').getByText(id,{exact:true}).waitFor();
 check('browser Back restores the prior event cursor after reading an older page');
 await page.locator('#lane').fill('');await readEvents();
 await page.getByText('Page 1:',{exact:false}).waitFor();
 await page.locator('#event-list').getByText(arrivingEventId,{exact:true}).waitFor();
 await page.evaluate(()=>window.history.back());
 await page.waitForFunction(()=>document.querySelector('#event-status')?.textContent.startsWith('Page 2:')
  ||document.querySelector('#event-status')?.textContent.startsWith('Trusted reader'));
 assert.match(await page.locator('#event-status').innerText(),/^Page 2:/,
  `browser did not restore previous event scope: url=${page.url()} state=${JSON.stringify(await page.evaluate(()=>history.state))} responses=${JSON.stringify(eventResponses)} errors=${JSON.stringify(errors)}`);
 for(const id of pageTwo.json().data.map(row=>row.event_id))await page.locator('#event-list').getByText(id,{exact:true}).waitFor();
 check('event context switch preserves the previous page cursor in browser history');
 await page.locator('#event-limit').selectOption('25');
 await readEvents();await page.locator('#event-list').getByText('Test RunBook capture accepted',{exact:true}).waitFor();
 await page.locator('#event-list').getByText(work.id,{exact:true}).first().waitFor();
 assert.equal(await page.locator('#event-list img').count(),0);
 assert.equal(await page.locator('#event-list').getByText('Denied project event must never reach this browser',{exact:true}).count(),0);
 assert.equal(await page.evaluate(()=>document.cookie),'');
 check('Chromium displays real captured event UUID, source, result and literal evidence');
 await page.getByRole('button',{name:'Read project lanes',exact:true}).click();
 await page.getByRole('link',{name:'COMIND-E2E: Isolated system test lane',exact:true}).click();
 await page.getByRole('heading',{name:'Development lane detail',exact:true}).waitFor();
 await page.getByText(work.id,{exact:true}).waitFor();assert.equal(work.current_summary,'Captured in the Test RunBook');
 assert.equal(await snapshot(),before);check('capture updates canonical lane projection; application reads do not mutate RunBook');
 const failedId=await capture('COMIND','Synthetic test failure recorded','fail','Deliberate fixture failure');
 const recoveredId=await capture('COMIND','Synthetic recovery verified','pass','Recovery is a new event; original retained');
 await readEvents();await page.locator('#event-list').getByText(recoveredId,{exact:true}).waitFor();
 await page.locator('#event-list').getByText(failedId,{exact:true}).waitFor();await page.locator('#event-list').getByText(eventId,{exact:true}).waitFor();
 assert.equal((await admin.query('select summary from comind_pm.pm_events where id=$1',[eventId])).rows[0].summary,'Test RunBook capture accepted');
 await page.screenshot({path:join(output,'runbook-test-timeline.png'),fullPage:true});check('append-only failure and recovery remain inspectable together');
 const successfulSnapshot=await snapshot();
 const expectWithheld=async(reason)=>{await readEvents();await page.locator('#event-status').getByText(reason,{exact:true}).waitFor();assert.equal(await page.locator('#event-list article').count(),0);};
 await writeFile(sessions,JSON.stringify([{...operator,disabled:true}]));
 await expectWithheld('Operator session missing, expired or revoked.');await writeFile(sessions,JSON.stringify([operator]));
 await writeFile(credentials,JSON.stringify([{...backend,disabled:true}]));await expectWithheld('Trusted reader unavailable.');
 await writeFile(credentials,JSON.stringify([backend]));check('operator and backend revocation clear displayed records');
 await chmod(drbAudit,0o644);await expectWithheld('Trusted reader unavailable.');await chmod(drbAudit,0o600);
 await chmod(piAudit,0o644);await expectWithheld('Trusted reader unavailable.');await chmod(piAudit,0o600);check('unsafe DRB and PI audit files withhold database results');
 // Stop new reader logins and evict current reader sessions in this disposable database.
 await admin.query('alter role comind_runbook_query_login nologin');
 await admin.query("select pg_terminate_backend(pid) from pg_stat_activity where usename='comind_runbook_query_login' and datname=current_database()");
 await expectWithheld('Trusted reader unavailable.');await admin.query('alter role comind_runbook_query_login login');
 await readEvents();await page.locator('#event-list').getByText(recoveredId,{exact:true}).waitFor();check('database connection loss fails closed and recovers after login restoration');
 // Hold a real relation lock to force the reader's existing three-second SQL timeout.
 const locker=await admin.connect();try{
  await locker.query('begin');await locker.query('lock table comind_pm.pm_events in access exclusive mode');
  await expectWithheld('Trusted reader unavailable.');
 }finally{await locker.query('rollback');locker.release();}
 await readEvents();await page.locator('#event-list').getByText(recoveredId,{exact:true}).waitFor();check('real database statement timeout clears results and recovers after rollback');
 const drbPort=drb.server.address().port;await drb.close();
 await expectWithheld('Trusted reader unavailable.');drb=await startDrb(drbPort);
 await readEvents();await page.locator('#event-list').getByText(eventId,{exact:true}).waitFor();check('service restart retains database events and private audit files');
 await page.getByLabel('Project',{exact:true}).fill('OTHER');await page.getByLabel('Lane filter (optional)',{exact:true}).fill('');
 await expectWithheld('Project read denied.');
 assert.equal(await snapshot(),successfulSnapshot);assert.deepEqual(errors,[]);
 assert.equal((await page.content()).includes(backend.token),false);assert.equal(JSON.stringify(requests).includes(backend.token),false);
 assert.equal(requests.some(r=>r.url.startsWith(upstream)),false);
 for(const path of [piAudit,drbAudit]){
  const rows=(await readFile(path,'utf8')).trim().split('\n').map(JSON.parse);
  assert.ok(rows.some(r=>r.status===200));assert.ok(rows.some(r=>r.status!==200));
  const serialized=JSON.stringify(rows);assert.equal(serialized.includes(backend.token),false);assert.equal(serialized.includes(operator.token),false);
  assert.equal(serialized.includes('Test RunBook capture accepted'),false);
 }
 check('project denial, payload-free audits, server-only credential and unchanged ledger verified');
 await writeFile(join(output,'acceptance.json'),JSON.stringify({version:'drb-test-system.v1',status:'pass',
  observed_at:new Date().toISOString(),commit:process.env.GITHUB_SHA??null,
  environment:'fresh loopback PostgreSQL 17; synthetic records; no production resources',event_ids:[...tiedEventIds,failedId,recoveredId],checks},null,2));
 console.log('System proof completed. Production remains deferred.');
}catch(error){
 await writeFile(join(output,'acceptance.json'),JSON.stringify({version:'drb-test-system.v1',status:'failed',observed_at:new Date().toISOString(),checks},null,2));
 const page=browser?.contexts()[0]?.pages()[0];if(page)await page.screenshot({path:join(output,'failed-test-page.png'),fullPage:true}).catch(()=>{});
 throw error;
}finally{
 await browser?.close();if(web){web.closeAllConnections();await new Promise(r=>web.close(r));}
 await gateway?.close();await drb?.close();await reader?.end();await admin.end();
 // No database drop/reset or source deletion. CI destroys its disposable service after evidence capture.
 await rm(directory,{recursive:true,force:true});
}
