import { FastifyInstance } from 'fastify';
import { query } from '../db.js';

export function registerAnalyticsRoutes(app: FastifyInstance) {
  app.get('/api/analytics/summary', async () => {
    const convs = await query<{ count: number }>("SELECT COUNT(*)::int as count FROM comind.cm_conversation");
    const msgs = await query<{ count: number }>("SELECT COUNT(*)::int as count FROM comind.cm_message");
    const top10 = await query<any>("SELECT conv_id, COUNT(*)::int AS messages FROM comind.cm_message GROUP BY conv_id ORDER BY messages DESC LIMIT 10");
    return { conversations: convs.rows[0].count, messages: msgs.rows[0].count, top10: top10.rows };
  });
}
