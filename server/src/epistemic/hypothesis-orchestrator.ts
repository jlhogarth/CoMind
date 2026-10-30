import {
  assessConclusionReadiness,
  shouldReopen,
  type EpistemicState,
  type ReopeningTrigger,
  type RigorClass,
} from './ger.js';

export const GER_HYPOTHESIS_ORCHESTRATOR_VERSION = 'ger-003-v1' as const;

export type Testability = 'testable' | 'not_testable';
export type EvidencePolarity = 'supports' | 'contradicts' | 'weakens' | 'neutral';
export type TestResultDisposition =
  | 'supports'
  | 'contradicts'
  | 'falsifies'
  | 'inconclusive'
  | 'failed'
  | 'unsupported';
export type AuthorityStatus = 'not_required' | 'authorized' | 'missing';
export type OrdinalBurden = 0 | 1 | 2 | 3 | 4;

export interface HypothesisCandidate {
  hypothesisRef: string;
  summary: string;
  proposerRef: string;
  state: EpistemicState;
  plausible: boolean;
  examined: boolean;
  sourceRefs: string[];
  assumptionRefs: string[];
  falsifierRefs: string[];
  testability: Testability;
  untestableReason?: string;
  confidence?: number;
}

export interface HypothesisEvidenceLink {
  evidenceRef: string;
  hypothesisRef: string;
  sourceRef: string;
  polarity: EvidencePolarity;
  materiality: 'low' | 'moderate' | 'high' | 'critical';
}

export interface HypothesisTestPrediction {
  hypothesisRef: string;
  outcomeKey: string;
}

export interface HypothesisTestCandidate {
  testRef: string;
  feasible: boolean;
  authorityStatus: AuthorityStatus;
  humanApprovalRequired: boolean;
  humanApproved: boolean;
  cost: OrdinalBurden;
  risk: OrdinalBurden;
  irreversibility: OrdinalBurden;
  duration: OrdinalBurden;
  authoritySensitivity: OrdinalBurden;
  predictions: HypothesisTestPrediction[];
}

export interface HypothesisTestResult {
  resultRef: string;
  testRef: string;
  hypothesisRef: string;
  disposition: TestResultDisposition;
  evidenceRefs: string[];
  sourceRefs: string[];
  completedAt: string;
}

export interface RoleSeparatedReview {
  reviewRef: string;
  reviewerRef: string;
  proposerRef: string;
  roleSeparated: boolean;
}

export interface TestCandidateAssessment {
  testRef: string;
  eligible: boolean;
  blockingReasons: string[];
  discriminatingPairs: number;
  totalPairs: number;
  discriminatoryValue: number;
  candidate: HypothesisTestCandidate;
}

export interface BiasControlAssessment {
  confirmationBiasRisk: boolean;
  prematureClosureRisk: boolean;
  untestedPlausibleCompetitorRefs: string[];
  reasons: string[];
}

export interface HypothesisClosureInput {
  selectedHypothesisRef: string;
  hypotheses: HypothesisCandidate[];
  evidenceLinks: HypothesisEvidenceLink[];
  testResults: HypothesisTestResult[];
  unresolvedContradictionRefs: string[];
  uncertaintyBasis: string;
  rigorClass: RigorClass;
  review?: RoleSeparatedReview;
  exceptionRef?: string;
}

export interface HypothesisClosureAssessment {
  ready: boolean;
  disposition: 'conclude' | 'reject' | 'inconclusive' | 'investigate_more';
  reasons: string[];
  bias: BiasControlAssessment;
  selectedHypothesis: HypothesisCandidate;
  durableTestResultRefs: string[];
}

export interface CounterfactualArtifact {
  mode: 'simulation' | 'observation';
  evidenceStatus: 'simulated' | 'observed';
  scenarioRef: string;
  sourceRefs: string[];
}

export interface CounterfactualAssessment {
  allowed: boolean;
  reasons: string[];
}

function requireHypothesis(hypotheses: HypothesisCandidate[], hypothesisRef: string): HypothesisCandidate {
  const found = hypotheses.find((hypothesis) => hypothesis.hypothesisRef === hypothesisRef);
  if (!found) throw new Error(`Unknown hypothesis reference: ${hypothesisRef}`);
  return found;
}

function completedEpistemicResult(result: HypothesisTestResult): boolean {
  return result.disposition !== 'failed';
}

function pairKey(left: string, right: string): string {
  return left < right ? `${left}|${right}` : `${right}|${left}`;
}

