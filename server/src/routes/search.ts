import { FastifyInstance } from 'fastify';
import { QueryFunction, query } from '../db.js';

export function registerSearchRoutes(app: FastifyInstance, queryFn: QueryFunction = query) {
  app.get<{ Querystring: { q?: string } }>('/api/messages/search', async (req) => {
    const q = (req.query.q ?? '').toString();
    if (!q) return [];
    const { rows } = await queryFn<any>(
      "SELECT msg_id, conv_id, role, substring(content, 1, 240) AS snippet, created_at FROM comind.cm_message WHERE content ILIKE '%' || $1 || '%' ORDER BY created_at DESC LIMIT 100",
      [q]
    );
    return rows;
  });
}
