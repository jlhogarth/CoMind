export type AedRecoveryEvent = {
  type: string;
  at: string;
  verified: boolean;
};

export type AedRecoveryLane = {
  workKey: string;
  status: string;
  actionable: boolean;
  dependenciesValid: boolean;
  expectedProgressBy: string;
  nextAction: string;
  events: AedRecoveryEvent[];
  waiting?: boolean;
  wakeCondition?: string | null;
  blocked?: boolean;
  blocker?: string | null;
  blockerOwner?: string | null;
  mandatoryStop?: boolean;
  stopReason?: string | null;
  productionChange?: boolean;
  josephActionRequired?: boolean;
};

export type AedClearInput = {
  l4aAuthorized?: boolean;
  oneIssueOneBranchOnePr?: boolean;
  noPlaceholder?: boolean;
  collisionClear?: boolean;
  freshnessClear?: boolean;
  dependencyValid?: boolean;
  costGuardrailClear?: boolean;
  productionChange?: boolean;
  productionAuthorized?: boolean;
  secretsPresent?: boolean;
};

export type AedRecoveryMode = 'recover' | 'stale_lease_probe';

export type AedRecoveryWorkflowInput = {
  caseId: string;
  taskId: string;
  controller: string;
  now: string;
  recoveryProgressAt: string;
  lane: AedRecoveryLane;
  safety: AedClearInput;
  mode: AedRecoveryMode;
};

export type AedRecoveryAssessment = {
  action: 'RECOVER' | 'NUDGE' | 'NO_DISPATCH' | 'ESCALATE_OR_HOLD';
  reason: string | null;
  failedSafety: string[];
  liveness: string | null;
  aedLevel: string;
  diagnosis: string;
  lastProgressAt: string | null;
  nextAction: string | null;
};

export type AedFencedRecoveryResult = {
  status: 'recovered' | 'lease_rejected' | 'claim_unavailable' | 'task_mismatch' | 'mutation_rejected';
  reason: string;
  taskId: string;
  workerInstanceId: string;
  fencingEpoch: number | null;
  currentFencingEpoch: number | null;
  mutationApplied: boolean;
  leaseCompleted: boolean;
  progressEvent: AedRecoveryEvent | null;
};

export type AedProgressVerification = {
  advanced: boolean;
  beforeAt: string | null;
  afterAt: string | null;
};

export type AedRecoveryProjection = {
  caseId: string;
  workKey: string;
  liveness: string | null;
  aedLevel: string;
  controller: string;
  taskId: string;
  fencingEpoch: number | null;
  lastObservedAt: string;
  lastProgressAt: string | null;
  diagnosis: string;
  intervention: string | null;
  verification: 'advanced' | 'not_advanced' | 'not_attempted';
  outcome: 'RECOVERED' | 'ESCALATED_OR_HOLD';
  escalationReason: string | null;
  josephActionRequired: boolean;
  productionChange: boolean;
};

export type AedRecoveryWorkflowResult = {
  outcome: 'RECOVERED' | 'ESCALATED_OR_HOLD';
  assessment: AedRecoveryAssessment;
  shock: AedFencedRecoveryResult | null;
  verification: AedProgressVerification | null;
  projection: AedRecoveryProjection;
};
