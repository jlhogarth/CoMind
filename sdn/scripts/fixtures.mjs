import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
const baseUrl=process.env.SDN_INGEST_URL??'http://127.0.0.1:3100';
const token=process.env.SDN_TEST_PRODUCER_TOKEN;
const producerId=process.env.SDN_TEST_PRODUCER_ID??'11111111-1111-4111-8111-111111111111';
if(!token) throw new Error('SDN_TEST_PRODUCER_TOKEN is required');
const ids={a:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',d1:'dddddddd-dddd-4ddd-8ddd-ddddddddddd1',d2:'dddddddd-dddd-4ddd-8ddd-ddddddddddd2',e1:'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1',e2:'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2',c1:'cccccccc-cccc-4ccc-8ccc-ccccccccccc1'};
const sourceTimestamp='2026-10-15T18:00:00-04:00';
async function request(path,body){const response=await fetch(`${baseUrl}${path}`,{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${token}`},body:JSON.stringify(body)});return {status:response.status,json:await response.json()};}
const unauthorized=await fetch(`${baseUrl}/v1/events`,{method:'POST',headers:{'content-type':'application/json'},body:'{}'}); assert.equal(unauthorized.status,401);
const authoritative=await request('/v1/events',{eventId:ids.a,producerId,eventType:'authoritative.decision',lifecycleHint:'E',sourceTimestamp,payload:{decision:'retain-accountability',approved:true,synthetic:true}}); assert.equal(authoritative.status,201); assert.equal(authoritative.json.lifecycleClass,'A');
const batch=await request('/v1/events/batch',{events:[
 {eventId:ids.d1,producerId,eventType:'metric.sample',lifecycleHint:'A',sourceTimestamp,payload:{metric:'queue_depth',value:7,unit:'items',synthetic:true}},
 {eventId:ids.d2,producerId,eventType:'metric.sample',sourceTimestamp,payload:{metric:'queue_depth',value:9,unit:'items',synthetic:true},provenance:[{relation:'derived-from-decision',sourceProducerId:producerId,sourceEventId:ids.a}]},
 {eventId:ids.e1,producerId,eventType:'ops.state',sourceTimestamp,payload:{component:'worker-a',state:'idle',synthetic:true}},
 {eventId:ids.e2,producerId,eventType:'ops.state',sourceTimestamp,payload:{component:'worker-b',state:'ready',synthetic:true}}
]}); assert.equal(batch.status,207); assert.deepEqual(batch.json.results.map(x=>x.lifecycleClass),['D','D','E','E']); assert.ok(batch.json.results.every(x=>x.status===201));
const duplicate=await request('/v1/events',{eventId:ids.d1,producerId,eventType:'metric.sample',sourceTimestamp,payload:{metric:'queue_depth',value:7,unit:'items',synthetic:true}}); assert.equal(duplicate.status,200); assert.equal(duplicate.json.disposition,'duplicate'); assert.equal(duplicate.json.receiptId,batch.json.results[0].receiptId);
const conflict=await request('/v1/events',{eventId:ids.d1,producerId,eventType:'metric.sample',sourceTimestamp,payload:{metric:'queue_depth',value:7000,unit:'items',synthetic:true,changed:true}}); assert.equal(conflict.status,409); assert.equal(conflict.json.error,'event_identity_payload_conflict');
const missingPolicy=await request('/v1/events',{eventId:ids.c1,producerId,eventType:'diagnostic.sample',sourceTimestamp,payload:{diagnostic:'synthetic missing-policy proof'}}); assert.equal(missingPolicy.status,422); assert.equal(missingPolicy.json.error,'missing_active_retention_policy');
const evidence={producerId,ids,authoritative:authoritative.json,batch:batch.json,duplicate:duplicate.json,conflict:conflict.json,missingPolicy:missingPolicy.json}; console.log(JSON.stringify(evidence,null,2)); if(process.env.SDN_FIXTURE_EVIDENCE_PATH) await writeFile(process.env.SDN_FIXTURE_EVIDENCE_PATH,JSON.stringify(evidence,null,2));
