import { performance } from 'node:perf_hooks';
import { FastifyInstance } from 'fastify';
import {
  AssistantProvider,
  AssistantProviderEvent,
  AssistantResponseObserver,
  AssistantTextDelta,
  ConversationMessage,
  ConversationRole,
} from '../assistant.js';
import {
  persistOpenAIProviderAcquisitionEvent,
  type ProviderAcquisitionWriter,
} from '../conversation-acquisition-store.js';
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
  capture_event_id: string;
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

function captureSourceEventRef(
  generationId: string,
  event: AssistantTextDelta,
  localSequence: number
) {
  const responseIdentity = event.providerResponseId ?? generationId;
  const providerSequence = event.providerSequenceNumber ?? localSequence;
  return `provider:${responseIdentity}:${event.stage}:${providerSequence}`;
}

export function registerAssistantRoutes(
  app: FastifyInstance,
  queryFn: QueryFunction = query,
  assistantProvider: AssistantProvider | null = null,
  maxHistoryMessages = 40,
  conversationLock: ConversationLockRunner = withConversationLock,
  providerAcquisitionWriter: ProviderAcquisitionWriter = persistOpenAIProviderAcquisitionEvent
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
          `WITH user_source AS (
             SELECT msg_id, conv_id, role, content
             FROM comind.cm_message
             WHERE msg_id=$2::uuid
               AND conv_id=$1::uuid
               AND role='user'
           ), user_captured AS (
             SELECT comind.cm_record_conversation_capture_event(
               p_conv_id => user_source.conv_id,
               p_event_type => 'user_message_observed',
               p_role => 'user',
               p_content_delta => user_source.content,
               p_msg_id => user_source.msg_id,
               p_source_system => 'comind_server',
               p_source_event_ref => 'message:' || user_source.msg_id::text || ':observed',
               p_raw_payload => jsonb_build_object('capture_path', 'assistant_claim_backfill')
             ) AS capture_event_id
             FROM user_source
           ), inserted AS (
             INSERT INTO comind.cm_assistant_generation (
               conv_id, user_msg_id, provider, metadata
             )
             SELECT $1::uuid, $2::uuid, $3, jsonb_build_object('capture_path', 'assistant_route')
             FROM user_captured
             ON CONFLICT DO NOTHING
             RETURNING generation_id, claim_token, user_msg_id
           ), generation_captured AS (
             SELECT
               inserted.generation_id,
               inserted.claim_token,
               inserted.user_msg_id,
               comind.cm_record_conversation_capture_event(
                 p_conv_id => $1::uuid,
                 p_event_type => 'assistant_generation_started',
                 p_role => 'assistant',
                 p_generation_id => inserted.generation_id,
                 p_source_system => 'comind_server',
                 p_source_event_ref => 'generation:' || inserted.generation_id::text || ':started',
                 p_raw_payload => jsonb_build_object(
                   'capture_path', 'assistant_route',
                   'provider', $3
                 )
               ) AS capture_event_id
             FROM inserted
           )
           SELECT generation_id, claim_token, user_msg_id, capture_event_id
           FROM generation_captured`,
          [id, turn.user_msg_id, assistantProvider.name]
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

      let observedDeltaCount = 0;
      let capturedDeltaCount = 0;
      let localDeltaSequence = 0;
      let localProviderEventSequence = 0;
      const observer: AssistantResponseObserver = {
        stage: 'direct',
        async onProviderEvent(event: AssistantProviderEvent) {
          localProviderEventSequence += 1;
          await providerAcquisitionWriter({
            conversationId: id, generationId: claim.generation_id,
            localSequence: localProviderEventSequence, event,
          });
        },
        async onTextDelta(event) {
          observedDeltaCount += 1;
          localDeltaSequence += 1;
          const sourceEventRef = captureSourceEventRef(
            claim.generation_id,
            event,
            localDeltaSequence
          );
          await queryFn(
            `SELECT comind.cm_record_conversation_capture_event(
               p_conv_id => $1::uuid,
               p_event_type => 'assistant_delta',
               p_role => 'assistant',
               p_content_delta => $2,
               p_generation_id => $3::uuid,
               p_source_system => $4,
               p_source_event_ref => $5,
               p_raw_payload => $6::jsonb
             ) AS capture_event_id`,
            [
              id,
              event.delta,
              claim.generation_id,
              assistantProvider.name,
              sourceEventRef,
              JSON.stringify({
                quality_stage: event.stage,
                provider_event_type: event.providerEventType ?? null,
                provider_sequence_number: event.providerSequenceNumber ?? null,
                provider_response_id: event.providerResponseId ?? null,
                provider_metadata: event.metadata ?? {},
              }),
            ]
          );
          capturedDeltaCount += 1;
        },
      };

      const providerStartedAt = performance.now();
      let generated;
      try {
        generated = await assistantProvider.generateResponse(
          {
            conversationId: id,
            messages: providerMessages,
          },
          observer
        );
      } catch (error) {
        const providerMs = elapsedMilliseconds(providerStartedAt);
        const interrupted = observedDeltaCount > 0;
        let terminalized = false;
        try {
          const terminal = await queryFn<{ generation_id: string; capture_event_id: string }>(
            `WITH terminalized AS (
               UPDATE comind.cm_assistant_generation
               SET status=$3,
                   last_activity_at=now(),
                   interrupted_at=CASE WHEN $3='interrupted' THEN now() ELSE NULL END,
                   failed_at=CASE WHEN $3='failed' THEN now() ELSE NULL END,
                   interruption_reason=CASE WHEN $3='interrupted' THEN 'provider_stream_interrupted' ELSE NULL END,
                   failure_code=CASE WHEN $3='failed' THEN 'provider_failure' ELSE NULL END
               WHERE generation_id=$1::uuid
                 AND claim_token=$2::uuid
                 AND status='active'
               RETURNING generation_id, conv_id
             ), captured AS (
               SELECT
                 terminalized.generation_id,
                 comind.cm_record_conversation_capture_event(
                   p_conv_id => terminalized.conv_id,
                   p_event_type => CASE WHEN $3='interrupted'
                     THEN 'assistant_generation_interrupted'
                     ELSE 'assistant_generation_failed'
                   END,
                   p_role => 'assistant',
                   p_generation_id => terminalized.generation_id,
                   p_source_system => 'comind_server',
                   p_source_event_ref => 'generation:' || terminalized.generation_id::text || ':' || $3,
                   p_raw_payload => $4::jsonb
                 ) AS capture_event_id
               FROM terminalized
             )
             SELECT generation_id, capture_event_id FROM captured`,
            [
              claim.generation_id,
              claim.claim_token,
              interrupted ? 'interrupted' : 'failed',
              JSON.stringify({
                observed_delta_count: observedDeltaCount,
                captured_delta_count: capturedDeltaCount,
                reason: interrupted ? 'provider_stream_interrupted' : 'provider_failure',
                diagnostics: providerFailureDiagnostics(error),
              }),
            ]
          );
          terminalized = terminal.rows.length === 1;
        } catch (terminalError) {
          req.log.error(
            {
              conversationId: id,
              generationId: claim.generation_id,
              ...providerFailureDiagnostics(terminalError),
            },
            'Assistant generation could not be terminalized after provider failure'
          );
        }

        req.log.warn(
          {
            conversationId: id,
            provider: assistantProvider.name,
            generationState: interrupted ? 'interrupted' : 'failed',
            claimReleased: terminalized,
            observedDeltaCount,
            capturedDeltaCount,
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
        conversational_continuity: {
          generation_id: claim.generation_id,
          observed_delta_count: observedDeltaCount,
          captured_delta_count: capturedDeltaCount,
        },
        conversation_fast_path: {
          strategy: 'durable_generation_claim_cfr_v2',
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
               completed_at=now(),
               last_activity_at=now()
           FROM inserted
           WHERE g.generation_id=$1::uuid
             AND g.claim_token=$2::uuid
             AND g.status='active'
           RETURNING g.generation_id, g.conv_id
         ), captured AS (
           SELECT comind.cm_record_conversation_capture_event(
             p_conv_id => completed.conv_id,
             p_event_type => 'assistant_generation_completed',
             p_role => 'assistant',
             p_content_delta => inserted.content,
             p_generation_id => completed.generation_id,
             p_msg_id => inserted.msg_id,
             p_source_system => 'comind_server',
             p_source_event_ref => 'generation:' || completed.generation_id::text || ':completed',
             p_raw_payload => jsonb_build_object(
               'observed_delta_count', $5::int,
               'captured_delta_count', $6::int,
               'canonical_completion', true
             )
           ) AS capture_event_id
           FROM completed
           JOIN inserted ON TRUE
         )
         SELECT inserted.msg_id,
                inserted.conv_id,
                inserted.role,
                inserted.content,
                inserted.created_at,
                inserted.meta
         FROM inserted
         JOIN completed ON TRUE
         JOIN captured ON TRUE`,
        [
          claim.generation_id,
          claim.claim_token,
          generated.content,
          JSON.stringify(metadata),
          observedDeltaCount,
          capturedDeltaCount,
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
          observedDeltaCount,
          capturedDeltaCount,
          timings: { claimMs, memoryMs, providerMs, persistenceMs },
        },
        'Assistant conversation fast path completed with CFR capture'
      );
      setServerTiming(reply, { claimMs, memoryMs, providerMs, persistenceMs });
      return reply.code(201).send(persisted.rows[0]);
    }
  );
}
