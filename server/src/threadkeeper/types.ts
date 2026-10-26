export const THREADKEEPER_SCOPE_TYPES = [
  'conversation',
  'plan',
  'decision_lineage',
  'commitment',
  'handoff',
  'workstream',
  'governed_workflow',
] as const;

export type ThreadKeeperScopeType = typeof THREADKEEPER_SCOPE_TYPES[number];

export type ContinuityClassification =
  | 'INTACT'
  | 'CHANGED_WITH_LINEAGE'
  | 'SUSPECTED_BREAK'
  | 'CONFIRMED_BREAK'
  | 'UNRESOLVED_CONFLICT'
  | 'BLOCKED';

export type RouteCode =
  | 'REQUEST_EVIDENCE'
  | 'REQUEST_HELPER_ANALYSIS'
  | 'REQUEST_EPISTEMIC_REVIEW'
  | 'REQUEST_SEAL_REVIEW'
  | 'REQUEST_GOVERNANCE_REVIEW'
  | 'REQUEST_HUMAN_REVIEW'
  | 'PROPOSE_AUTHORIZED_DIVERGENCE'
  | 'RETAIN_UNRESOLVED'
  | 'PAUSE_DEPENDENT_ACTION';

export interface EvidenceRef {
  provider: string;
  kind: string;
  ref: string;
  version?: string;
  digest?: string;
  sensitivity?: string;
}

export interface ScopeBinding {
  scopeId?: string;
  scopeType: ThreadKeeperScopeType;
  namespace: string;
  subjectRef: string;
}

export interface ResolvedScopeBinding {
  scopeId: string | null;
  scopeType: ThreadKeeperScopeType;
  namespace: string;
  subjectRef: string;
  semanticKey: string;
}

export interface ContinuityObservation {
  observationId: string;
  eventType: string;
  sourceSystem: string;
  observedAt: string;
  scopeBinding: ScopeBinding;
  priorCheckpointRef?: string;
  currentStateRefs: string[];
  findingType?: string;
  findingSeverity?: string;
  confidence?: number;
  uncertainty?: number;
  evidenceRefs: EvidenceRef[];
  actorRef?: string;
  authorityRef?: string;
  policyRef?: string;
  correlationId?: string;
  causationRef?: string;
  traceId?: string;
  spanId?: string;
  sensitivity: string;
  retentionClass: string;
}

export type RequiredEvidenceStatus =
  | 'available'
  | 'missing'
  | 'unverifiable'
  | 'conflicting';

export interface AssessmentSignals {
  scopeStatus: 'valid' | 'invalid' | 'ambiguous';
  requiredEvidenceStatus: RequiredEvidenceStatus;
  acceptedBaselinePresent: boolean;
  checkpointIntegrityValid: boolean;
  checkpointAuthorityValid: boolean;
  predecessorStatus: 'valid' | 'broken';
  authoritativeConflict: boolean;
  authorizedChange: boolean;
  materialChange: boolean;
  incompatibilityProven: boolean;
}

export interface AssessmentContext {
  scopeSemanticKey: string;
  checkpointId: string | null;
  observationId: string;
  evidenceRefs: EvidenceRef[];
  signals: AssessmentSignals;
  traceId?: string;
}

export interface ContinuityAssessment {
  classification: ContinuityClassification;
  reasonCodes: string[];
  breakTypes: string[];
  confidence: number;
  uncertainty: number;
  scopeSemanticKey: string;
  checkpointId: string | null;
  observationId: string;
  evidenceRefs: EvidenceRef[];
  traceId?: string;
  assessorVersion: string;
}

export interface RouteRecommendation {
  routeCode: RouteCode;
  policyVersion: string;
  reasonCodes: string[];
  authorityRequired: boolean;
}

export interface ThreadKeeperCheckpointState {
  objectiveRefs: string[];
  decisionRefs: string[];
  commitmentRefs: string[];
  obligationRefs: string[];
  contextRefs: string[];
  evidenceRefs: EvidenceRef[];
  sourceRefs: EvidenceRef[];
  sensitivity: string;
  retentionClass: string;
}

export interface CheckpointProposalInput {
  proposalId: string;
  scopeSemanticKey: string;
  parentCheckpointId: string | null;
  currentAcceptedCheckpointId: string | null;
  proposedAt: string;
  proposedByRef: string;
  policyRef?: string;
  state: ThreadKeeperCheckpointState;
}

export interface CheckpointProposal extends CheckpointProposalInput {
  version: 1;
  stateDigest: string;
  digest: string;
}

export interface AuthorityValidationResult {
  valid: boolean;
  source: 'external' | 'threadkeeper';
  actorRef: string;
  evidenceRef: string;
  policyRef?: string;
}

export type CheckpointAcceptanceResult =
  | {
      accepted: true;
      proposalId: string;
      checkpointDigest: string;
      acceptedAt: string;
      acceptedByRef: string;
      authorityEvidenceRef: string;
      policyRef?: string;
    }
  | {
      accepted: false;
      reasonCode: string;
    };
