export type ComputeRoute = 'LOCAL' | 'API_BATCH' | 'API_REALTIME' | 'CHAT_WORK';
export type RiskTier = 'low' | 'medium' | 'high' | 'critical';
export type DataSensitivity = 'public' | 'internal' | 'confidential' | 'restricted';
export type CostEvidenceState = 'fresh' | 'stale' | 'unknown' | 'not_required';

export interface RouteCapability {
  available: boolean;
  sufficient: boolean;
  qualityScore: number;
  maxSensitivity: DataSensitivity;
  estimatedCostUsd: number | null;
  costEvidence: CostEvidenceState;
}

export interface ComputeRoutingRequest {
  taskClass: string;
  requiresBrowser: boolean;
  requiresAuthenticatedUi: boolean;
  requiresHumanInteraction: boolean;
  deferredAllowed: boolean;
  maxLatencySeconds: number;
  bulkWork: boolean;
  requiredQualityScore: number;
  riskTier: RiskTier;
  dataSensitivity: DataSensitivity;
  userImportance: number;
  humanApprovalRequired: boolean;
  humanApprovalGranted: boolean;
  routes: Record<ComputeRoute, RouteCapability>;
}

export interface RejectedRoute {
  route: ComputeRoute;
  reasons: string[];
}

export interface ComputeRoutingDecision {
  status: 'ROUTED' | 'BLOCKED';
  selectedRoute: ComputeRoute | null;
  rationale: string[];
  rejectedRoutes: RejectedRoute[];
  confidence: 'high' | 'medium' | 'low';
  escalationReason: string | null;
}

const SENSITIVITY_RANK: Record<DataSensitivity, number> = {
  public: 0,
  internal: 1,
  confidential: 2,
  restricted: 3,
};

const ROUTE_TIE_BREAK: Record<ComputeRoute, number> = {
  LOCAL: 0,
  API_BATCH: 1,
  API_REALTIME: 2,
  CHAT_WORK: 3,
};

function validateRequest(request: ComputeRoutingRequest): void {
  if (!request.taskClass.trim()) throw new Error('taskClass_required');
  if (!Number.isFinite(request.maxLatencySeconds) || request.maxLatencySeconds < 0) {
    throw new Error('invalid_maxLatencySeconds');
  }
  if (!Number.isFinite(request.requiredQualityScore) || request.requiredQualityScore < 0 || request.requiredQualityScore > 100) {
    throw new Error('invalid_requiredQualityScore');
  }
  if (!Number.isFinite(request.userImportance) || request.userImportance < 0 || request.userImportance > 100) {
    throw new Error('invalid_userImportance');
  }
  for (const [route, capability] of Object.entries(request.routes)) {
    if (!Number.isFinite(capability.qualityScore) || capability.qualityScore < 0 || capability.qualityScore > 100) {
      throw new Error(`invalid_qualityScore:${route}`);
    }
    if (capability.estimatedCostUsd !== null && (!Number.isFinite(capability.estimatedCostUsd) || capability.estimatedCostUsd < 0)) {
      throw new Error(`invalid_estimatedCostUsd:${route}`);
    }
  }
}

function routeRejectionReasons(route: ComputeRoute, capability: RouteCapability, request: ComputeRoutingRequest): string[] {
  const reasons: string[] = [];

  if (!capability.available) reasons.push('route_unavailable');
  if (!capability.sufficient) reasons.push('capability_insufficient');
  if (capability.qualityScore < request.requiredQualityScore) reasons.push('quality_below_requirement');
  if (SENSITIVITY_RANK[request.dataSensitivity] > SENSITIVITY_RANK[capability.maxSensitivity]) {
    reasons.push('data_sensitivity_not_permitted');
  }

  const interactiveUiRequired = request.requiresBrowser || request.requiresAuthenticatedUi || request.requiresHumanInteraction;
  if (interactiveUiRequired && route !== 'CHAT_WORK') reasons.push('interactive_ui_requires_chat_work');

  if (route === 'API_BATCH') {
    if (!request.deferredAllowed) reasons.push('deferred_processing_not_allowed');
    if (!request.bulkWork) reasons.push('not_batch_suitable');
    if (request.maxLatencySeconds < 86_400) reasons.push('latency_too_low_for_batch_window');
  }

  if (route === 'CHAT_WORK' && !interactiveUiRequired) {
    reasons.push('chat_work_not_required');
  }

  if (route !== 'LOCAL') {
    if (capability.costEvidence !== 'fresh') reasons.push('fresh_cost_evidence_required');
    if (capability.estimatedCostUsd === null) reasons.push('normalized_cost_estimate_required');
  }

  return reasons;
}

export function routeCompute(request: ComputeRoutingRequest): ComputeRoutingDecision {
  validateRequest(request);

  if ((request.riskTier === 'critical' || request.humanApprovalRequired) && !request.humanApprovalGranted) {
    return {
      status: 'BLOCKED',
      selectedRoute: null,
      rationale: ['Execution requires explicit human approval before substrate selection.'],
      rejectedRoutes: (Object.keys(request.routes) as ComputeRoute[]).map((route) => ({
        route,
        reasons: ['human_approval_required'],
      })),
      confidence: 'high',
      escalationReason: 'HUMAN_APPROVAL_REQUIRED',
    };
  }

  const rejectedRoutes: RejectedRoute[] = [];
  const candidates: Array<{ route: ComputeRoute; capability: RouteCapability }> = [];

  for (const route of Object.keys(request.routes) as ComputeRoute[]) {
    const capability = request.routes[route];
    const reasons = routeRejectionReasons(route, capability, request);
    if (reasons.length > 0) rejectedRoutes.push({ route, reasons });
    else candidates.push({ route, capability });
  }

  if (candidates.length === 0) {
    return {
      status: 'BLOCKED',
      selectedRoute: null,
      rationale: ['No available route satisfies capability, latency, security, authority, and economic-evidence requirements.'],
      rejectedRoutes,
      confidence: 'high',
      escalationReason: 'NO_GOVERNED_ROUTE_AVAILABLE',
    };
  }

  candidates.sort((a, b) => {
    const aCost = a.capability.estimatedCostUsd ?? 0;
    const bCost = b.capability.estimatedCostUsd ?? 0;
    if (aCost !== bCost) return aCost - bCost;
    return ROUTE_TIE_BREAK[a.route] - ROUTE_TIE_BREAK[b.route];
  });

  const selected = candidates[0];
  const rationale = [
    `${selected.route} is the least-cost eligible route with sufficient capability and policy evidence.`,
    `Required quality ${request.requiredQualityScore}; route quality ${selected.capability.qualityScore}.`,
    `Task importance ${request.userImportance}; risk tier ${request.riskTier}; sensitivity ${request.dataSensitivity}.`,
  ];

  if (selected.route === 'API_BATCH') rationale.push('Deferred bulk processing is allowed and the latency budget accommodates the batch completion window.');
  if (selected.route === 'CHAT_WORK') rationale.push('Interactive browser, authenticated UI, or human participation makes ChatGPT Work materially necessary.');
  if (selected.route === 'LOCAL') rationale.push('Local capability is sufficient, so no metered external route is justified.');

  const confidence = selected.route === 'LOCAL' || selected.capability.costEvidence === 'fresh' ? 'high' : 'medium';

  return {
    status: 'ROUTED',
    selectedRoute: selected.route,
    rationale,
    rejectedRoutes,
    confidence,
    escalationReason: null,
  };
}
