import { z } from 'zod';
import {
  executeChatgptSuccessorJob,
  type ChatgptSuccessorDependencies,
  type ChatgptSuccessorExecutionResult,
  type ChatgptSuccessorJob,
  type ChatgptSuccessorPolicy,
} from './chatgpt-successor.js';

const uuid = z.string().uuid();
const boundedText = z.string().trim().min(1).max(1000);
const sha256Hex = z.string().regex(/^[a-f0-9]{64}$/i);

const capsuleSchema = z.strictObject({
  continuityId: boundedText,
  laneId: boundedText,
  workKey: boundedText,
  verifiedCheckpoint: boundedText,
  nextAction: boundedText,
  authorityRef: boundedText,
  issue: boundedText.optional(),
  branch: boundedText.optional(),
  pullRequest: boundedText.optional(),
  headSha: boundedText.optional(),
  predecessorRefSha256: sha256Hex.optional(),
  provenanceRefs: z.array(boundedText).max(12).optional(),
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
  timeoutMs: z.number().int().positive().max(120_000),
  lease: leaseSchema,
  authorityRef: boundedText,
  clearApproved: z.literal(true),
  capsule: capsuleSchema,
});

export function parseChatgptSuccessorJob(value: unknown): ChatgptSuccessorJob {
  return jobSchema.parse(value) as ChatgptSuccessorJob;
}

export async function executeGovernedChatgptSuccessor(
  job: ChatgptSuccessorJob,
  policy: ChatgptSuccessorPolicy,
  dependencies: ChatgptSuccessorDependencies
): Promise<ChatgptSuccessorExecutionResult> {
  return executeChatgptSuccessorJob(job, policy, dependencies);
}
