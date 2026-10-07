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

function toConversationMessage(row: { role: string; content: string }): ConversationMessage {
  if (!supportedRoles.has(row.role as ConversationRole)) {
    throw new Error(`Unsupported persisted conversation role: ${row.role}`);
  }

  return {
    role: row.role as ConversationRole,
    content: row.content,
  };
}

function retainRecentHistory(messages: ConversationMessage[], maxHistoryMessages: number) {
  return messages.slice(Math.max(messages.length - maxHistoryMessages, 0));
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

      const locked = await conversationLock(id, async (lockedQuery) => {
        const history = await lockedQuery<any>(
          `SELECT role, content, msg_id, conv_id, created_at, meta
           FROM comind.cm_message
           WHERE conv_id=$1
           ORDER BY created_at ASC, msg_id ASC`,
          [id]
        );

        let latestUserIndex = -1;
        for (let index = history.rows.length - 1; index >= 0; index--) {
          if (history.rows[index].role === 'user') {
            latestUserIndex = index;
            break;
          }
        }

        if (latestUserIndex >= 0) {
          const existingAssistant = history.rows
            .slice(latestUserIndex + 1)
            .find((row) => row.role === 'assistant');
          if (existingAssistant) {
            return { kind: 'replay' as const, message: existingAssistant };
          }
        }

        const boundedHistory = retainRecentHistory(
          history.rows.map(toConversationMessage),
          maxHistoryMessages
        );

        let providerMessages = boundedHistory;
        let memoryRetrievalMetadata: Record<string, unknown> | null = null;
        if (projectId) {
          try {
            const retrieval = await retrieveProjectMemoryContext(
              lockedQuery,
              projectId,
              { conversationId: id, messages: boundedHistory }
            );
            if (retrieval.contextMessage) {
              providerMessages = [retrieval.contextMessage, ...boundedHistory];
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

        let generated;
        try {
          generated = await assistantProvider.generateResponse({
            conversationId: id,
            messages: providerMessages,
          });
        } catch (error) {
          req.log.warn(
            {
              conversationId: id,
              provider: assistantProvider.name,
              ...providerFailureDiagnostics(error),
            },
            'Assistant provider request failed'
          );
          return { kind: 'provider-failed' as const };
        }

        const metadata = {
          ...(generated.metadata ?? { provider: assistantProvider.name }),
          ...(memoryRetrievalMetadata ? { memory_retrieval: memoryRetrievalMetadata } : {}),
        };
        const persisted = await lockedQuery<any>(
          `INSERT INTO comind.cm_message (conv_id, role, content, meta)
           VALUES ($1, 'assistant', $2, $3::jsonb)
           RETURNING msg_id, conv_id, role, content, created_at, meta`,
          [id, generated.content, JSON.stringify(metadata)]
        );

        return { kind: 'created' as const, message: persisted.rows[0] };
      });

      if (!locked.acquired) {
        return reply
          .header('Retry-After', '1')
          .code(409)
          .send({ error: 'Assistant response generation is already in progress' });
      }

      if (locked.value.kind === 'provider-failed') {
        return reply.code(502).send({ error: 'Assistant provider request failed' });
      }
      if (locked.value.kind === 'replay') {
        return reply.code(200).send(locked.value.message);
      }
      return reply.code(201).send(locked.value.message);
    }
  );
}
