import {
  AssistantProvider,
  AssistantResponse,
  AssistantResponseRequest,
  ConversationMessage,
} from './assistant.js';

export type AnswerRiskLevel = 'low' | 'high';
export type QualityVerdict = 'approve' | 'revise' | 'reject' | 'abstain';
export type QualityOutcome =
  | 'returned'
  | 'repaired'
  | 'blocked'
  | 'returned_unverified';

export type QualityIssueCategory =
  | 'unsupported_claim'
  | 'contradiction'
  | 'stale_fact'
  | 'tool_mismatch'
  | 'missing_citation'
  | 'arithmetic_logical_error'
  | 'policy_refusal_mismatch'
  | 'verifier_failure';

export interface AnswerRiskAssessment {
  level: AnswerRiskLevel;
  reasons: string[];
}

export interface QualityVerifierResult {
  verdict: QualityVerdict;
  critique?: string;
  issueCategories?: QualityIssueCategory[];
  metadata?: Record<string, unknown>;
}

export interface QualityVerifier {
  readonly name: string;
  verify(input: {
    conversationId: string;
    messages: ConversationMessage[];
    draft: AssistantResponse;
  }): Promise<QualityVerifierResult>;
}

export interface QualityRepairer {
  readonly name: string;
  repair(input: {
    conversationId: string;
    messages: ConversationMessage[];
    draft: AssistantResponse;
    critique: string;
    issueCategories: QualityIssueCategory[];
  }): Promise<AssistantResponse>;
}

export interface MeteredQualityGateOptions {
  verifierFailureFallback: 'return_draft' | 'block';
}

interface QualityPassTelemetry {
  role: 'draft' | 'verifier' | 'repair' | 'final';
  provider?: unknown;
  model?: unknown;
  endpoint?: unknown;
  response_id?: unknown;
  status?: unknown;
  duration_ms?: unknown;
  usage?: unknown;
  cost?: unknown;
  source_role?: 'draft' | 'repair';
}

const CURRENT_INFORMATION_PATTERN = /\b(latest|current|today|tonight|recent|right now|as of)\b/i;
const HIGH_STAKES_PATTERN = /\b(medical|medicine|medication|diagnos|symptom|legal|lawyer|lawsuit|tax|investment|investing|mortgage|credit score|financial advice)\b/i;
const VERIFICATION_PATTERN = /\b(source|citation|cite|evidence|verify|verification|fact[- ]?check)\b/i;
const CALCULATION_PATTERN = /(?:\d[\d,.]*\s*[+\-*/%]\s*\d)|(?:\bcalculate\b|\bcompute\b|\bpercent(?:age)?\b)/i;

function latestUserContent(messages: ConversationMessage[]) {
  for (let index = messages.length - 1; index >= 0; index--) {
    if (messages[index].role === 'user') return messages[index].content;
  }
  return '';
}

export function classifyAnswerRisk(request: AssistantResponseRequest): AnswerRiskAssessment {
  const userContent = latestUserContent(request.messages);
  const reasons: string[] = [];

  if (request.messages.some((message) => message.role === 'tool')) {
    reasons.push('tool_output_present');
  }
  if (CURRENT_INFORMATION_PATTERN.test(userContent)) reasons.push('time_sensitive_claim');
  if (HIGH_STAKES_PATTERN.test(userContent)) reasons.push('high_stakes_domain');
  if (VERIFICATION_PATTERN.test(userContent)) reasons.push('explicit_verification_request');
  if (CALCULATION_PATTERN.test(userContent)) reasons.push('calculation_or_numeric_reasoning');

  return {
    level: reasons.length > 0 ? 'high' : 'low',
    reasons,
  };
}

function passTelemetry(
  role: 'draft' | 'verifier' | 'repair',
  metadata: Record<string, unknown> | undefined,
  fallbackProvider: string
): QualityPassTelemetry {
  const source = metadata ?? {};
  return {
    role,
    provider: source.provider ?? fallbackProvider,
    ...(source.model !== undefined ? { model: source.model } : {}),
    ...(source.endpoint !== undefined ? { endpoint: source.endpoint } : {}),
    ...(source.response_id !== undefined ? { response_id: source.response_id } : {}),
    ...(source.status !== undefined ? { status: source.status } : {}),
    ...(source.duration_ms !== undefined ? { duration_ms: source.duration_ms } : {}),
    ...(source.usage !== undefined ? { usage: source.usage } : {}),
    ...(source.cost !== undefined ? { cost: source.cost } : {}),
  };
}

