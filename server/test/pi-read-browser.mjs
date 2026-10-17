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
 const operator={...backend,id:'operator-fixture',token:randomBytes(32).toString('hex')};
 const id=randomUUID(),sessions=join(directory,'sessions.json'),credentials=join(directory,'backend.json');
 await writeFile(sessions,JSON.stringify([operator]),{mode:0o600});await writeFile(credentials,JSON.stringify([backend]),{mode:0o600});
 drb=buildRunbookQueryService(async()=>({rows:[{id,project_id:randomUUID(),project_key:'COMIND',item_type:'lane',work_key:'PI-FIXTURE',title:'Synthetic connected lane',owner:'Synthetic owner',status:'review',private:backend.token}]}),[backend],Date.now,{loadPrincipals:()=>loadPrivatePrincipals(credentials),audit:createFileAudit(join(directory,'drb-audit.jsonl'))});
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
 gateway=await buildPiReadGateway({upstream,origin,backendId:backend.id,loadSessions:()=>loadPrivatePrincipals(sessions),loadBackend:()=>loadPrivatePrincipals(credentials),audit:createFileAudit(join(directory,'pi-audit.jsonl'))});
 browser=await chromium.launch({headless:true});const context=await browser.newContext({viewport:{width:390,height:844}});
 await context.addCookies([{name:'__Host-comind_pi',value:operator.token,domain:'127.0.0.1',path:'/',httpOnly:true,secure:true,sameSite:'Strict'}]);
 const page=await context.newPage(),requests=[];page.on('request',r=>requests.push({url:r.url(),headers:r.headers()}));
 await page.goto(origin+'/apps/primary-interface/index.html#/lanes');
 await page.getByRole('heading',{name:'Development lanes unavailable',exact:true}).waitFor();
 assert.equal(await page.evaluate(()=>document.cookie),'');
 await page.evaluate(async()=>{
  const {readTrustedLanes}=await import('./src/trusted-reader.mjs'),{mountCockpit}=await import('./src/cockpit.mjs');
  const lanes=await readTrustedLanes('COMIND');window.connectedUnmount=mountCockpit(document.querySelector('main'),{lanes});
 });
 await page.getByRole('link',{name:'PI-FIXTURE: Synthetic connected lane',exact:true}).click();
 await page.getByRole('heading',{name:'Development lane detail',exact:true}).waitFor();
 await page.getByText(id,{exact:true}).waitFor();
 assert.equal((await page.content()).includes(backend.token),false);
 assert.equal(requests.some(r=>JSON.stringify(r).includes(backend.token)),false);
 assert.equal(requests.some(r=>r.url.startsWith(upstream)),false);
 await writeFile(sessions,JSON.stringify([{...operator,disabled:true}]));
 await page.evaluate(async()=>{
  window.connectedUnmount();const {readTrustedLanes}=await import('./src/trusted-reader.mjs'),{mountCockpit}=await import('./src/cockpit.mjs');
  const lanes=await readTrustedLanes('COMIND');window.connectedUnmount=mountCockpit(document.querySelector('main'),{lanes});
 });
 await page.getByRole('heading',{name:'Development lanes unavailable',exact:true}).waitFor();
 assert.equal(await page.getByText('Synthetic connected lane',{exact:true}).count(),0);
 assert.equal(await page.locator('a.metric').count(),0);
 console.log('Trusted browser read passed: HttpOnly session, server-only DRB token, scoped read, canonical detail and revocation clears data. Synthetic DB fixture only.');
}finally{await browser?.close();if(web){web.closeAllConnections();await new Promise(r=>web.close(r));}await gateway?.close();await drb?.close();await rm(directory,{recursive:true,force:true});}
