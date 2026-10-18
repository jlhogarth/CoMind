import { constants } from 'node:fs';
import { open } from 'node:fs/promises';
import { dirname, isAbsolute } from 'node:path';
import { z } from 'zod';

export const principalSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9_.-]{1,64}$/),
  token: z.string().min(32).max(256),
  projects: z.array(z.string().regex(/^[A-Z0-9_-]{1,64}$/)).min(1).max(100),
  foundryProjectIds: z.array(z.string().uuid()).max(100).optional(),
  expiresAt: z.string().datetime({ offset: true }),
  disabled: z.boolean().optional(),
}).strict();
export type Principal = z.infer<typeof principalSchema>;
const foundryPrincipalSchema=z.object({id:z.string().regex(/^[A-Za-z0-9_.-]{1,64}$/),token:z.string().min(32).max(256),
  projectIds:z.array(z.string().uuid()).min(1).max(100),expiresAt:z.string().datetime({offset:true}),disabled:z.boolean().optional()}).strict();
export type FoundryPrincipal=z.infer<typeof foundryPrincipalSchema>;
export function validatePrincipals(value: unknown): Principal[] {
  const list = z.array(principalSchema).min(1).max(64).parse(value);
  if (new Set(list.map(p => p.id)).size !== list.length || new Set(list.map(p => p.token)).size !== list.length
    || list.some(p=>p.foundryProjectIds&&new Set(p.foundryProjectIds.map(x=>x.toLowerCase())).size!==p.foundryProjectIds.length)) {
    throw new Error('Duplicate RunBook principal configuration');
  }
  return list;
}
export function validateFoundryPrincipals(value:unknown):FoundryPrincipal[]{
 const list=z.array(foundryPrincipalSchema).min(1).max(64).parse(value);
 if(new Set(list.map(p=>p.id)).size!==list.length||new Set(list.map(p=>p.token)).size!==list.length
  ||list.some(p=>new Set(p.projectIds.map(x=>x.toLowerCase())).size!==p.projectIds.length))throw new Error('Duplicate Foundry principal configuration');
 return list;
}
async function privateFile(path: string, flags: number, maximum: number) {
  if (!isAbsolute(path)) throw new Error('RunBook private file must use an absolute path');
  const file = await open(path, flags | constants.O_NOFOLLOW, 0o600);
  try {
    const stat = await file.stat();
    if (!stat.isFile() || (stat.mode & 0o077) !== 0 || stat.uid !== process.getuid?.() || stat.size > maximum) {
      throw new Error('RunBook private file permissions, owner or size invalid');
    }
    return file;
  } catch (error) { await file.close(); throw error; }
}
export async function loadPrivatePrincipals(path: string): Promise<Principal[]> {
  const file = await privateFile(path, constants.O_RDONLY, 65536);
  try { return validatePrincipals(JSON.parse(await file.readFile('utf8'))); }
  finally { await file.close(); }
}
export async function loadPrivateFoundryPrincipals(path:string):Promise<FoundryPrincipal[]>{
 const file=await privateFile(path,constants.O_RDONLY,65536);
 try{return validateFoundryPrincipals(JSON.parse(await file.readFile('utf8')));}finally{await file.close();}
}
export type AccessAudit = {
  request_id: string; observed_at: string; principal_id: string | null;
  operation: 'pi.lanes' | 'pi.decisions' | 'pi.foundry' | 'runbook.query' | 'unsupported' | 'service.start'; status: number;
  project: string | null; kind: string | null;
};
export function createFileAudit(path: string, maximumBytes = 50 * 1024 * 1024) {
  let tail: Promise<void> = Promise.resolve();
  let pending = 0;
  return async (record: AccessAudit): Promise<void> => {
    if (pending >= 32) throw new Error('RunBook audit queue full');
    const line = JSON.stringify(record) + '\n';
    if (Buffer.byteLength(line) > 2048) throw new Error('RunBook audit record exceeds bound');
    pending++;
    const work = tail.then(async () => {
      const file = await privateFile(path, constants.O_WRONLY | constants.O_APPEND | constants.O_CREAT, maximumBytes);
      try {
        if ((await file.stat()).size + Buffer.byteLength(line) > maximumBytes) throw new Error('RunBook audit capacity exceeded');
        await file.writeFile(line); await file.sync();
        const directory = await open(dirname(path), constants.O_RDONLY | constants.O_DIRECTORY);
        try { await directory.sync(); } finally { await directory.close(); }
      } finally { await file.close(); }
    });
    tail = work.catch(() => {});
    try { await work; } finally { pending--; }
  };
}
