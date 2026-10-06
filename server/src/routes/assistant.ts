import { FastifyInstance } from 'fastify';
import { AssistantProvider, ConversationMessage, ConversationRole } from '../assistant.js';
import {
  ConversationLockRunner,
  QueryFunction,
  query,
  withConversationLock,
} from '../db.js';

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

function providerFailureDetails(error: unknown) {
  if (!(error instanceof Error)) {
    return { errorName: 'UnknownProviderError' };
  }

  const candidate = error as Error & {
    status?: unknown;
    code?: unknown;
    type?: unknown;
    request_id?: unknown;
  };
  const details: Record<string, string | number> = {
    errorName: error.name,
    errorMessage: error.message,
  };

  if (typeof candidate.status === 'number') details.status = candidate.status;
  if (typeof candidate.code === 'string') details.code = candidate.code;
  if (typeof candidate.type === 'string') details.type = candidate.type;
  if (typeof candidate.request_id === 'string') details.requestId = candidate.request_id;

  return details;
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
      const conversation = await queryFn<{ conv_id: string }>(
        'SELECT conv_id FROM comind.cm_conversation WHERE conv_id=$1',
        [id]
      );
      if (!conversation.rows[0]) {
        return reply.code(404).send({ error: 'Conversation not found' });
      }

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

        let generated;
        try {
          generated = await assistantProvider.generateResponse({
            conversationId: id,
            messages: boundedHistory,
          });
        } catch (error) {
          req.log.warn(
            {
              conversationId: id,
              provider: assistantProvider.name,
              providerFailure: providerFailureDetails(error),
            },
            'Assistant provider request failed'
          );
          return { kind: 'provider-failed' as const };
        }

        const metadata = generated.metadata ?? { provider: assistantProvider.name };
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
