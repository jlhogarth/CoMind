import { z } from 'zod';
import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { buildPiReadGateway } from './read-gateway.js';
import { loadPrivatePrincipals, createFileAudit } from '../runbook/security.js';
import { createFoundryReadQuery, verifyFoundryReader } from '../foundry-read.js';
async function main(){
const config=z.object({PI_DRB_ORIGIN:z.string().url(),PI_UI_ORIGIN:z.string().url(),PI_DRB_ID:z.string().min(1),
 PI_SESSIONS_FILE:z.string().min(1),PI_DRB_CREDENTIALS_FILE:z.string().min(1),PI_AUDIT_FILE:z.string().min(1),PI_READ_PORT:z.coerce.number().int().min(1).max(65535),
 PI_FOUNDRY_DATABASE_URL:z.string().url().optional()}).parse(process.env);
if(new Set([config.PI_SESSIONS_FILE,config.PI_DRB_CREDENTIALS_FILE,config.PI_AUDIT_FILE]).size!==3)throw Error('Separate private files required');
await loadPrivatePrincipals(config.PI_SESSIONS_FILE);await loadPrivatePrincipals(config.PI_DRB_CREDENTIALS_FILE);
let foundryPool:Pool|undefined;
if(config.PI_FOUNDRY_DATABASE_URL){
 if(!/^postgres(ql)?:/.test(config.PI_FOUNDRY_DATABASE_URL))throw Error('Foundry reader requires a PostgreSQL URL');
 foundryPool=new Pool({connectionString:config.PI_FOUNDRY_DATABASE_URL,max:3,connectionTimeoutMillis:3000,query_timeout:5000});
 foundryPool.on('error',()=>console.error('PI Foundry reader unavailable'));
 try{await verifyFoundryReader(foundryPool);}catch(error){await foundryPool.end();throw error;}
}
const audit=createFileAudit(config.PI_AUDIT_FILE);
await audit({request_id:randomUUID(),observed_at:new Date().toISOString(),principal_id:null,operation:'service.start',status:200,project:null,kind:null});
const app=await buildPiReadGateway({upstream:config.PI_DRB_ORIGIN,origin:config.PI_UI_ORIGIN,backendId:config.PI_DRB_ID,
 loadSessions:()=>loadPrivatePrincipals(config.PI_SESSIONS_FILE),loadBackend:()=>loadPrivatePrincipals(config.PI_DRB_CREDENTIALS_FILE),audit,
 ...(foundryPool?{readFoundry:createFoundryReadQuery(foundryPool)}:{})});
if(foundryPool)app.addHook('onClose',async()=>{await foundryPool?.end();});
await app.listen({host:'127.0.0.1',port:config.PI_READ_PORT});
for(const signal of ['SIGINT','SIGTERM'] as const)process.once(signal,()=>{void app.close();});

}
void main().catch(()=>{console.error("PI trusted reader startup failed");process.exitCode=1;});
