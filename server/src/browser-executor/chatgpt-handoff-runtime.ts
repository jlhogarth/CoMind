import { z } from 'zod';
import {
  executeChatgptHandoffJob,
  type ChatgptHandoffDependencies,
  type ChatgptHandoffExecutionResult,
  type ChatgptHandoffJob,
  type ChatgptHandoffPolicy,
} from './chatgpt-handoff.js';

const uuid = z.string().uuid();
const boundedText = z.string().trim().min(1).max(1000);

const handoffSchema = z.strictObject({
  recoveryId: boundedText,
  workKey: boundedText,
  reasonCode: boundedText,
  repairSummary: boundedText,
  verifiedState: boundedText,
  nextAction: boundedText,
  issue: boundedText.optional(),
  branch: boundedText.optional(),
  pullRequest: boundedText.optional(),
});

const leaseSchema = z.strictObject({
  taskId: uuid,
  leaseToken: uuid,
  fencingEpoch: z.number().int().nonnegative(),
  workerInstanceId: boundedText,
});

const jobSchema = z.strictObject({
  jobId: uuid,
  caller: boundedText,
  targetUrl: z.string().url(),
  registeredConversationUrl: z.string().url(),
  timeoutMs: z.number().int().positive().max(120_000),
  lease: leaseSchema,
  authorityRef: boundedText,
  clearApproved: z.literal(true),
  handoff: handoffSchema,
});

export type Mp006ReturnStatus = 'RETURNED' | 'RETURN_FAILED' | 'RETURN_UNAVAILABLE';

export type Mp006ConversationReturnResult = {
  returnStatus: Mp006ReturnStatus;
  conversationReturned: boolean;
  conversationReturnImpossible: boolean;
  returnReason: string;
  returnWhy: string;
  retryEligible: boolean;
  ownershipReleased: true;
  controllerMayContinueImplementation: false;
  evidence: Readonly<Record<string, unknown>>;
};

const reasonWhy: Readonly<Record<string, string>> = Object.freeze({
  completed: 'The recovery handoff was posted to the exact registered ChatGPT conversation and response generation was observed.',
  already_delivered: 'The exact recovery handoff was already present in the registered ChatGPT conversation and prior response generation was observed.',
  clear_required: 'The handoff did not have the required CLEAR approval.',
  missing_identity: 'The actuator job is missing required job or caller identity.',
  missing_lease_reference: 'The actuator job is missing a complete governed Foundry lease reference.',
  invalid_lease_reference: 'The governed Foundry lease reference is malformed.',
  invalid_timeout: 'The requested browser timeout is outside the permitted actuator policy.',
  invalid_target_conversation: 'The target is not a valid stable ChatGPT conversation URL.',
  invalid_registered_conversation: 'The registered lane conversation is not a valid stable ChatGPT conversation URL.',
  conversation_binding_mismatch: 'The requested target does not exactly match the registered lane conversation URL.',
  invalid_handoff: 'The bounded recovery handoff payload is malformed or incomplete.',
  handoff_too_large: 'The recovery handoff exceeds the bounded message policy.',
  lease_verification_failed: 'The actuator could not verify the canonical Foundry work lease.',
  lease_missing: 'No canonical Foundry work lease exists for the supplied task.',
  lease_not_active: 'The canonical Foundry work lease is not active.',
  lease_worker_mismatch: 'The actuator worker does not own the canonical Foundry work lease.',
  lease_token_mismatch: 'The supplied lease capability does not match the canonical Foundry work lease.',
  lease_epoch_invalid: 'The canonical Foundry work lease fencing epoch is invalid.',
  lease_epoch_mismatch: 'The supplied fencing epoch is stale relative to the canonical Foundry work lease.',
  lease_expired: 'The canonical Foundry work lease expired before the conversation return could execute.',
  browser_start_failed: 'The self-hosted Playwright browser could not be constructed.',
  browser_timeout: 'The self-hosted browser timed out during the bounded return attempt.',
  browser_interrupted: 'The self-hosted browser was interrupted during the return attempt.',
  authentication_required: 'The persistent browser context is not authenticated to ChatGPT.',
  composer_not_found: 'The exact ChatGPT conversation opened but the message composer was not available.',
  handoff_not_observed: 'The browser submitted the handoff but could not observe the recovery message in the exact conversation.',
  response_not_observed: 'The recovery handoff was posted but response generation was not observed.',
  browser_cleanup_failed: 'The browser handoff completed but the persistent browser context could not be closed cleanly.',
  browser_observation_missing: 'The browser driver returned no verifiable handoff observation.',
  conversation_identity_mismatch: 'The browser did not remain on the exact registered ChatGPT conversation.',
  handoff_verification_failed: 'The actuator could not verify both handoff delivery and response start.',
  conversation_actuator_unavailable: 'The self-hosted ChatGPT return actuator is not available in the current runtime.',
  actuator_configuration_invalid: 'The self-hosted ChatGPT return actuator configuration is incomplete or invalid.',
});

function whyFor(reason: string): string {
  return reasonWhy[reason] ?? `Conversation return did not complete: ${reason}.`;
}

function unavailableReason(reason: string): boolean {
  return reason === 'conversation_actuator_unavailable'
    || reason === 'actuator_configuration_invalid'
    || reason === 'authentication_required'
    || reason === 'browser_start_failed';
}

export function parseChatgptHandoffJob(value: unknown): ChatgptHandoffJob {
  return jobSchema.parse(value) as ChatgptHandoffJob;
}

export function mapChatgptExecutionToMp006(
  result: ChatgptHandoffExecutionResult
): Mp006ConversationReturnResult {
  if (result.status === 'succeeded') {
    return {
      returnStatus: 'RETURNED',
      conversationReturned: true,
      conversationReturnImpossible: false,
      returnReason: result.reason,
      returnWhy: whyFor(result.reason),
      retryEligible: false,
      ownershipReleased: true,
      controllerMayContinueImplementation: false,
      evidence: result.evidence,
    };
  }

  return {
    returnStatus: unavailableReason(result.reason) ? 'RETURN_UNAVAILABLE' : 'RETURN_FAILED',
    conversationReturned: false,
    conversationReturnImpossible: true,
    returnReason: result.reason,
    returnWhy: whyFor(result.reason),
    retryEligible: result.recoverable,
    ownershipReleased: true,
    controllerMayContinueImplementation: false,
    evidence: result.evidence,
  };
}

export function unavailableConversationReturn(
  reason: 'conversation_actuator_unavailable' | 'actuator_configuration_invalid',
  detail?: string
): Mp006ConversationReturnResult {
  return {
    returnStatus: 'RETURN_UNAVAILABLE',
    conversationReturned: false,
    conversationReturnImpossible: true,
    returnReason: reason,
    returnWhy: detail ? `${whyFor(reason)} ${detail}` : whyFor(reason),
    retryEligible: true,
    ownershipReleased: true,
    controllerMayContinueImplementation: false,
    evidence: Object.freeze({}),
  };
}

export async function executeGovernedChatgptConversationReturn(
  job: ChatgptHandoffJob,
  policy: ChatgptHandoffPolicy,
  dependencies: ChatgptHandoffDependencies
): Promise<Mp006ConversationReturnResult> {
  const result = await executeChatgptHandoffJob(job, policy, dependencies);
  return mapChatgptExecutionToMp006(result);
}