function compactCritique(value: string | undefined) {
  const normalized = value?.trim();
  if (!normalized) return undefined;
  return normalized.slice(0, 1000);
}

function qualityMetadata(input: {
  risk: AnswerRiskAssessment;
  verdict: QualityVerdict | 'skipped' | 'verifier_failed';
  outcome: QualityOutcome;
  issueCategories: QualityIssueCategory[];
  critique?: string;
  passes: QualityPassTelemetry[];
  finalSource: 'draft' | 'repair';
}) {
  return {
    risk: input.risk,
    verdict: input.verdict,
    issue_categories: input.issueCategories,
    outcome: input.outcome,
    ...(input.critique ? { critique: input.critique } : {}),
    passes: [
      ...input.passes,
      { role: 'final' as const, source_role: input.finalSource },
    ],
  };
}

export class QualityGateBlockedError extends Error {
  readonly code = 'assistant_quality_gate_blocked';
  readonly providerMetadata: Record<string, unknown>;

  constructor(providerMetadata: Record<string, unknown>) {
    super('Assistant answer blocked by quality gate');
    this.name = 'QualityGateBlockedError';
    this.providerMetadata = providerMetadata;
  }
}

export class MeteredQualityGateProvider implements AssistantProvider {
  constructor(
    private readonly draftProvider: AssistantProvider,
    private readonly verifier: QualityVerifier,
    private readonly repairer: QualityRepairer,
    private readonly options: MeteredQualityGateOptions = { verifierFailureFallback: 'block' }
  ) {}

  get name() {
    return this.draftProvider.name;
  }

  async generateResponse(request: AssistantResponseRequest): Promise<AssistantResponse> {
    const draft = await this.draftProvider.generateResponse(request);
    const risk = classifyAnswerRisk(request);
    const draftPass = passTelemetry('draft', draft.metadata, this.draftProvider.name);

    if (risk.level === 'low') {
      return {
        content: draft.content,
        metadata: {
          ...draft.metadata,
          quality_gate: qualityMetadata({
            risk,
            verdict: 'skipped',
            outcome: 'returned',
            issueCategories: [],
            passes: [draftPass],
            finalSource: 'draft',
          }),
        },
      };
    }

    let verification: QualityVerifierResult;
    try {
      verification = await this.verifier.verify({
        conversationId: request.conversationId,
        messages: request.messages,
        draft,
      });
    } catch {
      const gate = qualityMetadata({
        risk,
        verdict: 'verifier_failed',
        outcome: this.options.verifierFailureFallback === 'return_draft'
          ? 'returned_unverified'
          : 'blocked',
        issueCategories: ['verifier_failure'],
        passes: [draftPass],
        finalSource: 'draft',
      });

      if (this.options.verifierFailureFallback === 'return_draft') {
        return {
          content: draft.content,
          metadata: { ...draft.metadata, quality_gate: gate },
        };
      }
      throw new QualityGateBlockedError({ ...draft.metadata, quality_gate: gate });
    }

    const verifierPass = passTelemetry('verifier', verification.metadata, this.verifier.name);
    const critique = compactCritique(verification.critique);
    const issueCategories = verification.issueCategories ?? [];

    if (verification.verdict === 'approve') {
      return {
        content: draft.content,
        metadata: {
          ...draft.metadata,
          quality_gate: qualityMetadata({
            risk,
            verdict: verification.verdict,
            outcome: 'returned',
            issueCategories,
            critique,
            passes: [draftPass, verifierPass],
            finalSource: 'draft',
          }),
        },
      };
    }

    if (verification.verdict === 'revise') {
      const repaired = await this.repairer.repair({
        conversationId: request.conversationId,
        messages: request.messages,
        draft,
        critique: critique ?? 'Verifier requested revision without a critique.',
        issueCategories,
      });
      const repairPass = passTelemetry('repair', repaired.metadata, this.repairer.name);
      return {
        content: repaired.content,
        metadata: {
          ...repaired.metadata,
          quality_gate: qualityMetadata({
            risk,
            verdict: verification.verdict,
            outcome: 'repaired',
            issueCategories,
            critique,
            passes: [draftPass, verifierPass, repairPass],
            finalSource: 'repair',
          }),
        },
      };
    }

    const gate = qualityMetadata({
      risk,
      verdict: verification.verdict,
      outcome: 'blocked',
      issueCategories,
      critique,
      passes: [draftPass, verifierPass],
      finalSource: 'draft',
    });
    throw new QualityGateBlockedError({ ...draft.metadata, quality_gate: gate });
  }
}