export function assessTestCandidate(
  candidate: HypothesisTestCandidate,
  hypotheses: HypothesisCandidate[],
): TestCandidateAssessment {
  const active = hypotheses.filter((hypothesis) => hypothesis.plausible);
  const blockingReasons: string[] = [];

  if (!candidate.feasible) blockingReasons.push('Test is not feasible in the current environment.');
  if (candidate.authorityStatus === 'missing') blockingReasons.push('Required authority is missing.');
  if (candidate.humanApprovalRequired && !candidate.humanApproved) {
    blockingReasons.push('Required human approval is missing.');
  }

  const predictionByHypothesis = new Map(
    candidate.predictions.map((prediction) => [prediction.hypothesisRef, prediction.outcomeKey]),
  );
  const missingPredictionRefs = active
    .map((hypothesis) => hypothesis.hypothesisRef)
    .filter((hypothesisRef) => !predictionByHypothesis.has(hypothesisRef));

  if (active.length >= 2 && missingPredictionRefs.length > 0) {
    blockingReasons.push(
      `Discriminating-test assessment is missing predictions for: ${missingPredictionRefs.join(', ')}.`,
    );
  }

  let totalPairs = 0;
  let discriminatingPairs = 0;
  const seenPairs = new Set<string>();

  for (let leftIndex = 0; leftIndex < active.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < active.length; rightIndex += 1) {
      const left = active[leftIndex];
      const right = active[rightIndex];
      if (!left || !right) continue;
      const key = pairKey(left.hypothesisRef, right.hypothesisRef);
      if (seenPairs.has(key)) continue;
      seenPairs.add(key);
      totalPairs += 1;
      const leftPrediction = predictionByHypothesis.get(left.hypothesisRef);
      const rightPrediction = predictionByHypothesis.get(right.hypothesisRef);
      if (leftPrediction !== undefined && rightPrediction !== undefined && leftPrediction !== rightPrediction) {
        discriminatingPairs += 1;
      }
    }
  }

  const discriminatoryValue = totalPairs === 0 ? 0 : discriminatingPairs / totalPairs;
  return {
    testRef: candidate.testRef,
    eligible: blockingReasons.length === 0,
    blockingReasons,
    discriminatingPairs,
    totalPairs,
    discriminatoryValue,
    candidate,
  };
}

export function rankDiscriminatingTests(
  candidates: HypothesisTestCandidate[],
  hypotheses: HypothesisCandidate[],
): TestCandidateAssessment[] {
  return candidates
    .map((candidate) => assessTestCandidate(candidate, hypotheses))
    .sort((left, right) => {
      if (left.eligible !== right.eligible) return left.eligible ? -1 : 1;
      if (left.discriminatoryValue !== right.discriminatoryValue) return right.discriminatoryValue - left.discriminatoryValue;
      if (left.candidate.risk !== right.candidate.risk) return left.candidate.risk - right.candidate.risk;
      if (left.candidate.irreversibility !== right.candidate.irreversibility) return left.candidate.irreversibility - right.candidate.irreversibility;
      if (left.candidate.authoritySensitivity !== right.candidate.authoritySensitivity) return left.candidate.authoritySensitivity - right.candidate.authoritySensitivity;
      if (left.candidate.duration !== right.candidate.duration) return left.candidate.duration - right.candidate.duration;
      if (left.candidate.cost !== right.candidate.cost) return left.candidate.cost - right.candidate.cost;
      return left.testRef.localeCompare(right.testRef);
    });
}

export function selectNextDiscriminatingTest(
  candidates: HypothesisTestCandidate[],
  hypotheses: HypothesisCandidate[],
): TestCandidateAssessment | null {
  return rankDiscriminatingTests(candidates, hypotheses).find((candidate) => candidate.eligible) ?? null;
}

export function assessBiasControls(
  selectedHypothesisRef: string,
  hypotheses: HypothesisCandidate[],
  evidenceLinks: HypothesisEvidenceLink[],
  testResults: HypothesisTestResult[],
): BiasControlAssessment {
  requireHypothesis(hypotheses, selectedHypothesisRef);
  const selectedEvidence = evidenceLinks.filter((link) => link.hypothesisRef === selectedHypothesisRef);
  const selectedResults = testResults.filter(
    (result) => result.hypothesisRef === selectedHypothesisRef && completedEpistemicResult(result),
  );
  const hasDisconfirmingEvidence = selectedEvidence.some(
    (link) => link.polarity === 'contradicts' || link.polarity === 'weakens',
  );
  const hasDisconfirmingResult = selectedResults.some(
    (result) =>
      result.disposition === 'contradicts' ||
      result.disposition === 'falsifies' ||
      result.disposition === 'inconclusive' ||
      result.disposition === 'unsupported',
  );
  const hasPositiveMaterial =
    selectedEvidence.some((link) => link.polarity === 'supports') ||
    selectedResults.some((result) => result.disposition === 'supports');
  const confirmationBiasRisk = hasPositiveMaterial && !hasDisconfirmingEvidence && !hasDisconfirmingResult;

  const untestedPlausibleCompetitorRefs = hypotheses
    .filter((hypothesis) => hypothesis.hypothesisRef !== selectedHypothesisRef && hypothesis.plausible)
    .filter((hypothesis) => {
      if (hypothesis.testability === 'not_testable') return !hypothesis.examined || !hypothesis.untestableReason?.trim();
      return !testResults.some(
        (result) => result.hypothesisRef === hypothesis.hypothesisRef && completedEpistemicResult(result),
      );
    })
    .map((hypothesis) => hypothesis.hypothesisRef);

  const prematureClosureRisk = untestedPlausibleCompetitorRefs.length > 0;
  const reasons: string[] = [];
  if (confirmationBiasRisk) {
    reasons.push('Only confirming material is represented for the selected hypothesis; an explicit disconfirming challenge is still required.');
  }
  if (prematureClosureRisk) {
    reasons.push(`Plausible competing hypotheses remain insufficiently examined: ${untestedPlausibleCompetitorRefs.join(', ')}.`);
  }
  return { confirmationBiasRisk, prematureClosureRisk, untestedPlausibleCompetitorRefs, reasons };
}

