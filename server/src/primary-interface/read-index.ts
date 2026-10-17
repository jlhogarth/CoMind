import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { buildPiReadGateway } from './read-gateway.js';
import { loadPrivatePrincipals, createFileAudit } from '../runbook/security.js';
async function main(){
const config=z.object({PI_DRB_ORIGIN:z.string().url(),PI_UI_ORIGIN:z.string().url(),PI_DRB_ID:z.string().min(1),
 PI_SESSIONS_FILE:z.string().min(1),PI_DRB_CREDENTIALS_FILE:z.string().min(1),PI_AUDIT_FILE:z.string().min(1),PI_READ_PORT:z.coerce.number().int().min(1).max(65535)}).parse(process.env);
if(new Set([config.PI_SESSIONS_FILE,config.PI_DRB_CREDENTIALS_FILE,config.PI_AUDIT_FILE]).size!==3)throw Error('Separate private files required');
await loadPrivatePrincipals(config.PI_SESSIONS_FILE);await loadPrivatePrincipals(config.PI_DRB_CREDENTIALS_FILE);
const audit=createFileAudit(config.PI_AUDIT_FILE);
await audit({request_id:randomUUID(),observed_at:new Date().toISOString(),principal_id:null,operation:'service.start',status:200,project:null,kind:null});
const app=await buildPiReadGateway({upstream:config.PI_DRB_ORIGIN,origin:config.PI_UI_ORIGIN,backendId:config.PI_DRB_ID,
 loadSessions:()=>loadPrivatePrincipals(config.PI_SESSIONS_FILE),loadBackend:()=>loadPrivatePrincipals(config.PI_DRB_CREDENTIALS_FILE),audit});
await app.listen({host:'127.0.0.1',port:config.PI_READ_PORT});
for(const signal of ['SIGINT','SIGTERM'] as const)process.once(signal,()=>{void app.close();});

}
void main().catch(()=>{console.error("PI trusted reader startup failed");process.exitCode=1;});
