// WEB-001 isolated Cloudflare Worker API. Not deployed until privacy/security acceptance.
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, TURNSTILE_SECRET.
// Cloudflare Turnstile must be verified server-side for each contribution.
const json=(obj,status=200)=>new Response(JSON.stringify(obj),{status,headers:{'content-type':'application/json;charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
const hex=bytes=>Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
const digest=async value=>hex(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))));
const originAllowed=(request,env)=>request.headers.get('origin')===env.ALLOWED_ORIGIN;
async function supa(env,path,method,body,prefer){const h={'apikey':env.SUPABASE_SERVICE_ROLE_KEY,'authorization':'Bearer '+env.SUPABASE_SERVICE_ROLE_KEY,'content-type':'application/json'};if(prefer)h.prefer=prefer;const r=await fetch(env.SUPABASE_URL.replace(/\/$/,'')+'/rest/v1/'+path,{method,headers:h,body:body===undefined?undefined:JSON.stringify(body),redirect:'error'});if(!r.ok)throw Error('storage failure '+r.status);return r.status===204?null:await r.json()}
const trim=(v,max)=>typeof v==='string'?v.trim().slice(0,max+1):'';
export default {async fetch(request,env){try{
if(!['POST','DELETE'].includes(request.method))return json({error:'method_not_allowed'},405);
if(!env.ALLOWED_ORIGIN||!originAllowed(request,env))return json({error:'forbidden_origin'},403);
if(!env.SUPABASE_URL||!env.SUPABASE_SERVICE_ROLE_KEY||!env.TURNSTILE_SECRET)return json({error:'not_configured'},503);
if(request.method==='POST'){
if(request.headers.get('content-type')?.split(';')[0]!=='application/json')return json({error:'unsupported_media_type'},415);
const length=Number(request.headers.get('content-length'));if(length>7500)return json({error:'payload_too_large'},413);
const raw=await request.text();if(new TextEncoder().encode(raw).length>7500)return json({error:'payload_too_large'},413);
let body;try{body=JSON.parse(raw)}catch{return json({error:'invalid_json'},400)}
const question=trim(body.question,1500),why=trim(body.why,1500),known=trim(body.known,1500),unknown=trim(body.unknown,1500);
if(question.length<10||question.length>1500||[why,known,unknown].some(v=>v.length>1500)||body.consent!==true||body.consent_version!=='web-curiosity-v1')return json({error:'invalid_contribution_or_consent'},422);
if(typeof body.turnstile_token!=='string'||body.turnstile_token.length>2048)return json({error:'challenge_required'},422);
const verification=await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify',{method:'POST',body:new URLSearchParams({secret:env.TURNSTILE_SECRET,response:body.turnstile_token}),redirect:'error'});if(!verification.ok)return json({error:'challenge_unavailable'},503);
const v=await verification.json();if(v.success!==true||v.hostname!==new URL(env.ALLOWED_ORIGIN).hostname)return json({error:'challenge_failed'},403);
const token=hex(crypto.getRandomValues(new Uint8Array(32))),hash=await digest(token);
const rows=await supa(env,'comind_visitor_contributions?select=contribution_id,created_at,expires_at','POST',{question,why_it_matters:why||null,known_context:known||null,uncertainty:unknown||null,consent_version:'web-curiosity-v1',withdrawal_token_hash:hash},'return=representation');
if(!Array.isArray(rows)||rows.length!==1)throw Error('storage result mismatch');
return json({contribution_id:rows[0].contribution_id,withdrawal_token:token,created_at:rows[0].created_at,expires_at:rows[0].expires_at},201);
}
const id=new URL(request.url).pathname.match(/^\/contributions\/([0-9a-f-]{36})$/i)?.[1];if(!id)return json({error:'not_found'},404);
const token=request.headers.get('x-withdrawal-token');if(!token||!/^[a-f0-9]{64}$/.test(token))return json({error:'invalid_token'},403);
const hash=await digest(token);
const query='comind_visitor_contributions?contribution_id=eq.'+encodeURIComponent(id)+'&withdrawal_token_hash=eq.'+hash;
const rows=await supa(env,query+'&select=contribution_id','PATCH',{status:'withdrawn',question:'[withdrawn]',why_it_matters:null,known_context:null,uncertainty:null,withdrawn_at:new Date().toISOString()},'return=representation');
return rows?.length===1?json({withdrawn:true}):json({error:'not_found'},404);
}catch(e){return json({error:'internal_error'},500)}}};
