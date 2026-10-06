import { FastifyInstance } from 'fastify';
import { query } from '../db.js';

export function registerConversationRoutes(app: FastifyInstance) {
  app.get('/api/conversations', async () => {
    const { rows } = await query<any>('SELECT conv_id, title, source, created_at FROM comind.cm_conversation ORDER BY created_at DESC');
    return rows;
  });

  app.get<{ Params: { id: string } }>('/api/conversations/:id', async (req) => {
    const { id } = req.params;
    const conv = await query<any>('SELECT * FROM comind.cm_conversation WHERE conv_id=$1', [id]);
    const msgs = await query<any>('SELECT * FROM comind.cm_message WHERE conv_id=$1 ORDER BY created_at ASC', [id]);
    return { conversation: conv.rows[0], messages: msgs.rows };
  });
}
