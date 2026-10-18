import Fastify from 'fastify';
import { createHash, timingSafeEqual, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { type Principal, type AccessAudit, validatePrincipals } from '../runbook/security.js';

const querySchema = z.object({project:z.string().regex(/^[A-Z0-9_-]{1,64}$/),
  lane:z.string().regex(/^[A-Z0-9_-]{1,64}$/).optional(),limit:z.coerce.number().int().min(1).max(100).default(25)}).strict();
const text=z.string().max(65536).nullable().optional();
const rowSchema=z.object({id:z.string().uuid(),project_id:z.string().uuid(),project_key:z.string(),item_type:z.literal('lane'),
  work_key:z.string(),title:text,status:text,owner:text,current_summary:text,last_event_at:text,updated_at:text,priority:text,next_action:text});
const envelopeSchema=z.object({version:z.literal('drb-002.v1'),request_id:z.string().uuid(),retrieved_at:z.string().datetime({offset:true}),
  source:z.literal('comind_pm.v_runbook_lane_state'),project:z.string(),lane:z.string().nullable(),kind:z.literal('lanes'),limit:z.number().int(),
  source_relations:z.tuple([z.literal('comind_pm.v_runbook_lane_state'),z.literal('comind_pm.pm_work_items')]),more_available:z.boolean(),data:z.array(rowSchema).max(100)});
const decisionRowSchema=z.object({id:z.string().uuid(),work_item_id:z.string().uuid(),project_id:z.string().uuid(),item_type:z.string(),
  project_key:z.string(),work_key:z.string(),decision_needed:z.string(),options_json:z.string().max(65536),selected_option:text,
  rationale:text,reversibility:z.string(),decided_by:text,decided_at:text,created_at:z.string(),updated_at:z.string()});
const decisionEnvelopeSchema=z.object({version:z.literal('drb-002.v1'),request_id:z.string().uuid(),retrieved_at:z.string().datetime({offset:true}),
  source:z.literal('comind_pm.pm_decision_records'),project:z.string(),lane:z.string().nullable(),kind:z.literal('decisions'),limit:z.number().int(),
  source_relations:z.tuple([z.literal('comind_pm.pm_decision_records'),z.literal('comind_pm.pm_work_items'),z.literal('comind_pm.pm_projects')]),
  more_available:z.boolean(),data:z.array(decisionRowSchema).max(100)});
const foundryQuerySchema=z.object({project_id:z.string().uuid(),limit:z.coerce.number().int().min(1).max(100).default(25)}).strict();
const foundryRowSchema=z.object({authorization_request_id:z.string().uuid(),requesting_profile_id:z.string().uuid().nullable(),
  requesting_actor_id:z.string().uuid(),capability_id:z.string().uuid(),project_id:z.string().uuid(),task_id:z.string().uuid().nullable(),
  authority_level:z.string().max(32),environment:z.string().max(32),target_kind:z.string().max(128),target_ref:text,
  reason:z.string().max(65536),evidence_refs:z.array(z.unknown()).max(100),status:z.string().max(32),
  requested_at:z.string().datetime({offset:true}),expires_at:z.string().datetime({offset:true}).nullable()});
const foundryEnvelopeSchema=z.object({version:z.literal('pi-foundry.v1'),request_id:z.string().uuid(),
  retrieved_at:z.string().datetime({offset:true}),source:z.literal('comind.cm_foundry_authorization_request'),
  project_id:z.string().uuid(),limit:z.number().int(),source_relations:z.tuple([z.literal('comind.cm_foundry_authorization_request')]),
  more_available:z.boolean(),data:z.array(foundryRowSchema).max(100)});
const digest=(x:string)=>createHash('sha256').update(x).digest();
export type GatewayOptions={upstream:string; origin:string; backendId:string;
  loadSessions:()=>Promise<Principal[]>;loadBackend:()=>Promise<Principal[]>;audit:(record:AccessAudit)=>Promise<void>;
  readFoundry?:(projectId:string,limit:number)=>Promise<{rows:Record<string,unknown>[];moreAvailable:boolean}>;
  timeoutMs?:number;now?:()=>number};
export async function buildPiReadGateway(options:GatewayOptions){
  const upstream=new URL(options.upstream),origin=new URL(options.origin);
  // This executable is deliberately loopback-only isolation, not a remote production connector.
  if(upstream.protocol!=='http:'||upstream.hostname!=='127.0.0.1'||upstream.username||upstream.password||upstream.pathname!=='/'||upstream.search||upstream.hash)throw Error('Invalid isolated DRB origin');
  if(!['http:','https:'].includes(origin.protocol)||origin.hostname!=='127.0.0.1'||origin.origin!==options.origin)throw Error('Invalid isolated PI origin');
  const timeout=options.timeoutMs??5000;if(!Number.isInteger(timeout)||timeout<10||timeout>5000)throw Error('Invalid read timeout');
  const now=options.now??Date.now;
  const {projectRunbookLanes}=await import(new URL('../../../apps/primary-interface/src/drb-lanes.mjs',import.meta.url).href);
  const {projectRunbookDecisions}=await import(new URL('../../../apps/primary-interface/src/drb-decisions.mjs',import.meta.url).href);
  const app=Fastify({logger:false,bodyLimit:4096,requestTimeout:10000,trustProxy:false});
  const audits=new WeakMap<object,AccessAudit>();let active=0,windowStart=now(),requests=0;
  app.addHook('onRequest',async(req,reply)=>{
    const operation=req.url.startsWith('/api/pi/foundry-requests')?'pi.foundry':req.url.startsWith('/api/pi/decisions')?'pi.decisions':req.url.startsWith('/api/pi/lanes')?'pi.lanes':'unsupported';
    audits.set(req,{request_id:randomUUID(),observed_at:new Date(now()).toISOString(),principal_id:null,operation,status:0,project:null,kind:null});
    if(now()-windowStart>=60000){windowStart=now();requests=0;}
    if(++requests>120){reply.header('Retry-After','60');return reply.code(429).send({error:'rate_limited'});}
  });
  app.setErrorHandler((_error,_req,reply)=>reply.code(400).send({error:'request_rejected'}));
  app.addHook('onSend',async(req,reply,payload)=>{
    reply.header('Cache-Control','no-store').header('X-Content-Type-Options','nosniff').header('Vary','Cookie');
    const record=audits.get(req)!;record.status=reply.statusCode;
    try{await options.audit(record);}catch{reply.code(503).type('application/json');return JSON.stringify({error:'audit_unavailable'});}
    return payload;
  });
  app.get('/api/pi/lanes',async(req,reply)=>{
    const fail=(code:number,error:string)=>reply.code(code).send({error,request_id:audits.get(req)!.request_id});
    if((req.headers.origin&&req.headers.origin!==options.origin)||
      (req.headers['sec-fetch-site']&&!['same-origin','none'].includes(String(req.headers['sec-fetch-site']))))return fail(403,'forbidden');
    const cookies=(req.headers.cookie??'').split(';').map(x=>x.trim()).filter(x=>x.startsWith('__Host-comind_pi='));
    if(cookies.length!==1)return fail(401,'unauthorized');
    const token=cookies[0].slice('__Host-comind_pi='.length);
    if(!/^[A-Za-z0-9_-]{32,256}$/.test(token))return fail(401,'unauthorized');
    let session:Principal|undefined;
    try{session=validatePrincipals(await options.loadSessions()).find(p=>timingSafeEqual(digest(p.token),digest(token)));}catch{return fail(503,'sessions_unavailable');}
    if(!session||session.disabled||Date.parse(session.expiresAt)<=now())return fail(401,'unauthorized');
    audits.get(req)!.principal_id=session.id;
    const parsed=querySchema.safeParse(req.query);if(!parsed.success)return fail(400,'invalid_query');
    const input=parsed.data;audits.get(req)!.project=input.project;audits.get(req)!.kind='lanes';
    if(!session.projects.includes(input.project))return fail(403,'forbidden');
    let backend:Principal|undefined;
    try{backend=validatePrincipals(await options.loadBackend()).find(p=>p.id===options.backendId);}catch{return fail(503,'reader_unavailable');}
    if(!backend||backend.disabled||Date.parse(backend.expiresAt)<=now()||!backend.projects.includes(input.project)||backend.token===token)return fail(503,'reader_unavailable');
    if(active>=4)return fail(429,'busy');active++;
    try{
      const response=await fetch(new URL('/v1/runbook/query',upstream),{method:'POST',redirect:'manual',signal:AbortSignal.timeout(timeout),
        headers:{'Content-Type':'application/json',Authorization:`Bearer ${backend.token}`},body:JSON.stringify({...input,kind:'lanes'})});
      if(response.status!==200){await response.body?.cancel();return fail(response.status===403?403:503,response.status===403?'forbidden':'reader_unavailable');}
      if(!response.headers.get('content-type')?.startsWith('application/json')){await response.body?.cancel();return fail(502,'invalid_source');}
      let body='';let bytes=0;const reader=response.body?.getReader();if(!reader)return fail(502,'invalid_source');
      const decoder=new TextDecoder();try{for(;;){const part=await reader.read();if(part.done)break;bytes+=part.value.byteLength;if(bytes>262144){await reader.cancel();return fail(502,'invalid_source');}body+=decoder.decode(part.value,{stream:true});}}finally{reader.releaseLock();}body+=decoder.decode();
      const envelope=envelopeSchema.parse(JSON.parse(body));
      if(envelope.project!==input.project||envelope.lane!==(input.lane??null)||envelope.limit!==input.limit)throw Error('Source scope mismatch');
      projectRunbookLanes(envelope,input.project);
      // zod strips unreviewed fields at both row and envelope level before browser release.
      return reply.send(envelope);
    }catch{return fail(503,'reader_unavailable');}finally{active--;}
  });
  app.get('/api/pi/decisions',async(req,reply)=>{
    const fail=(code:number,error:string)=>reply.code(code).send({error,request_id:audits.get(req)!.request_id});
    if((req.headers.origin&&req.headers.origin!==options.origin)||
      (req.headers['sec-fetch-site']&&!['same-origin','none'].includes(String(req.headers['sec-fetch-site']))))return fail(403,'forbidden');
    const cookies=(req.headers.cookie??'').split(';').map(x=>x.trim()).filter(x=>x.startsWith('__Host-comind_pi='));
    if(cookies.length!==1)return fail(401,'unauthorized');
    const token=cookies[0].slice('__Host-comind_pi='.length);
    if(!/^[A-Za-z0-9_-]{32,256}$/.test(token))return fail(401,'unauthorized');
    let session:Principal|undefined;
    try{session=validatePrincipals(await options.loadSessions()).find(p=>timingSafeEqual(digest(p.token),digest(token)));}catch{return fail(503,'sessions_unavailable');}
    if(!session||session.disabled||Date.parse(session.expiresAt)<=now())return fail(401,'unauthorized');
    audits.get(req)!.principal_id=session.id;
    const parsed=querySchema.safeParse(req.query);if(!parsed.success)return fail(400,'invalid_query');
    const input=parsed.data;audits.get(req)!.project=input.project;audits.get(req)!.kind='decisions';
    if(!session.projects.includes(input.project))return fail(403,'forbidden');
    let backend:Principal|undefined;
    try{backend=validatePrincipals(await options.loadBackend()).find(p=>p.id===options.backendId);}catch{return fail(503,'reader_unavailable');}
    if(!backend||backend.disabled||Date.parse(backend.expiresAt)<=now()||!backend.projects.includes(input.project)||backend.token===token)return fail(503,'reader_unavailable');
    if(active>=4)return fail(429,'busy');active++;
    try{
      const response=await fetch(new URL('/v1/runbook/query',upstream),{method:'POST',redirect:'manual',signal:AbortSignal.timeout(timeout),
        headers:{'Content-Type':'application/json',Authorization:`Bearer ${backend.token}`},body:JSON.stringify({...input,kind:'decisions'})});
      if(response.status!==200){await response.body?.cancel();return fail(response.status===403?403:503,response.status===403?'forbidden':'reader_unavailable');}
      if(!response.headers.get('content-type')?.startsWith('application/json')){await response.body?.cancel();return fail(502,'invalid_source');}
      let body='';let bytes=0;const reader=response.body?.getReader();if(!reader)return fail(502,'invalid_source');
      const decoder=new TextDecoder();try{for(;;){const part=await reader.read();if(part.done)break;bytes+=part.value.byteLength;if(bytes>262144){await reader.cancel();return fail(502,'invalid_source');}body+=decoder.decode(part.value,{stream:true});}}finally{reader.releaseLock();}body+=decoder.decode();
      const envelope=decisionEnvelopeSchema.parse(JSON.parse(body));
      if(envelope.project!==input.project||envelope.lane!==(input.lane??null)||envelope.limit!==input.limit)throw Error('Source scope mismatch');
      projectRunbookDecisions(envelope,input.project);
      return reply.send(envelope);
    }catch{return fail(503,'reader_unavailable');}finally{active--;}
  });
  app.get('/api/pi/foundry-requests',async(req,reply)=>{
    const fail=(code:number,error:string)=>reply.code(code).send({error,request_id:audits.get(req)!.request_id});
    if((req.headers.origin&&req.headers.origin!==options.origin)||
      (req.headers['sec-fetch-site']&&!['same-origin','none'].includes(String(req.headers['sec-fetch-site']))))return fail(403,'forbidden');
    const cookies=(req.headers.cookie??'').split(';').map(x=>x.trim()).filter(x=>x.startsWith('__Host-comind_pi='));
    if(cookies.length!==1)return fail(401,'unauthorized');
    const token=cookies[0].slice('__Host-comind_pi='.length);
    if(!/^[A-Za-z0-9_-]{32,256}$/.test(token))return fail(401,'unauthorized');
    let session:Principal|undefined;
    try{session=validatePrincipals(await options.loadSessions()).find(p=>timingSafeEqual(digest(p.token),digest(token)));}catch{return fail(503,'sessions_unavailable');}
    if(!session||session.disabled||Date.parse(session.expiresAt)<=now())return fail(401,'unauthorized');
    audits.get(req)!.principal_id=session.id;
    const parsed=foundryQuerySchema.safeParse(req.query);if(!parsed.success)return fail(400,'invalid_query');
    const input=parsed.data;audits.get(req)!.project=input.project_id;audits.get(req)!.kind='foundry-requests';
    if(!session.foundryProjectIds?.some(id=>id.toLowerCase()===input.project_id.toLowerCase()))return fail(403,'forbidden');
    if(!options.readFoundry)return fail(503,'reader_unavailable');
    if(active>=4)return fail(429,'busy');active++;
    try{
      const result=await options.readFoundry(input.project_id,input.limit);
      const data=result.rows.map(row=>Object.fromEntries(Object.entries(row).map(([key,value])=>[key,value instanceof Date?value.toISOString():value])));
      const envelope=foundryEnvelopeSchema.parse({version:'pi-foundry.v1',request_id:audits.get(req)!.request_id,
        retrieved_at:new Date(now()).toISOString(),source:'comind.cm_foundry_authorization_request',project_id:input.project_id,
        limit:input.limit,source_relations:['comind.cm_foundry_authorization_request'],more_available:result.moreAvailable,data});
      if(Buffer.byteLength(JSON.stringify(envelope))>262144)return fail(502,'invalid_source');
      return reply.send(envelope);
    }catch{return fail(503,'reader_unavailable');}finally{active--;}
  });
  return app;
}
