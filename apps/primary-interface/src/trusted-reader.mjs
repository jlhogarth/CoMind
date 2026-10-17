import { projectRunbookLanes } from './drb-lanes.mjs';
// Opt-in same-origin reader. No backend token or URL is accepted by this browser API.
export async function readTrustedLanes(project, { lane, limit=25, fetchImpl=globalThis.fetch }={}) {
  if(typeof project!=='string'||!/^[A-Z0-9_-]{1,64}$/.test(project)||!Number.isInteger(limit)||limit<1||limit>100
    ||(lane!==undefined&&(typeof lane!=='string'||!/^[A-Z0-9_-]{1,64}$/.test(lane))))throw new TypeError('Invalid lane read scope');
  const params=new URLSearchParams({project,limit:String(limit)});if(lane!==undefined)params.set('lane',lane);
  try{
    const response=await fetchImpl(`/api/pi/lanes?${params}`,{method:'GET',credentials:'same-origin',cache:'no-store',redirect:'error',signal:AbortSignal.timeout(7000)});
    if(!response.ok)return {status:response.status===401||response.status===403?'forbidden':'failed',project,reason:response.status===401?'Operator session missing, expired or revoked.':response.status===403?'Project read denied.':'Trusted reader unavailable.'};
    const envelope=await response.json();projectRunbookLanes(envelope,project);
    if(envelope.limit!==limit||envelope.lane!==(lane??null))throw Error('Source scope mismatch');
    return {status:'ready',project,envelope};
  }catch{return {status:'failed',project,reason:'Trusted reader failed or returned invalid source data.'};}
}
