import { FastifyInstance } from 'fastify';
import { AssistantProvider, ConversationMessage, ConversationRole } from '../assistant.js';
import { QueryFunction, query } from '../db.js';

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

export function registerAssistantRoutes(
  app: FastifyInstance,
  queryFn: QueryFunction = query,
  assistantProvider: AssistantProvider | null = null
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

      const history = await queryFn<{ role: string; content: string }>(
        `SELECT role, content
         FROM comind.cm_message
         WHERE conv_id=$1
         ORDER BY created_at ASC, msg_id ASC`,
        [id]
      );

      let generated;
      try {
        generated = await assistantProvider.generateResponse({
          conversationId: id,
          messages: history.rows.map(toConversationMessage),
        });
      } catch {
        req.log.warn(
          { conversationId: id, provider: assistantProvider.name },
          'Assistant provider request failed'
        );
        return reply.code(502).send({ error: 'Assistant provider request failed' });
      }

      const metadata = generated.metadata ?? { provider: assistantProvider.name };
      const persisted = await queryFn<any>(
        `INSERT INTO comind.cm_message (conv_id, role, content, meta)
         VALUES ($1, 'assistant', $2, $3::jsonb)
         RETURNING msg_id, conv_id, role, content, created_at, meta`,
        [id, generated.content, JSON.stringify(metadata)]
      );

      return reply.code(201).send(persisted.rows[0]);
    }
  );
}
