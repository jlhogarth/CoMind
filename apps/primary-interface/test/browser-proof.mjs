// Synthetic browser integration proof. No live records, database or provider calls.
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const { chromium }=require(process.env.PI_PLAYWRIGHT_MODULE || 'playwright');
const base=resolve('.');
const server=createServer(async(req,res)=>{
 try {const path=resolve(base,decodeURIComponent(new URL(req.url,'http://localhost').pathname).slice(1));
 if(!path.startsWith(base+'/')) throw Error('Outside root');
 res.setHeader('Content-Type',({'.html':'text/html','.mjs':'text/javascript','.css':'text/css'})[extname(path)] || 'text/plain'); res.end(await readFile(path));
 }catch{res.statusCode=404;res.end('Unavailable');}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
let browser;
try {
 browser=await chromium.launch({headless:true}); const page=await browser.newPage({viewport:{width:390,height:844}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${server.address().port}/apps/primary-interface/index.html`);
 await page.getByRole('heading',{name:'Attention unavailable',exact:true}).waitFor();
 assert.equal(await page.getByText('No count is available.',{exact:false}).count(),1);
 await page.keyboard.press('Tab'); assert.equal(await page.locator(':focus').textContent(),'Skip to content');
 assert.notEqual(await page.locator(':focus').evaluate(n=>getComputedStyle(n).outlineStyle),'none');
 await page.keyboard.press('Enter');assert.equal(await page.locator(':focus').getAttribute('id'),'content');
 await page.evaluate(async()=>{
  const {mountCockpit}=await import('./src/cockpit.mjs');
  const record={id:'fixture/action?1',laneId:'fixture-lane',status:'open',revision:1,stopReason:'Synthetic stop <img src=x onerror=alert(1)>',authorityBoundary:'C4 fixture only',recommendation:'Inspect synthetic evidence',consequences:'Synthetic consequence',requestedAt:'2026-10-17T18:00:00Z',expiresAt:'2026-10-17T20:00:00Z',evidence:[{id:'fixture-proof',sourceRef:'javascript:alert(1)',verification:'verified',conflict:false,verifiedAt:'2026-10-17T18:30:00Z',expiresAt:'2026-10-17T20:00:00Z'}],runbookRefs:[{id:'fixture-event',sourceRef:'fixture:runbook'}]};
  window.fixtureNow='2026-10-17T19:00:00Z';
  window.unmountFixture=mountCockpit(document.querySelector('main'),{status:'ready',synthetic:true,sourceRef:'test fixture',observedAt:'2026-10-17T19:00:00Z',records:[record]},{clock:()=>window.fixtureNow});
 });
 await page.getByLabel('Search',{exact:true}).fill('Synthetic');await page.getByRole('button',{name:'Apply filters'}).click();
 await page.getByRole('link',{name:'1 matching records in supplied snapshot'}).waitFor();
 await page.getByRole('link',{name:'fixture/action?1:',exact:false}).click();
 await page.getByRole('heading',{name:'Human-action detail',exact:true}).waitFor();
 assert.equal(await page.locator('img').count(),0); assert.equal(await page.locator('a[href^="javascript:"]').count(),0);
 assert.equal(await page.getByRole('button',{name:'approve',exact:true}).isDisabled(),true);
 await page.getByRole('link',{name:'Inspect evidence'}).click();await page.getByText('Requested identifier: fixture-proof',{exact:true}).waitFor();
 await page.goBack(); await page.getByRole('heading',{name:'Human-action detail',exact:true}).waitFor();
 await page.getByRole('link',{name:'Back to filtered attention'}).click();await page.getByLabel('Search',{exact:true}).waitFor();assert.equal(await page.getByLabel('Search',{exact:true}).inputValue(),'Synthetic');
 await page.goBack();await page.getByRole('heading',{name:'Human-action detail',exact:true}).waitFor();await page.goForward();await page.getByLabel('Search',{exact:true}).waitFor();
 await page.getByRole('link',{name:'fixture/action?1:',exact:false}).click();await page.getByRole('heading',{name:'Human-action detail',exact:true}).waitFor();
 await page.evaluate(()=>window.fixtureNow='2026-10-17T20:00:00Z');await page.getByRole('button',{name:'Refresh assessment'}).click();await page.getByText('Assessment: needs_refresh',{exact:true}).waitFor();
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.evaluate(()=>{window.location.hash='/attention/missing';});await page.getByText('Record unavailable in this source snapshot.',{exact:true}).waitFor();
 for (const [status, records, expected] of [
  ['ready', [], 'No matching records in this successful source snapshot.'],
  ['forbidden', [], 'Attention unavailable'],
  ['failed', [], 'Attention unavailable'],
  ['partial', [], 'Attention unavailable'],
  ['ready', [null], 'Source integrity unavailable'],
  ['ready', [{id:'duplicate'},{id:'duplicate'}], 'Source integrity unavailable'],
 ]) {
  await page.evaluate(async ({status,records})=>{
   window.unmountFixture();
   history.replaceState(null,'','#/attention');
   const {mountCockpit}=await import('./src/cockpit.mjs');
   window.unmountFixture=mountCockpit(document.querySelector('main'),{status,records,synthetic:true,sourceRef:'test fixture',reason:'Synthetic source boundary',observedAt:null});
  },{status,records});
  await page.getByText(expected,{exact:true}).waitFor();
  if(status!=='ready') assert.equal(await page.locator('a.metric').count(),0);
 }
 assert.deepEqual(errors,[]);
 console.log('Browser proof passed: unavailable source, keyboard/focus, escaped text, read-only actions, encoded deep links, evidence drill-down, filter/history, expiry and mobile overflow.');
} finally {await browser?.close();await new Promise(r=>server.close(r));}
