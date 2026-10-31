import { AEL_CLASSIFICATIONS, AelClassification, AelModality, AelSourceKind } from './event-envelope.js';
import { runRequiredRulebookOperationalPreflight } from '../rulebook-operational-authority.js';
import { RulebookExecutionDecision, RulebookExecutionPreflightError, RulebookExecutionPreflightEvaluator } from '../providers/rulebook-execution-preflight.js';

export const AEL_CAPTURE_OPERATIONS = ['source_open','retain_original','create_derivative','extract_observation','external_processing','identity_biometric','agent_observation_access','agent_original_access','external_disclosure','retention_extension','disposition_request'] as const;
export type AelCaptureOperation = typeof AEL_CAPTURE_OPERATIONS[number];
export type AelCaptureOutcome = 'ALLOW'|'DENY'|'REVIEW'|'AUTH_REQUIRED'|'SCOPE_REQUIRED'|'EXPIRED'|'REVOKED'|'HUMAN_CONFIRMATION_REQUIRED';

export interface AelCaptureAuthority {
  readonly authorityRef: string; readonly status: 'active'|'revoked'|'suspended'; readonly expiresAt: string;
  readonly tenantId: string; readonly projectId: string; readonly sourceId: string;
  readonly sourceKinds: readonly AelSourceKind[]; readonly modalities: readonly AelModality[]; readonly purposes: readonly string[];
  readonly operations: readonly AelCaptureOperation[]; readonly maxClassification: AelClassification;
  readonly retentionProfileRef?: string; readonly residencyProfileRef?: string; readonly locationScopes?: readonly string[];
  readonly identificationEnabled: boolean; readonly allowedActorRefs?: readonly string[]; readonly humanConfirmationRequired: boolean;
}
export interface AelCaptureRequest {
  readonly tenantId: string; readonly projectId: string; readonly sourceId: string; readonly sourceKind: AelSourceKind; readonly modality: AelModality;
  readonly purpose: string; readonly operation: AelCaptureOperation; readonly classification: AelClassification; readonly actorRef?: string;
  readonly locationScope?: string; readonly retentionProfileRef?: string; readonly residencyProfileRef?: string; readonly humanConfirmed: boolean;
  readonly destination?: { readonly key: string; readonly region: string };
}
export interface AelCaptureDecision { readonly outcome: AelCaptureOutcome; readonly reasonCodes: readonly string[]; readonly authorityRef?: string; readonly rulebookDecisions: readonly RulebookExecutionDecision[]; }

const rank = new Map(AEL_CLASSIFICATIONS.map((v,i)=>[v,i]));
const externalOps = new Set<AelCaptureOperation>(['external_processing','external_disclosure']);
const agentOps = new Set<AelCaptureOperation>(['agent_observation_access','agent_original_access']);
const result=(outcome:AelCaptureOutcome, reason:string, authority?:AelCaptureAuthority, rb:readonly RulebookExecutionDecision[]=[]):AelCaptureDecision=>Object.freeze({outcome,reasonCodes:Object.freeze([reason]),...(authority?{authorityRef:authority.authorityRef}:{}),rulebookDecisions:Object.freeze([...rb])});

export async function evaluateAelCaptureAuthority(input:{readonly authority?:AelCaptureAuthority|null;readonly request:AelCaptureRequest;readonly evaluator?:RulebookExecutionPreflightEvaluator;readonly now?:string}):Promise<AelCaptureDecision>{
  const a=input.authority, r=input.request;
  if(!a) return result('AUTH_REQUIRED','authority_missing');
  if(a.status!=='active') return result('REVOKED',a.status==='revoked'?'authority_revoked':'authority_suspended',a);
  const now=Date.parse(input.now??new Date().toISOString()), expiry=Date.parse(a.expiresAt);
  if(!Number.isFinite(expiry)||!Number.isFinite(now)) return result('REVIEW','authority_time_invalid',a);
  if(expiry<=now) return result('EXPIRED','authority_expired',a);
  if(a.tenantId!==r.tenantId||a.projectId!==r.projectId) return result('DENY','tenant_project_mismatch',a);
  if(a.sourceId!==r.sourceId||!a.sourceKinds.includes(r.sourceKind)) return result('DENY','source_mismatch',a);
  if(!a.modalities.includes(r.modality)) return result('DENY','modality_not_allowed',a);
  if(!a.purposes.includes(r.purpose)) return result('DENY','purpose_not_allowed',a);
  if(!a.operations.includes(r.operation)) return result('DENY','operation_not_allowed',a);
  if((rank.get(r.classification)??99)>(rank.get(a.maxClassification)??-1)) return result('DENY','classification_exceeds_authority',a);
  if(a.retentionProfileRef&&a.retentionProfileRef!==r.retentionProfileRef) return result('DENY','retention_profile_mismatch',a);
  if(a.residencyProfileRef&&a.residencyProfileRef!==r.residencyProfileRef) return result('DENY','residency_profile_mismatch',a);
  if(a.locationScopes?.length&&!r.locationScope) return result('SCOPE_REQUIRED','location_scope_required',a);
  if(a.locationScopes?.length&&!a.locationScopes.includes(r.locationScope!)) return result('DENY','location_scope_mismatch',a);
  if(r.operation==='identity_biometric'&&!a.identificationEnabled) return result('DENY','identification_disabled',a);
  if(agentOps.has(r.operation)&&(!r.actorRef||!a.allowedActorRefs?.includes(r.actorRef))) return result('DENY','actor_access_not_allowed',a);
  if(externalOps.has(r.operation)&&!r.destination) return result('SCOPE_REQUIRED','egress_destination_required',a);
  if(a.humanConfirmationRequired&&!r.humanConfirmed) return result('HUMAN_CONFIRMATION_REQUIRED','runtime_human_confirmation_required',a);
  if(!input.evaluator) return result('DENY','rulebook_preflight_unavailable',a);
  try {
    const tenant=`tenant:${r.tenantId}`, project=`project:${r.projectId}`;
    const decisions=await runRequiredRulebookOperationalPreflight({evaluator:input.evaluator,governance:{source_tenant:tenant,target_tenant:tenant,source_project:project,target_project:project,action:`ael.${r.operation}`,untrusted_input:false,asks_for_secrets:false,authority_escalation:false,side_effect:true,human_approved:r.humanConfirmed},...(r.destination?{egress:{asset_key:r.sourceId,destination_key:r.destination.key,region:r.destination.region,tenant_key:tenant,purpose:r.purpose}}:{})});
    return result('ALLOW','authorized',a,decisions);
  } catch(error){
    if(error instanceof RulebookExecutionPreflightError){
      if(error.decision==='review') return result('REVIEW',error.reasonCode??'rulebook_review',a);
      return result('DENY',error.reasonCode??error.code,a);
    }
    return result('DENY','rulebook_preflight_unavailable',a);
  }
}
