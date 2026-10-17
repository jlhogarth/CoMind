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
