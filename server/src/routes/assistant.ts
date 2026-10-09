import { performance } from 'node:perf_hooks';
import { FastifyInstance } from 'fastify';
import { AssistantProvider, ConversationMessage, ConversationRole } from '../assistant.js';
import {
  ConversationLockRunner,
  QueryFunction,
  query,
  withConversationLock,
} from '../db.js';
import { retrieveProjectMemoryContext } from '../memory-retrieval.js';

const supportedRoles = new Set<ConversationRole>(['user', 'assistant', 'system', 'tool']);

interface PersistedMessageRow {
  msg_id: string;
  conv_id: string;
  role: ConversationRole;
  content: string;
  created_at: string;
  meta: Record<string, unknown> | null;
}

interface LatestTurnRow {
  user_msg_id: string;
  assistant_msg_id: string | null;
  assistant_conv_id: string | null;
  assistant_role: ConversationRole | null;
  assistant_content: string | null;
  assistant_created_at: string | null;
  assistant_meta: Record<string, unknown> | null;
}

interface GenerationClaimRow {
  generation_id: string;
  claim_token: string;
  user_msg_id: string;
}

function toConversationMessage(row: { role: string; content: string }): ConversationMessage {
  if (!supportedRoles.has(row.role as ConversationRole)) {
    throw new Error(`Unsupported persisted conversation role: ${row.role}`);
  }

  return {
    role: row.role as ConversationRole,
    content: row.content,
  };
}

function elapsedMilliseconds(startedAt: number) {
  return Number((performance.now() - startedAt).toFixed(3));
}

function providerFailureDiagnostics(error: unknown) {
  if (!error || typeof error !== 'object') {
    return { errorName: typeof error };
  }

  const candidate = error as Record<string, unknown>;
  const diagnostics: Record<string, unknown> = {};

  if (typeof candidate.name === 'string') diagnostics.errorName = candidate.name;
  if (typeof candidate.status === 'number') diagnostics.status = candidate.status;
  if (typeof candidate.code === 'string') diagnostics.code = candidate.code;
  if (typeof candidate.type === 'string') diagnostics.type = candidate.type;
  if (typeof candidate.request_id === 'string') diagnostics.requestId = candidate.request_id;
  if (typeof candidate.requestId === 'string') diagnostics.requestId = candidate.requestId;
  if (candidate.providerMetadata && typeof candidate.providerMetadata === 'object') {
    diagnostics.providerMetadata = candidate.providerMetadata;
  }

  return Object.keys(diagnostics).length > 0 ? diagnostics : { errorName: 'unknown' };
}

function retrievalFailureDiagnostics(error: unknown) {
  if (!error || typeof error !== 'object') return { errorName: typeof error };
  const candidate = error as Record<string, unknown>;
  return {
    errorName: typeof candidate.name === 'string' ? candidate.name : 'unknown',
    ...(typeof candidate.code === 'string' ? { code: candidate.code } : {}),
  };
}

function replayMessage(row: LatestTurnRow): PersistedMessageRow {
  if (
    !row.assistant_msg_id
    || !row.assistant_conv_id
    || row.assistant_role !== 'assistant'
    || row.assistant_content === null
    || !row.assistant_created_at
  ) {
    throw new Error('Replay row does not contain a complete assistant message');
  }

  return {
    msg_id: row.assistant_msg_id,
    conv_id: row.assistant_conv_id,
    role: row.assistant_role,
    content: row.assistant_content,
    created_at: row.assistant_created_at,
    meta: row.assistant_meta,
  };
}

function setServerTiming(
  reply: { header(name: string, value: string): unknown },
  timings: {
    claimMs?: number;
    memoryMs?: number;
    providerMs?: number;
    persistenceMs?: number;
  }
) {
  const parts = [
    timings.claimMs === undefined ? null : `claim;dur=${timings.claimMs}`,
    timings.memoryMs === undefined ? null : `memory;dur=${timings.memoryMs}`,
    timings.providerMs === undefined ? null : `provider;dur=${timings.providerMs}`,
    timings.persistenceMs === undefined ? null : `persistence;dur=${timings.persistenceMs}`,
  ].filter((value): value is string => value !== null);
  if (parts.length > 0) reply.header('Server-Timing', parts.join(', '));
}

