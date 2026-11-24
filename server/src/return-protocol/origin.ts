import { randomUUID } from 'node:crypto';
import type OpenAI from 'openai';
import { originSchema, type RegisteredOrigin } from './core.js';
import { parseActiveConversationBinding } from '../browser-executor/self-hosted-dispatch.js';

export interface OriginRegistry {
  registerOrigin(origin: RegisteredOrigin): Promise<void>;
}

export async function registerApiOrigin(input: {
  client: Pick<OpenAI, 'conversations'>;
  registry: OriginRegistry;
  ownerBinding: string;
  workKey: string;
  authorityRef: string;
}): Promise<RegisteredOrigin> {
  // Only the provider's create response can establish an API conversation identity.
  const created = await input.client.conversations.create({}, { maxRetries: 0 });
  const origin = originSchema.parse({ originId: randomUUID(), surface: 'openai_api',
    conversationId: created.id, ownerBinding: input.ownerBinding,
    workKey: input.workKey, authorityRef: input.authorityRef });
  await input.registry.registerOrigin(origin);
  return origin;
}

export async function registerGovernedConsumerOrigin(input: {
  binding: unknown;
  registry: OriginRegistry;
  authenticatedOwnerBinding: string;
  workKey: string;
  authorityRef: string;
}): Promise<RegisteredOrigin> {
  // The existing CBE registry supplies the bound URL and UUID. The caller must
  // independently authenticate the owner; a URL alone grants no authority.
  const binding = parseActiveConversationBinding(input.binding);
  const origin = originSchema.parse({ originId: randomUUID(), surface: 'chatgpt_consumer',
    conversationId: binding.externalConversationId,
    ownerBinding: input.authenticatedOwnerBinding, workKey: input.workKey,
    authorityRef: input.authorityRef });
  await input.registry.registerOrigin(origin);
  return origin;
}
