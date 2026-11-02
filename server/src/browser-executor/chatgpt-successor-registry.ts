import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import { normalizeChatgptConversationUrl } from './chatgpt-handoff.js';

export type ChatgptSuccessorRegistryInput = {
  workKey: string;
  continuityId: string;
  successorConversationUrl: string;
  expectedPredecessorBindingEventId: string;
  predecessorConversationRefSha256?: string;
  registeredBy: string;
};

export type ChatgptSuccessorRegistryResult = {
  promoted: boolean;
  reason: string;
  recoverable: boolean;
  bindingEventId?: string;
  supersedesEventId?: string;
  conversationGeneration?: number;
  desiredTitle?: string;
  successorConversationRefSha256?: string;
};

type WorkItemRow = { id: string; title: string | null };
type BindingRow = {
  id: string;
  event_type: 'bound' | 'retired';
  external_conversation_id: string;
  registered_conversation_url: string;
};
type CountRow = { bound_count: number | string };
type BindResultRow = { binding: Record<string, unknown> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function nonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function conversationIdFromUrl(value: string): { url: string; id: string } | null {
  const normalized = normalizeChatgptConversationUrl(value);
  if (!normalized) return null;
  const id = normalized.slice('https://chatgpt.com/c/'.length);
  if (!UUID.test(id)) return null;
  return { url: normalized, id: id.toLowerCase() };
}

function deterministicTitle(workKey: string, generation: number): string {
  return `CoMind ${workKey.trim()} #${String(generation).padStart(3, '0')}`;
}

function result(reason: string, recoverable: boolean): ChatgptSuccessorRegistryResult {
  return { promoted: false, reason, recoverable };
}

export async function promoteChatgptSuccessorBinding(
  client: PoolClient,
  input: ChatgptSuccessorRegistryInput
): Promise<ChatgptSuccessorRegistryResult> {
  const workKey = input.workKey?.trim();
  const continuityId = input.continuityId?.trim();
  const predecessorBindingEventId = input.expectedPredecessorBindingEventId?.trim().toLowerCase();
  const registeredBy = input.registeredBy?.trim();
  const successor = conversationIdFromUrl(input.successorConversationUrl);

  if (!nonEmpty(workKey) || !nonEmpty(continuityId) || !nonEmpty(registeredBy)) {
    return result('successor_registry_input_invalid', false);
  }
  if (!UUID.test(predecessorBindingEventId) || !successor) {
    return result('successor_registry_identity_invalid', false);
  }

  const successorConversationRefSha256 = sha256(successor.url);
  let transactionStarted = false;

  try {
    await client.query('BEGIN');
    transactionStarted = true;
    await client.query(
      `SELECT pg_advisory_xact_lock(hashtextextended('lane-conversation:' || btrim($1), 0))`,
      [workKey]
    );

    const workItem = await client.query<WorkItemRow>(
      `SELECT id, title
         FROM comind_pm.pm_work_items
        WHERE work_key = btrim($1)`,
      [workKey]
    );
    if (workItem.rows.length !== 1) {
      await client.query('ROLLBACK');
      transactionStarted = false;
      return result('successor_registry_work_item_missing', false);
    }

    const workItemId = workItem.rows[0].id;
    const currentBinding = await client.query<BindingRow>(
      `SELECT id, event_type, external_conversation_id, registered_conversation_url
         FROM comind_pm.pm_lane_conversation_binding_events
        WHERE work_item_id = $1::uuid
        ORDER BY created_at DESC, id DESC
        LIMIT 1`,
      [workItemId]
    );
    if (currentBinding.rows.length !== 1 || currentBinding.rows[0].event_type !== 'bound') {
      await client.query('ROLLBACK');
      transactionStarted = false;
      return result('successor_registry_predecessor_inactive', false);
    }
    if (currentBinding.rows[0].id.toLowerCase() !== predecessorBindingEventId) {
      await client.query('ROLLBACK');
      transactionStarted = false;
      return result('successor_registry_predecessor_changed', false);
    }

    const count = await client.query<CountRow>(
      `SELECT count(*)::int AS bound_count
         FROM comind_pm.pm_lane_conversation_binding_events
        WHERE work_item_id = $1::uuid
          AND event_type = 'bound'`,
      [workItemId]
    );
    const priorGeneration = Number(count.rows[0]?.bound_count ?? 0);
    if (!Number.isSafeInteger(priorGeneration) || priorGeneration < 1) {
      throw new Error('invalid_generation_count');
    }
    const conversationGeneration = priorGeneration + 1;
    const desiredTitle = deterministicTitle(workKey, conversationGeneration);
    const identityEvidenceRef = `sha256:${successorConversationRefSha256}`;
    const idempotencyKey = `aed-005:${continuityId}:successor-binding`;
    const metadata = {
      continuityId,
      recoveryMode: 'successor',
      conversationGeneration,
      desiredTitle,
      expectedPredecessorBindingEventId: predecessorBindingEventId,
      predecessorConversationRefSha256: input.predecessorConversationRefSha256 ?? null,
      successorConversationRefSha256,
    };

    const bound = await client.query<BindResultRow>(
      `SELECT comind_pm.bind_lane_conversation(
         $1, $2, $3, NULL, 'runtime_exact_id', $4, $5, $6, true, $7::jsonb
       ) AS binding`,
      [
        workKey,
        successor.id,
        successor.url,
        identityEvidenceRef,
        registeredBy,
        idempotencyKey,
        JSON.stringify(metadata),
      ]
    );

    const binding = bound.rows[0]?.binding;
    const bindingEventId = typeof binding?.bindingEventId === 'string' ? binding.bindingEventId : null;
    const supersedesEventId = typeof binding?.supersedesEventId === 'string'
      ? binding.supersedesEventId
      : predecessorBindingEventId;
    if (!bindingEventId) throw new Error('binding_event_missing');

    await client.query('COMMIT');
    transactionStarted = false;
    return {
      promoted: true,
      reason: 'successor_registry_promoted',
      recoverable: false,
      bindingEventId,
      supersedesEventId,
      conversationGeneration,
      desiredTitle,
      successorConversationRefSha256,
    };
  } catch {
    if (transactionStarted) await client.query('ROLLBACK').catch(() => undefined);
    return result('successor_registry_promotion_failed', true);
  }
}
