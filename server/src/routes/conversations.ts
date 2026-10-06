import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { QueryFunction, query } from '../db.js';

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

export function registerConversationRoutes(app: FastifyInstance, queryFn: QueryFunction = query) {
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
    const { rows } = await queryFn<any>(
      `INSERT INTO comind.cm_message (conv_id, role, content)
       SELECT conv_id, $2, $3
       FROM comind.cm_conversation
       WHERE conv_id = $1
       RETURNING msg_id, conv_id, role, content, created_at, meta`,
      [id, role, content]
    );

    if (!rows[0]) return reply.code(404).send({ error: 'Conversation not found' });
    return reply.code(201).send(rows[0]);
  });
}