export function assessCounterfactualArtifact(artifact: CounterfactualArtifact): CounterfactualAssessment {
  const reasons: string[] = [];
  if (artifact.mode !== 'simulation') reasons.push('Counterfactual output must be explicitly labeled as simulation.');
  if (artifact.evidenceStatus !== 'simulated') reasons.push('Counterfactual output cannot be labeled as observed evidence.');
  if (!artifact.scenarioRef.trim()) reasons.push('Counterfactual output requires a scenario reference.');
  return { allowed: reasons.length === 0, reasons };
}

export function assessHypothesisClosure(input: HypothesisClosureInput): HypothesisClosureAssessment {
  const selected = requireHypothesis(input.hypotheses, input.selectedHypothesisRef);
  const evidenceForSelected = input.evidenceLinks.filter((link) => link.hypothesisRef === input.selectedHypothesisRef);
  const selectedResults = input.testResults.filter((result) => result.hypothesisRef === input.selectedHypothesisRef);
  const durableTestResults = selectedResults.filter(completedEpistemicResult);
  const falsified = selectedResults.some((result) => result.disposition === 'falsifies');
  const competitors = input.hypotheses.filter(
    (hypothesis) => hypothesis.hypothesisRef !== selected.hypothesisRef && hypothesis.plausible,
  );
  const competitorsConsidered = competitors.filter((hypothesis) =>
    hypothesis.examined || input.testResults.some(
      (result) => result.hypothesisRef === hypothesis.hypothesisRef && completedEpistemicResult(result),
    ),
  ).length;
  const roleSeparatedReview =
    input.review && input.review.roleSeparated && input.review.reviewerRef.trim() !== '' && input.review.reviewerRef !== input.review.proposerRef
      ? input.review
      : undefined;

  const base = assessConclusionReadiness(
    {
      objectType: 'hypothesis',
      state: selected.state,
      evidenceRefs: evidenceForSelected.map((link) => link.evidenceRef),
      sourceRefs: selected.sourceRefs,
      supportingEvidenceCount: evidenceForSelected.filter((link) => link.polarity === 'supports').length,
      contradictingEvidenceCount: evidenceForSelected.filter((link) => link.polarity === 'contradicts' || link.polarity === 'weakens').length,
      unresolvedContradictions: input.unresolvedContradictionRefs.length,
      assumptionRefs: selected.assumptionRefs,
      competingHypothesesConsidered: competitorsConsidered,
      falsifierRefs: selected.falsifierRefs,
      testResultRefs: durableTestResults.map((result) => result.resultRef),
      uncertaintyBasis: input.uncertaintyBasis,
      confidence: selected.confidence,
      independentReviewRef: roleSeparatedReview?.reviewRef,
      exceptionRef: input.exceptionRef,
    },
    input.rigorClass,
  );

  const bias = assessBiasControls(input.selectedHypothesisRef, input.hypotheses, input.evidenceLinks, input.testResults);
  const reasons = [...base.reasons];
  if (selected.testability === 'testable' && durableTestResults.length === 0) {
    reasons.push('A plausible testable hypothesis cannot be concluded without a completed epistemic test result.');
  }
  if (selected.testability === 'not_testable' && !selected.untestableReason?.trim()) {
    reasons.push('A non-testable hypothesis requires an explicit reason explaining why useful testing is unavailable.');
  }
  if (input.rigorClass >= 2) reasons.push(...bias.reasons);
  if (input.rigorClass >= 3 && input.review && (!input.review.roleSeparated || input.review.reviewerRef === input.review.proposerRef)) {
    reasons.push('Rigor class 3 or higher requires a genuinely role-separated reviewer.');
  }

  if (falsified) {
    return {
      ready: false,
      disposition: 'reject',
      reasons: [...reasons, 'A recorded falsifying test result rejects the selected hypothesis.'],
      bias,
      selectedHypothesis: selected,
      durableTestResultRefs: durableTestResults.map((result) => result.resultRef),
    };
  }

  return {
    ready: base.ready && reasons.length === 0,
    disposition: base.ready && reasons.length === 0 ? 'conclude' : input.unresolvedContradictionRefs.length > 0 ? 'inconclusive' : 'investigate_more',
    reasons,
    bias,
    selectedHypothesis: selected,
    durableTestResultRefs: durableTestResults.map((result) => result.resultRef),
  };
}

export function assessHypothesisReopening(
  priorConclusionExists: boolean,
  trigger: ReopeningTrigger,
): { reopen: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (!priorConclusionExists) reasons.push('A reopening action requires a prior conclusion or closure.');
  if (!shouldReopen(trigger)) reasons.push('The reopening trigger is incomplete or below the materiality threshold.');
  return { reopen: reasons.length === 0, reasons };
}
