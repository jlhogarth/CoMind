const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function projectFoundryRequests(envelope, projectId) {
  if(!UUID.test(projectId)||!envelope||envelope.version!=='pi-foundry.v1'
    ||envelope.source!=='comind.cm_foundry_authorization_request'||envelope.project_id?.toLowerCase()!==projectId.toLowerCase()
    ||!UUID.test(envelope.request_id)||!Number.isInteger(envelope.limit)||envelope.limit<1||envelope.limit>100
    ||!Number.isFinite(Date.parse(envelope.retrieved_at))||typeof envelope.more_available!=='boolean'
    ||!Array.isArray(envelope.source_relations)||envelope.source_relations.length!==1
    ||envelope.source_relations[0]!=='comind.cm_foundry_authorization_request'||!Array.isArray(envelope.data)
    ||envelope.data.length>envelope.limit)throw new Error('Invalid canonical Foundry request projection');
  const seen=new Set();
  for(const row of envelope.data){
    if(!row||!UUID.test(row.authorization_request_id)||seen.has(row.authorization_request_id.toLowerCase())
      ||!(row.requesting_profile_id===null||UUID.test(row.requesting_profile_id))||!UUID.test(row.requesting_actor_id)||!UUID.test(row.capability_id)
      ||row.project_id?.toLowerCase()!==projectId.toLowerCase()||!(row.task_id===null||UUID.test(row.task_id))
      ||!['C0','C1','C2','C3','C4'].includes(row.authority_level)
      ||!['isolated','staging','production'].includes(row.environment)
      ||typeof row.target_kind!=='string'||typeof row.reason!=='string'
      ||!['pending','approved','denied','cancelled','expired'].includes(row.status)
      ||!Array.isArray(row.evidence_refs)||!Number.isFinite(Date.parse(row.requested_at))
      ||!(row.expires_at===null||Number.isFinite(Date.parse(row.expires_at))))throw new Error('Invalid canonical Foundry authorization request');
    seen.add(row.authorization_request_id.toLowerCase());
  }
  return {status:'ready',source:'comind.cm_foundry_authorization_request',projectId,
    observedAt:envelope.retrieved_at,limit:envelope.limit,moreAvailable:envelope.more_available,
    coverage:{kind:'bounded-page',returned:envelope.data.length,total:null},
    records:envelope.data.map(source=>({id:source.authorization_request_id,source:{...source},decisionEnabled:false}))};
}