export function registerAssistantRoutes(
  app: FastifyInstance,
  queryFn: QueryFunction = query,
  assistantProvider: AssistantProvider | null = null,
  maxHistoryMessages = 40,
  conversationLock: ConversationLockRunner = withConversationLock
) {
  app.get('/api/assistant/status', async () => ({
    enabled: assistantProvider !== null,
    provider: assistantProvider?.name ?? null,
  }));

  app.post<{ Params: { id: string } }>(
    '/api/conversations/:id/assistant-response',
    async (req, reply) => {
      if (!assistantProvider) {
        return reply.code(503).send({ error: 'Assistant provider is not configured' });
      }

      const { id } = req.params;
      const conversation = await queryFn<{ conv_id: string; project_id: string | null }>(
        'SELECT conv_id, project_id FROM comind.cm_conversation WHERE conv_id=$1',
        [id]
      );
      if (!conversation.rows[0]) {
        return reply.code(404).send({ error: 'Conversation not found' });
      }
      const projectId = conversation.rows[0].project_id ?? null;

      const claimStartedAt = performance.now();
      const locked = await conversationLock(id, async (lockedQuery) => {
        const latestTurn = await lockedQuery<LatestTurnRow>(
          `SELECT
             u.msg_id AS user_msg_id,
             a.msg_id AS assistant_msg_id,
             a.conv_id AS assistant_conv_id,
             a.role AS assistant_role,
             a.content AS assistant_content,
             a.created_at AS assistant_created_at,
             a.meta AS assistant_meta
           FROM LATERAL (
             SELECT msg_id, created_at
             FROM comind.cm_message
             WHERE conv_id=$1 AND role='user'
             ORDER BY created_at DESC, msg_id DESC
             LIMIT 1
           ) AS u
           LEFT JOIN LATERAL (
             SELECT msg_id, conv_id, role, content, created_at, meta
             FROM comind.cm_message
             WHERE conv_id=$1
               AND role='assistant'
               AND (
                 created_at > u.created_at
                 OR (created_at = u.created_at AND msg_id > u.msg_id)
               )
             ORDER BY created_at ASC, msg_id ASC
             LIMIT 1
           ) AS a ON TRUE`,
          [id]
        );

        const turn = latestTurn.rows[0];
        if (!turn) {
          return { kind: 'no-user-message' as const };
        }
        if (turn.assistant_msg_id) {
          return { kind: 'replay' as const, message: replayMessage(turn) };
        }

        const history = await lockedQuery<PersistedMessageRow>(
          `SELECT role, content, msg_id, conv_id, created_at, meta
           FROM (
             SELECT role, content, msg_id, conv_id, created_at, meta
             FROM comind.cm_message
             WHERE conv_id=$1
             ORDER BY created_at DESC, msg_id DESC
             LIMIT $2
           ) AS recent
           ORDER BY created_at ASC, msg_id ASC`,
          [id, maxHistoryMessages]
        );

        const claim = await lockedQuery<GenerationClaimRow>(
          `INSERT INTO comind.cm_assistant_generation (conv_id, user_msg_id)
           VALUES ($1, $2)
           ON CONFLICT DO NOTHING
           RETURNING generation_id, claim_token, user_msg_id`,
          [id, turn.user_msg_id]
        );
        if (!claim.rows[0]) {
          return { kind: 'busy' as const };
        }

        return {
          kind: 'claimed' as const,
          claim: claim.rows[0],
          history: history.rows.map(toConversationMessage),
        };
      });
      const claimMs = elapsedMilliseconds(claimStartedAt);

      if (!locked.acquired || locked.value.kind === 'busy') {
        setServerTiming(reply, { claimMs });
        return reply
          .header('Retry-After', '1')
          .code(409)
          .send({ error: 'Assistant response generation is already in progress' });
      }
      if (locked.value.kind === 'no-user-message') {
        setServerTiming(reply, { claimMs });
        return reply.code(409).send({ error: 'No user message is available for assistant generation' });
      }
      if (locked.value.kind === 'replay') {
        setServerTiming(reply, { claimMs });
        return reply.code(200).send(locked.value.message);
      }

      const { claim, history } = locked.value;
      let providerMessages = history;
      let memoryRetrievalMetadata: Record<string, unknown> | null = null;
      const memoryStartedAt = performance.now();
      if (projectId) {
        try {
          const retrieval = await retrieveProjectMemoryContext(
            queryFn,
            projectId,
            { conversationId: id, messages: history }
          );
          if (retrieval.contextMessage) {
            providerMessages = [retrieval.contextMessage, ...history];
          }
          memoryRetrievalMetadata = retrieval.telemetry;
        } catch (error) {
          req.log.warn(
            {
              conversationId: id,
              projectId,
              ...retrievalFailureDiagnostics(error),
            },
            'Assistant memory retrieval failed; continuing without retrieved memory'
          );
          memoryRetrievalMetadata = {
            strategy: 'project_lexical_v1',
            status: 'failed',
          };
        }
      }
      const memoryMs = elapsedMilliseconds(memoryStartedAt);

      const providerStartedAt = performance.now();
      let generated;
      try {
        generated = await assistantProvider.generateResponse({
          conversationId: id,
          messages: providerMessages,
        });
      } catch (error) {
        const providerMs = elapsedMilliseconds(providerStartedAt);
        const failedClaim = await queryFn(
          `UPDATE comind.cm_assistant_generation
           SET status='failed', failed_at=now(), failure_code='provider_failure'
           WHERE generation_id=$1::uuid
             AND claim_token=$2::uuid
             AND status='active'
           RETURNING generation_id`,
          [claim.generation_id, claim.claim_token]
        );
        req.log.warn(
          {
            conversationId: id,
            provider: assistantProvider.name,
            claimReleased: failedClaim.rows.length === 1,
            timings: { claimMs, memoryMs, providerMs },
            ...providerFailureDiagnostics(error),
          },
          'Assistant provider request failed'
        );
        setServerTiming(reply, { claimMs, memoryMs, providerMs });
        return reply.code(502).send({ error: 'Assistant provider request failed' });
      }
      const providerMs = elapsedMilliseconds(providerStartedAt);

      const metadata = {
        ...(generated.metadata ?? { provider: assistantProvider.name }),
        ...(memoryRetrievalMetadata ? { memory_retrieval: memoryRetrievalMetadata } : {}),
        conversation_fast_path: {
          strategy: 'durable_generation_claim_v1',
          history_limit: maxHistoryMessages,
          history_message_count: history.length,
          claim_ms: claimMs,
          memory_retrieval_ms: memoryMs,
          provider_ms: providerMs,
        },
      };

      const persistenceStartedAt = performance.now();
      const persisted = await queryFn<PersistedMessageRow>(
        `WITH inserted AS (
           INSERT INTO comind.cm_message (conv_id, role, content, meta)
           SELECT g.conv_id, 'assistant', $3, $4::jsonb
           FROM comind.cm_assistant_generation AS g
           WHERE g.generation_id=$1::uuid
             AND g.claim_token=$2::uuid
             AND g.status='active'
           RETURNING msg_id, conv_id, role, content, created_at, meta
         ), completed AS (
           UPDATE comind.cm_assistant_generation AS g
           SET status='completed',
               assistant_msg_id=inserted.msg_id,
               completed_at=now()
           FROM inserted
           WHERE g.generation_id=$1::uuid
             AND g.claim_token=$2::uuid
             AND g.status='active'
           RETURNING g.generation_id
         )
         SELECT inserted.msg_id,
                inserted.conv_id,
                inserted.role,
                inserted.content,
                inserted.created_at,
                inserted.meta
         FROM inserted
         JOIN completed ON TRUE`,
        [
          claim.generation_id,
          claim.claim_token,
          generated.content,
          JSON.stringify(metadata),
        ]
      );
      const persistenceMs = elapsedMilliseconds(persistenceStartedAt);

      if (!persisted.rows[0]) {
        req.log.error(
          {
            conversationId: id,
            generationId: claim.generation_id,
            timings: { claimMs, memoryMs, providerMs, persistenceMs },
          },
          'Assistant generation claim was no longer active during persistence'
        );
        setServerTiming(reply, { claimMs, memoryMs, providerMs, persistenceMs });
        return reply.code(409).send({ error: 'Assistant generation claim is no longer active' });
      }

      req.log.info(
        {
          conversationId: id,
          generationId: claim.generation_id,
          historyMessageCount: history.length,
          historyLimit: maxHistoryMessages,
          timings: { claimMs, memoryMs, providerMs, persistenceMs },
        },
        'Assistant conversation fast path completed'
      );
      setServerTiming(reply, { claimMs, memoryMs, providerMs, persistenceMs });
      return reply.code(201).send(persisted.rows[0]);
    }
  );
}
