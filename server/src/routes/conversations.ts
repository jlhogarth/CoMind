import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  ConversationLockRunner,
  QueryFunction,
  query,
  withConversationLock,
} from '../db.js';

const CreateConversationSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    project_id: z.string().uuid().optional(),
  })
  .strict();

const AppendMessageSchema = z
  .object({
    role: z.enum(['user', 'assistant', 'system', 'tool']),
    content: z.string().trim().min(1).max(100000),
  })
  .strict();

interface AppendMessageResultRow {
  generation_active: boolean;
  msg_id: string | null;
  conv_id: string;
  role: string | null;
  content: string | null;
  created_at: string | null;
  meta: Record<string, unknown> | null;
  capture_event_id: string | null;
}

export function registerConversationRoutes(
  app: FastifyInstance,
  queryFn: QueryFunction = query,
  conversationLock: ConversationLockRunner = withConversationLock
) {
  app.get('/api/conversations', async () => {
    const { rows } = await queryFn<any>(
      'SELECT conv_id, title, source, created_at FROM comind.cm_conversation ORDER BY created_at DESC'
    );
    return rows;
  });

  app.get<{ Params: { id: string } }>('/api/conversations/:id', async (req, reply) => {
    const { id } = req.params;
    const conv = await queryFn<any>('SELECT * FROM comind.cm_conversation WHERE conv_id=$1', [id]);
    if (!conv.rows[0]) return reply.code(404).send({ error: 'Conversation not found' });

    const msgs = await queryFn<any>(
      'SELECT * FROM comind.cm_message WHERE conv_id=$1 ORDER BY created_at ASC, msg_id ASC',
      [id]
    );
    return { conversation: conv.rows[0], messages: msgs.rows };
  });

  app.post('/api/conversations', async (req, reply) => {
    const parsed = CreateConversationSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid body', details: parsed.error.issues });
    }

    const { title, project_id } = parsed.data;
    const { rows } = await queryFn<any>(
      `INSERT INTO comind.cm_conversation (project_id, source, title)
       VALUES (
         COALESCE($1::uuid, (SELECT project_id FROM comind.cm_project WHERE slug='comind' LIMIT 1)),
         'live',
         $2
       )
       RETURNING conv_id, project_id, source, title, created_at`,
      [project_id ?? null, title]
    );
    return reply.code(201).send(rows[0]);
  });

  app.post<{ Params: { id: string } }>('/api/conversations/:id/messages', async (req, reply) => {
    const { id } = req.params;
    const parsed = AppendMessageSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid body', details: parsed.error.issues });
    }

    const { role, content } = parsed.data;
    const locked = await conversationLock(id, async (lockedQuery) => {
      const { rows } = await lockedQuery<AppendMessageResultRow>(
        `WITH conversation_state AS (
           SELECT
             c.conv_id,
             EXISTS (
               SELECT 1
               FROM comind.cm_assistant_generation AS g
               WHERE g.conv_id=c.conv_id AND g.status='active'
             ) AS generation_active
           FROM comind.cm_conversation AS c
           WHERE c.conv_id=$1
         ), inserted AS (
           INSERT INTO comind.cm_message (conv_id, role, content)
           SELECT conv_id, $2, $3
           FROM conversation_state
           WHERE generation_active=false
           RETURNING msg_id, conv_id, role, content, created_at, meta
         ), captured AS (
           SELECT comind.cm_record_conversation_capture_event(
             p_conv_id => inserted.conv_id,
             p_event_type => CASE inserted.role
               WHEN 'user' THEN 'user_message_observed'
               WHEN 'assistant' THEN 'assistant_message_observed'
               WHEN 'system' THEN 'system_message_observed'
               ELSE 'tool_message_observed'
             END,
             p_role => inserted.role,
             p_content_delta => inserted.content,
             p_msg_id => inserted.msg_id,
             p_source_system => 'comind_server',
             p_source_event_ref => 'message:' || inserted.msg_id::text || ':observed',
             p_raw_payload => jsonb_build_object('capture_path', 'conversation_append_route')
           ) AS capture_event_id
           FROM inserted
         )
         SELECT
           state.generation_active,
           inserted.msg_id,
           state.conv_id,
           inserted.role,
           inserted.content,
           inserted.created_at,
           inserted.meta,
           captured.capture_event_id
         FROM conversation_state AS state
         LEFT JOIN inserted ON TRUE
         LEFT JOIN captured ON TRUE`,
        [id, role, content]
      );
      return rows[0] ?? null;
    });

    if (!locked.acquired) {
      return reply.code(409).send({ error: 'Conversation is generating an assistant response' });
    }
    if (!locked.value) {
      return reply.code(404).send({ error: 'Conversation not found' });
    }
    if (locked.value.generation_active || !locked.value.msg_id || !locked.value.capture_event_id) {
      return reply.code(409).send({ error: 'Conversation is generating an assistant response' });
    }
    return reply.code(201).send({
      msg_id: locked.value.msg_id,
      conv_id: locked.value.conv_id,
      role: locked.value.role,
      content: locked.value.content,
      created_at: locked.value.created_at,
      meta: locked.value.meta,
    });
  });
}
