// Synthetic DB replies only. Real browser -> same-origin PI gateway -> loopback DRB HTTP.
import {createRequire} from 'node:module';import {createServer} from 'node:http';
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';
import {join,resolve,extname} from 'node:path';import {randomBytes,randomUUID} from 'node:crypto';import assert from 'node:assert/strict';
import {buildRunbookQueryService} from '../dist/runbook/query-service.js';import {buildPiReadGateway} from '../dist/primary-interface/read-gateway.js';
import {loadPrivatePrincipals,createFileAudit} from '../dist/runbook/security.js';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PI_PLAYWRIGHT_MODULE||'playwright');
const directory=await mkdtemp(join(tmpdir(),'pi-reader-browser-')),base=resolve('..');
let browser,drb,gateway,web;
try{
 const backend={id:'drb-fixture',token:randomBytes(32).toString('hex'),expiresAt:'2099-01-01T00:00:00Z',projects:['COMIND']};
 const foundryProjectId=randomUUID(),operator={...backend,id:'operator-fixture',token:randomBytes(32).toString('hex'),foundryProjectIds:[foundryProjectId]};
 const id=randomUUID(),decisionId=randomUUID(),workItemId=randomUUID(),projectId=randomUUID(),requestId=randomUUID(),profileId=randomUUID(),actorId=randomUUID(),capabilityId=randomUUID(),sessions=join(directory,'sessions.json'),credentials=join(directory,'backend.json');
 await writeFile(sessions,JSON.stringify([operator]),{mode:0o600});await writeFile(credentials,JSON.stringify([backend]),{mode:0o600});
 drb=buildRunbookQueryService(async(sql)=>({rows:sql.includes('pm_decision_records')?[{id:decisionId,work_item_id:workItemId,project_id:projectId,
  project_key:'COMIND',item_type:'lane',work_key:'PI-FIXTURE',decision_needed:'Synthetic project decision',options_json:'["<img src=x onerror=alert(1)>"]',
  selected_option:null,rationale:null,reversibility:'unknown',decided_by:null,decided_at:null,created_at:new Date().toISOString(),updated_at:new Date().toISOString(),private:backend.token}]:
  [{id,project_id:projectId,project_key:'COMIND',item_type:'lane',work_key:'PI-FIXTURE',title:'Synthetic connected lane',owner:'Synthetic owner',status:'review',private:backend.token}]}),[backend],Date.now,{loadPrincipals:()=>loadPrivatePrincipals(credentials),audit:createFileAudit(join(directory,'drb-audit.jsonl'))});
 const upstream=await drb.listen({host:'127.0.0.1',port:0});
 web=createServer(async(req,res)=>{
  if(req.url.startsWith('/api/pi/')){
   const out=await gateway.inject({method:req.method,url:req.url,headers:req.headers});res.writeHead(out.statusCode,out.headers);res.end(out.body);return;
  }
  try{const pathname=new URL(req.url,'http://127.0.0.1').pathname;
   if(!pathname.startsWith('/apps/primary-interface/')&&!pathname.startsWith('/brand/'))throw Error();
   const path=resolve(base,decodeURIComponent(pathname).slice(1));if(!path.startsWith(base+'/'))throw Error();
   res.setHeader('Content-Type',({'.html':'text/html','.mjs':'text/javascript','.css':'text/css'})[extname(path)]||'text/plain');res.end(await readFile(path));
  }catch{res.statusCode=404;res.end('Unavailable');}
 });
 await new Promise(r=>web.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${web.address().port}`;
 gateway=await buildPiReadGateway({upstream,origin,backendId:backend.id,loadSessions:()=>loadPrivatePrincipals(sessions),loadBackend:()=>loadPrivatePrincipals(credentials),audit:createFileAudit(join(directory,'pi-audit.jsonl')),
  readFoundry:async(project)=>({moreAvailable:false,rows:project===foundryProjectId?[{authorization_request_id:requestId,requesting_profile_id:profileId,
   requesting_actor_id:actorId,capability_id:capabilityId,project_id:foundryProjectId,task_id:null,authority_level:'C1',environment:'isolated',
   target_kind:'github_issue',target_ref:'142',reason:'Synthetic <img src=x onerror=alert(1)> reason',evidence_refs:[{kind:'issue',ref:'142'}],
   status:'pending',requested_at:new Date().toISOString(),expires_at:null,private:backend.token}]:[]})});
 browser=await chromium.launch({headless:true});const context=await browser.newContext({viewport:{width:390,height:844}});
 await context.addCookies([{name:'__Host-comind_pi',value:operator.token,domain:'127.0.0.1',path:'/',httpOnly:true,secure:true,sameSite:'Strict'}]);
 const page=await context.newPage(),requests=[];page.on('request',r=>requests.push({url:r.url(),headers:r.headers()}));
 await page.goto(origin+'/apps/primary-interface/index.html#/lanes');
 await page.getByRole('heading',{name:'Development lanes unavailable',exact:true}).waitFor();
 assert.equal(await page.evaluate(()=>document.cookie),'');
 await page.goto(origin+'/apps/primary-interface/reader.html#/lanes');
 await page.getByLabel('Project',{exact:true}).fill('COMIND');
 await page.getByRole('button',{name:'Read project lanes',exact:true}).click();
 await page.getByRole('link',{name:'PI-FIXTURE: Synthetic connected lane',exact:true}).click();
 await page.getByRole('heading',{name:'Development lane detail',exact:true}).waitFor();
 await page.getByText(id,{exact:true}).waitFor();
 await page.getByRole('button',{name:'Read project decisions',exact:true}).click();
 await page.getByText('Received 1 project decision records.',{exact:false}).waitFor();
 await page.getByRole('heading',{name:'Development lanes unavailable',exact:true}).waitFor();
 assert.equal(await page.getByText('Synthetic connected lane',{exact:true}).count(),0);
 await page.getByRole('heading',{name:'PI-FIXTURE: Synthetic project decision',exact:true}).waitFor();
 await page.getByText(decisionId,{exact:true}).waitFor();
 await page.getByText('["<img src=x onerror=alert(1)>"]',{exact:true}).waitFor();
 await page.getByLabel('Foundry project UUID').fill(foundryProjectId);
 await page.getByRole('button',{name:'Read Foundry requests',exact:true}).click();
 await page.getByText('Received 1 Foundry authorization request records.',{exact:false}).waitFor();
 await page.getByRole('heading',{name:'Development lanes unavailable',exact:true}).waitFor();
 await page.getByText(requestId,{exact:true}).waitFor();
 await page.getByText('Synthetic <img src=x onerror=alert(1)> reason',{exact:true}).waitFor();
 assert.equal(await page.locator('#foundry-list img').count(),0);
 assert.equal(await page.getByRole('heading',{name:/C1 pending request/}).count(),1);
 assert.equal(await page.getByRole('button',{name:/approve|reject|hold/i}).count(),0);
 assert.equal(await page.locator('#decision-list img').count(),0);
 assert.equal(await page.getByRole('button',{name:/approve|reject|hold/i}).count(),0);
 assert.equal((await page.content()).includes(backend.token),false);
 assert.equal(requests.some(r=>JSON.stringify(r).includes(backend.token)),false);
 assert.equal(requests.some(r=>r.url.startsWith(upstream)),false);
 await writeFile(sessions,JSON.stringify([{...operator,disabled:true}]));
 await page.getByRole('button',{name:'Read project lanes',exact:true}).click();
 await page.getByRole('heading',{name:'Development lanes unavailable',exact:true}).waitFor();
 assert.equal(await page.getByText('Synthetic connected lane',{exact:true}).count(),0);
 assert.equal(await page.locator('a.metric').count(),0);
 await writeFile(sessions,JSON.stringify([operator]));
 await page.getByLabel('Project',{exact:true}).fill('OTHER');
 await page.getByRole('button',{name:'Read project lanes',exact:true}).click();
 await page.getByText('Project read denied.',{exact:true}).waitFor();
 assert.equal(await page.getByText('Synthetic connected lane',{exact:true}).count(),0);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 console.log('Trusted browser read passed: HttpOnly session, server-only PM credential, native Foundry UUID scope, canonical detail and revocation clears data. Synthetic source fixtures only.');
}finally{await browser?.close();if(web){web.closeAllConnections();await new Promise(r=>web.close(r));}await gateway?.close();await drb?.close();await rm(directory,{recursive:true,force:true});}
