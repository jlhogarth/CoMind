import { z } from 'zod';
import type { ChatgptHandoffJob } from './chatgpt-handoff.js';

const uuid = z.string().uuid();
const boundedText = z.string().trim().min(1).max(1000);
const chatgptUrl = z.string().regex(/^https:\/\/chatgpt\.com\/c\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);

const handoffSchema = z.strictObject({
  recoveryId: boundedText,
  reasonCode: boundedText,
  repairSummary: boundedText,
  verifiedState: boundedText,
  nextAction: boundedText,
  issue: boundedText.optional(),
  branch: boundedText.optional(),
  pullRequest: boundedText.optional(),
});

const detailsSchema = z.object({
  cbeDispatchAuthorized: z.literal(true),
  clearApproved: z.literal(true),
  authorityRef: boundedText,
  recoveryOwnershipReleased: z.literal(true),
  controllerMayContinueImplementation: z.literal(false),
  timeoutMs: z.number().int().positive().max(120_000).optional(),
  handoff: handoffSchema,
}).passthrough();

const eventSchema = z.strictObject({
  event_id: uuid,
  work_key: boundedText,
  summary: boundedText,
  result_summary: z.string().nullable(),
  next_action: z.string().nullable(),
  details: z.unknown(),
});

const bindingSchema = z.object({
  status: z.literal('active'),
  externalConversationId: uuid,
  registeredConversationUrl: chatgptUrl,
}).passthrough();

export type AuthorizedDispatchEvent = {
  eventId: string;
  workKey: string;
  summary: string;
  resultSummary: string | null;
  nextAction: string | null;
  authorityRef: string;
  timeoutMs: number;
  handoff: z.infer<typeof handoffSchema>;
};

export type ActiveConversationBinding = {
  externalConversationId: string;
  registeredConversationUrl: string;
};

export function parseAuthorizedDispatchEvent(
  value: unknown,
  expectedWorkKey: string,
  expectedEventId: string
): AuthorizedDispatchEvent {
  const row = eventSchema.parse(value);
  if (row.work_key !== expectedWorkKey) {
    throw new Error('CBE_DISPATCH_WORK_KEY_MISMATCH');
  }
  if (row.event_id !== expectedEventId) {
    throw new Error('CBE_DISPATCH_EVENT_ID_MISMATCH');
  }
  const details = detailsSchema.parse(row.details);
  return {
    eventId: row.event_id,
    workKey: row.work_key,
    summary: row.summary,
    resultSummary: row.result_summary,
    nextAction: row.next_action,
    authorityRef: details.authorityRef,
    timeoutMs: details.timeoutMs ?? 60_000,
    handoff: details.handoff,
  };
}

export function parseActiveConversationBinding(value: unknown): ActiveConversationBinding {
  const binding = bindingSchema.parse(value);
  const expectedUrl = `https://chatgpt.com/c/${binding.externalConversationId.toLowerCase()}`;
  if (binding.registeredConversationUrl !== expectedUrl) {
    throw new Error('CBE_REGISTERED_CONVERSATION_IDENTITY_MISMATCH');
  }
  return {
    externalConversationId: binding.externalConversationId.toLowerCase(),
    registeredConversationUrl: binding.registeredConversationUrl,
  };
}

export function buildSelfHostedHandoffJob(input: {
  jobId: string;
  workerInstanceId: string;
  dispatch: AuthorizedDispatchEvent;
  binding: ActiveConversationBinding;
  lease: {
    taskId: string;
    leaseToken: string;
    fencingEpoch: number;
  };
}): ChatgptHandoffJob {
  const jobId = uuid.parse(input.jobId);
  const taskId = uuid.parse(input.lease.taskId);
  const leaseToken = uuid.parse(input.lease.leaseToken);
  if (!Number.isSafeInteger(input.lease.fencingEpoch) || input.lease.fencingEpoch < 0) {
    throw new Error('CBE_INVALID_FENCING_EPOCH');
  }
  const workerInstanceId = boundedText.parse(input.workerInstanceId);

  return {
    jobId,
    caller: 'github-self-hosted-cbe',
    targetUrl: input.binding.registeredConversationUrl,
    registeredConversationUrl: input.binding.registeredConversationUrl,
    timeoutMs: input.dispatch.timeoutMs,
    lease: {
      taskId,
      leaseToken,
      fencingEpoch: input.lease.fencingEpoch,
      workerInstanceId,
    },
    authorityRef: input.dispatch.authorityRef,
    clearApproved: true,
    handoff: input.dispatch.handoff,
  };
}

export function redactedDispatchEvidence(input: {
  eventId: string;
  workKey: string;
  jobId: string;
  binding: ActiveConversationBinding;
  resultEvidence: Readonly<Record<string, unknown>>;
}): Readonly<Record<string, unknown>> {
  return Object.freeze({
    triggerEventId: input.eventId,
    workKey: input.workKey,
    jobId: input.jobId,
    conversationId: input.binding.externalConversationId,
    resultEvidence: input.resultEvidence,
  });
}
