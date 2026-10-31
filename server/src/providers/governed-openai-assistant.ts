import {
  AssistantProvider,
  AssistantResponse,
  AssistantResponseObserver,
  AssistantResponseRequest,
} from '../assistant.js';
import { observeC11TrustBoundary } from '../c11-trust-boundary.js';
import { QueryFunction } from '../db.js';
import {
  GovernedPaidExecutionLedger,
  GovernedProviderBudgetAuthority,
} from './governed-provider-execution.js';
import {
  resolveConversationExecutionGovernance,
  toRulebookExecutionBaseContext,
} from './conversation-governance-binding.js';
import {
  OpenAIAssistantProviderOptions,
  OpenAIResponseLike,
  openAIProviderSuccessMetadata,
} from './openai.js';
import {
  OpenAIResponseCreateClient,
  OpenAIResponseCreateRequest,
  buildOpenAIProviderExecutionEnvelope,
  executeGovernedOpenAIProviderExecutionEnvelope,
} from './openai-execution.js';
import { ProviderInputTokenCounter } from './provider-execution-envelope.js';
import {
  RulebookExecutionGovernanceContext,
  createDatabaseRulebookExecutionPreflight,
} from './rulebook-execution-preflight.js';

export interface GovernedOpenAIAssistantProviderDependencies {
  readonly queryFn: QueryFunction;
  readonly responses: OpenAIResponseCreateClient<OpenAIResponseLike>;
  readonly inputTokenCounter: ProviderInputTokenCounter<OpenAIResponseCreateRequest>;
  readonly budgetAuthority: GovernedProviderBudgetAuthority;
  readonly paidExecutionLedger?: GovernedPaidExecutionLedger;
  readonly governanceProjectKey?: string;
  readonly destinationKey?: string;
}

export class GovernedOpenAIAssistantProvider implements AssistantProvider {
  readonly name = 'openai-governed';
  private readonly governanceProjectKey: string;
  private readonly destinationKey: string;

  constructor(
    private readonly dependencies: GovernedOpenAIAssistantProviderDependencies,
    private readonly options: OpenAIAssistantProviderOptions
  ) {
    this.governanceProjectKey = dependencies.governanceProjectKey?.trim() || 'COMIND';
    this.destinationKey = dependencies.destinationKey?.trim() || 'OPENAI-API';
    if (options.maxRetries !== 0) {
      throw new Error('Governed OpenAI assistant provider requires maxRetries=0');
    }
  }

  async generateResponse(
    request: AssistantResponseRequest,
    _observer?: AssistantResponseObserver
  ): Promise<AssistantResponse> {
    const resolved = await resolveConversationExecutionGovernance(
      this.dependencies.queryFn,
      {
        governanceProjectKey: this.governanceProjectKey,
        conversationId: request.conversationId,
        destinationKey: this.destinationKey,
      }
    );

    const observation = observeC11TrustBoundary(request.messages, {
      sideEffect: true,
      humanApproved: resolved.human_approved,
    });
    const base = toRulebookExecutionBaseContext(resolved);
    const governance: RulebookExecutionGovernanceContext = Object.freeze({
      ...base,
      untrusted_input: observation.untrusted_input,
      asks_for_secrets: observation.asks_for_secrets,
      authority_escalation: observation.authority_escalation,
    });

    const envelope = buildOpenAIProviderExecutionEnvelope(request, this.options);
    const result = await executeGovernedOpenAIProviderExecutionEnvelope(
      this.dependencies.responses,
      envelope,
      this.dependencies.inputTokenCounter,
      this.dependencies.budgetAuthority,
      this.dependencies.paidExecutionLedger,
      {
        evaluator: createDatabaseRulebookExecutionPreflight(this.dependencies.queryFn),
        governance,
      }
    );

    const content = result.response.output_text?.trim();
    if (!content) {
      const error = new Error('Governed OpenAI response did not contain assistant text') as Error & {
        code?: string;
      };
      error.code = 'openai_empty_output';
      throw error;
    }

    return {
      content,
      metadata: {
        ...openAIProviderSuccessMetadata(result.response, envelope, 0, result.receipt),
        conversation_governance: {
          asset_key: resolved.asset_key,
          classification_key: resolved.classification_key,
          classification_rank: resolved.classification_rank,
          purpose: resolved.purpose,
          egress_review_state: resolved.egress_review_state,
          egress_review_expires_at: resolved.egress_review_expires_at,
          c11: observation,
        },
      },
    };
  }
}
