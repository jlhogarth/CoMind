import test from 'node:test';import assert from 'node:assert/strict';
import {readTrustedLanes,readTrustedDecisions,createTrustedReadController} from '../src/trusted-reader.mjs';
test('browser reader uses only fixed same-origin cookie transport, never a DRB credential',async()=>{
 const out=await readTrustedLanes('COMIND',{fetchImpl:async(url,options)=>{
  assert.equal(url,'/api/pi/lanes?project=COMIND&limit=25');assert.equal(options.credentials,'same-origin');
  assert.equal(options.cache,'no-store');assert.equal(options.headers,undefined);return {ok:false,status:401};}});
 assert.equal(out.status,'forbidden');assert.equal(out.envelope,undefined);
});
test('failure and revoked reads never retain a previous successful snapshot',async()=>{
 for(const status of [403,429,503])assert.equal((await readTrustedLanes('COMIND',{fetchImpl:async()=>({ok:false,status})})).envelope,undefined);
 assert.equal((await readTrustedLanes('COMIND',{fetchImpl:async()=>{throw Error('private detail');}})).status,'failed');
 await assert.rejects(readTrustedLanes('COMIND',{lane:'bad/sql'}));
});

// Synthetic deferred replies model an earlier successful read arriving after a denial.
test('newer denial cannot be overwritten by an earlier successful response',async()=>{
 const {createLaneReadController}=await import('../src/trusted-reader.mjs');
 const replies=[],states=[];
 const controller=createLaneReadController({onState:state=>states.push(state),read:()=>new Promise(resolve=>replies.push(resolve))});
 const first=controller.refresh('COMIND');const second=controller.refresh('COMIND');
 replies[1]({status:'forbidden',project:'COMIND',reason:'Synthetic revoked session'});await second;
 replies[0]({status:'ready',project:'COMIND',envelope:{synthetic:true}});await first;
 assert.equal(states.at(-1).status,'forbidden');assert.equal(states.at(-1).envelope,undefined);
 controller.stop();
});
test('refresh clears previous data immediately and aborts superseded work',async()=>{
 const {createLaneReadController}=await import('../src/trusted-reader.mjs');const signals=[],states=[],replies=[];
 const c=createLaneReadController({onState:s=>states.push(s),read:(_project,{signal})=>{signals.push(signal);return new Promise(r=>replies.push(r));}});
 const a=c.refresh('COMIND');const b=c.refresh('OTHER');
 assert.equal(signals[0].aborted,true);assert.equal(states.at(-1).status,'loading');assert.equal(states.at(-1).envelope,undefined);
 replies[1]({status:'ready',project:'OTHER',envelope:{synthetic:true}});await b;
 replies[0]({status:'ready',project:'COMIND',envelope:{synthetic:true}});await a;
 assert.equal(states.at(-1).project,'OTHER');c.stop();
});
test('stop blocks late completion and new requests; thrown reads become unavailable',async()=>{
 const {createLaneReadController}=await import('../src/trusted-reader.mjs');let finish,calls=0;const states=[];
 const c=createLaneReadController({onState:s=>states.push(s),read:()=>{calls++;return new Promise(r=>finish=r);}});
 const pending=c.refresh('COMIND');c.stop();finish({status:'ready',project:'COMIND'});await pending;await c.refresh('COMIND');assert.equal(calls,1);assert.equal(states.length,1);
 const failed=[];const d=createLaneReadController({onState:s=>failed.push(s),read:async()=>{throw Error('sensitive');}});await d.refresh('COMIND');assert.equal(failed.at(-1).status,'failed');assert.equal(JSON.stringify(failed).includes('sensitive'),false);d.stop();
});
test('reader forwards cancellation and rejects a mismatched project state',async()=>{
 const signal=new AbortController().signal;
 await readTrustedLanes('COMIND',{signal,fetchImpl:async(_url,options)=>{assert.ok(options.signal);return {ok:false,status:503};}});
 const {createLaneReadController}=await import('../src/trusted-reader.mjs');let state;
 const c=createLaneReadController({onState:s=>state=s,read:async()=>({status:'ready',project:'OTHER'})});await c.refresh('COMIND');assert.equal(state.status,'failed');c.stop();
});
test('decision reader uses only the same-origin cookie route and validates source domain and scope',async()=>{
 let request;const id='00000000-0000-4000-8000-000000000001';
 const result=await readTrustedDecisions('COMIND',{lane:'PI-001',limit:1,fetchImpl:async(url,options)=>{
  request={url,options};return {ok:true,json:async()=>({version:'drb-002.v1',kind:'decisions',source:'comind_pm.pm_decision_records',
   source_relations:['comind_pm.pm_decision_records','comind_pm.pm_work_items','comind_pm.pm_projects'],request_id:id,
   project:'COMIND',lane:'PI-001',limit:1,more_available:false,retrieved_at:'2026-10-18T01:00:00Z',data:[]})};
 }});
 assert.equal(request.url,'/api/pi/decisions?project=COMIND&limit=1&lane=PI-001');assert.equal(request.options.credentials,'same-origin');
 assert.equal(request.options.cache,'no-store');assert.equal(request.options.redirect,'error');assert.equal(result.status,'ready');
 const wrong=await readTrustedDecisions('COMIND',{fetchImpl:async()=>({ok:true,json:async()=>({project:'OTHER'})})});assert.equal(wrong.status,'failed');
 await assert.rejects(readTrustedDecisions('COMIND',{limit:101}),/Invalid decision read scope/);
});
test('shared reader controller drops superseded decision results',async()=>{
 const replies=[];let latest;const c=createTrustedReadController({onState:s=>latest=s,read:()=>new Promise(resolve=>replies.push(resolve))});
 const old=c.refresh('COMIND');const newer=c.refresh('OTHER');
 replies[1]({status:'forbidden',project:'OTHER',reason:'Project read denied.'});await newer;
 replies[0]({status:'ready',project:'COMIND',envelope:{data:[{id:'stale'}]}});await old;
 assert.equal(latest.status,'forbidden');assert.equal(latest.project,'OTHER');c.stop();
});
test('clearing a source cancels it and rejects a late successful result',async()=>{
 let finish,calls=0;const states=[];const c=createTrustedReadController({onState:s=>states.push(s),read:()=>{calls++;return new Promise(r=>finish=r);}});
 const pending=c.refresh('COMIND');c.clear('Source switched.');finish({status:'ready',project:'COMIND',envelope:{data:[{id:'stale'}]}});await pending;
 assert.equal(calls,1);assert.equal(states.at(-1).status,'missing');assert.equal(states.at(-1).project,null);c.stop();
});
