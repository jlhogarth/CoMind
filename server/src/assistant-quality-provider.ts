import { AssistantProvider, ConversationMessage } from './assistant.js';
import {
  QualityIssueCategory,
  QualityRepairer,
  QualityVerifier,
  QualityVerifierResult,
  QualityVerdict,
} from './assistant-quality-gate.js';

const VERDICTS = new Set<QualityVerdict>(['approve', 'revise', 'reject', 'abstain']);
const ISSUE_CATEGORIES = new Set<QualityIssueCategory>([
  'unsupported_claim',
  'contradiction',
  'stale_fact',
  'tool_mismatch',
  'missing_citation',
  'arithmetic_logical_error',
  'policy_refusal_mismatch',
]);

function conversationPayload(messages: ConversationMessage[]) {
  return messages.map((message) => ({
    role: message.role,
    content: message.content,
  }));
}

function parseVerifierResult(content: string): Omit<QualityVerifierResult, 'metadata'> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error('Quality verifier returned invalid JSON');
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Quality verifier returned a non-object result');
  }

  const candidate = parsed as Record<string, unknown>;
  if (typeof candidate.verdict !== 'string' || !VERDICTS.has(candidate.verdict as QualityVerdict)) {
    throw new Error('Quality verifier returned an unsupported verdict');
  }

  const issueCategories: QualityIssueCategory[] = [];
  if (candidate.issue_categories !== undefined) {
    if (!Array.isArray(candidate.issue_categories)) {
      throw new Error('Quality verifier issue_categories must be an array');
    }
    for (const category of candidate.issue_categories) {
      if (typeof category !== 'string' || !ISSUE_CATEGORIES.has(category as QualityIssueCategory)) {
        throw new Error('Quality verifier returned an unsupported issue category');
      }
      issueCategories.push(category as QualityIssueCategory);
    }
  }

  if (candidate.critique !== undefined && typeof candidate.critique !== 'string') {
    throw new Error('Quality verifier critique must be a string');
  }

  return {
    verdict: candidate.verdict as QualityVerdict,
    ...(candidate.critique ? { critique: candidate.critique } : {}),
    issueCategories,
  };
}

function attachProviderMetadata(error: unknown, metadata: Record<string, unknown> | undefined) {
  if (error && typeof error === 'object' && metadata) {
    (error as Record<string, unknown>).providerMetadata = metadata;
  }
}

export class ProviderBackedQualityVerifier implements QualityVerifier {
  constructor(private readonly provider: AssistantProvider) {}

  get name() {
    return this.provider.name;
  }

  async verify(input: {
    conversationId: string;
    messages: ConversationMessage[];
    draft: { content: string; metadata?: Record<string, unknown> };
  }): Promise<QualityVerifierResult> {
    const response = await this.provider.generateResponse({
      conversationId: input.conversationId,
      executionRole: 'verifier',
      messages: [
        {
          role: 'system',
          content:
            'You are the CoMind answer quality verifier. Evaluate only the supplied conversation and draft. Return exactly one JSON object with verdict set to approve, revise, reject, or abstain; critique as a concise string; and issue_categories as an array containing only unsupported_claim, contradiction, stale_fact, tool_mismatch, missing_citation, arithmetic_logical_error, or policy_refusal_mismatch. Do not include markdown or additional text.',
        },
        {
          role: 'user',
          content: JSON.stringify({
            conversation: conversationPayload(input.messages),
            draft: input.draft.content,
          }),
        },
      ],
    });

    try {
      return {
        ...parseVerifierResult(response.content),
        metadata: response.metadata,
      };
    } catch (error) {
      attachProviderMetadata(error, response.metadata);
      throw error;
    }
  }
}

export class ProviderBackedQualityRepairer implements QualityRepairer {
  constructor(private readonly provider: AssistantProvider) {}

  get name() {
    return this.provider.name;
  }

  async repair(input: {
    conversationId: string;
    messages: ConversationMessage[];
    draft: { content: string; metadata?: Record<string, unknown> };
    critique: string;
    issueCategories: QualityIssueCategory[];
  }) {
    return this.provider.generateResponse({
      conversationId: input.conversationId,
      executionRole: 'repair',
      messages: [
        {
          role: 'system',
          content:
            'You are the CoMind answer repair pass. Produce only the corrected final answer. Address the verifier critique and issue categories using the supplied conversation. Do not mention the verification workflow unless the user explicitly asked about it.',
        },
        {
          role: 'user',
          content: JSON.stringify({
            conversation: conversationPayload(input.messages),
            draft: input.draft.content,
            critique: input.critique,
            issue_categories: input.issueCategories,
          }),
        },
      ],
    });
  }
}
