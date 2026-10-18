import test from 'node:test';import assert from 'node:assert/strict';
import {readTrustedLanes} from '../src/trusted-reader.mjs';
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
