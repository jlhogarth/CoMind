import { projectRunbookEvents } from './drb-events.mjs';
import { projectRunbookLanes } from './drb-lanes.mjs';
import { projectRunbookDecisions } from './drb-decisions.mjs';
import { projectFoundryRequests } from './foundry-requests.mjs';
// Opt-in same-origin reader. No backend token or URL is accepted by this browser API.
export async function readTrustedLanes(project, { lane, limit=25, fetchImpl=globalThis.fetch, signal }={}) {
  if(typeof project!=='string'||!/^[A-Z0-9_-]{1,64}$/.test(project)||!Number.isInteger(limit)||limit<1||limit>100
    ||(lane!==undefined&&(typeof lane!=='string'||!/^[A-Z0-9_-]{1,64}$/.test(lane))))throw new TypeError('Invalid lane read scope');
  const params=new URLSearchParams({project,limit:String(limit)});if(lane!==undefined)params.set('lane',lane);
  try{
    const response=await fetchImpl(`/api/pi/lanes?${params}`,{method:'GET',credentials:'same-origin',cache:'no-store',redirect:'error',signal:signal?AbortSignal.any([signal,AbortSignal.timeout(7000)]):AbortSignal.timeout(7000)});
    if(!response.ok)return {status:response.status===401||response.status===403?'forbidden':'failed',project,reason:response.status===401?'Operator session missing, expired or revoked.':response.status===403?'Project read denied.':'Trusted reader unavailable.'};
    const envelope=await response.json();projectRunbookLanes(envelope,project);
    if(envelope.limit!==limit||envelope.lane!==(lane??null))throw Error('Source scope mismatch');
    return {status:'ready',project,envelope};
  }catch{return {status:'failed',project,reason:'Trusted reader failed or returned invalid source data.'};}
}

export async function readTrustedDecisions(project, { lane, limit=25, fetchImpl=globalThis.fetch, signal }={}) {
  if(typeof project!=='string'||!/^[A-Z0-9_-]{1,64}$/.test(project)||!Number.isInteger(limit)||limit<1||limit>100
    ||(lane!==undefined&&(typeof lane!=='string'||!/^[A-Z0-9_-]{1,64}$/.test(lane))))throw new TypeError('Invalid decision read scope');
  const params=new URLSearchParams({project,limit:String(limit)});if(lane!==undefined)params.set('lane',lane);
  try{
    const response=await fetchImpl(`/api/pi/decisions?${params}`,{method:'GET',credentials:'same-origin',cache:'no-store',redirect:'error',signal:signal?AbortSignal.any([signal,AbortSignal.timeout(7000)]):AbortSignal.timeout(7000)});
    if(!response.ok)return {status:response.status===401||response.status===403?'forbidden':'failed',project,reason:response.status===401?'Operator session missing, expired or revoked.':response.status===403?'Project read denied.':'Trusted reader unavailable.'};
    const envelope=await response.json();projectRunbookDecisions(envelope,project);
    if(envelope.limit!==limit||envelope.lane!==(lane??null))throw Error('Source scope mismatch');
    return {status:'ready',project,envelope};
  }catch{return {status:'failed',project,reason:'Trusted reader failed or returned invalid source data.'};}
}

export async function readTrustedEvents(project, { lane, limit=25, fetchImpl=globalThis.fetch, signal }={}) {
  if(typeof project!=='string'||!/^[A-Z0-9_-]{1,64}$/.test(project)||!Number.isInteger(limit)||limit<1||limit>100
    ||(lane!==undefined&&(typeof lane!=='string'||!/^[A-Z0-9_-]{1,64}$/.test(lane))))throw new TypeError('Invalid RunBook event read scope');
  const params=new URLSearchParams({project,limit:String(limit)});if(lane!==undefined)params.set('lane',lane);
  try{
    const response=await fetchImpl(`/api/pi/events?${params}`,{method:'GET',credentials:'same-origin',cache:'no-store',redirect:'error',signal:signal?AbortSignal.any([signal,AbortSignal.timeout(7000)]):AbortSignal.timeout(7000)});
    if(!response.ok)return {status:response.status===401||response.status===403?'forbidden':'failed',project,reason:response.status===401?'Operator session missing, expired or revoked.':response.status===403?'Project read denied.':'Trusted reader unavailable.'};
    const envelope=await response.json();projectRunbookEvents(envelope,project);
    if(envelope.limit!==limit||envelope.lane!==(lane??null))throw Error('Source scope mismatch');
    return {status:'ready',project,envelope};
  }catch{return {status:'failed',project,reason:'Trusted reader failed or returned invalid source data.'};}
}

export async function readTrustedFoundryRequests(projectId, { limit=25, fetchImpl=globalThis.fetch, signal }={}) {
  if(typeof projectId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(projectId)
    ||!Number.isInteger(limit)||limit<1||limit>100)throw new TypeError('Invalid Foundry project read scope');
  const params=new URLSearchParams({project_id:projectId,limit:String(limit)});
  try{
    const response=await fetchImpl(`/api/pi/foundry-requests?${params}`,{method:'GET',credentials:'same-origin',cache:'no-store',redirect:'error',signal:signal?AbortSignal.any([signal,AbortSignal.timeout(7000)]):AbortSignal.timeout(7000)});
    if(!response.ok)return {status:response.status===401||response.status===403?'forbidden':'failed',project:projectId,reason:response.status===401?'Operator session missing, expired or revoked.':response.status===403?'Foundry project read denied.':'Trusted Foundry reader unavailable.'};
    const envelope=await response.json();const projection=projectFoundryRequests(envelope,projectId);
    if(envelope.limit!==limit)throw Error('Source scope mismatch');
    return {status:'ready',project:projectId,envelope,projection};
  }catch{return {status:'failed',project:projectId,reason:'Trusted Foundry reader failed or returned invalid source data.'};}
}

// One controller owns the displayed source. Late or canceled completions cannot republish data.
export function createTrustedReadController({onState,read=readTrustedLanes}={}) {
  if(typeof onState!=='function'||typeof read!=='function')throw new TypeError('Reader and state observer required');
  let generation=0,active=null,stopped=false;
  return {
    clear(reason='Source selection changed.') {
      if(stopped)return;
      generation++;active?.abort();active=null;onState({status:'missing',project:null,reason});
    },
    async refresh(project,options={}) {
      if(stopped)return;
      const current=++generation;active?.abort();const request=new AbortController();active=request;
      onState({status:'loading',project,reason:'Reading source. Previous results are cleared.'});
      let state;
      try{state=await read(project,{...options,signal:request.signal});}
      catch{state={status:'failed',project,reason:'Trusted reader failed. No previous source snapshot is retained.'};}
      if(stopped||current!==generation||request.signal.aborted)return;
      // Keep source identity pinned to the requested project even with a custom test reader.
      if(!state||state.project!==project||!['ready','failed','forbidden'].includes(state.status))state={status:'failed',project,reason:'Reader returned an invalid state.'};
      active=null;onState(state);
    },
    stop(){if(stopped)return;stopped=true;generation++;active?.abort();active=null;},
  };
}
export const createLaneReadController=createTrustedReadController;
