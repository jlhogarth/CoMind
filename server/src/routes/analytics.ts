import { FastifyInstance } from 'fastify';
import { QueryFunction, query } from '../db.js';

export function registerAnalyticsRoutes(app: FastifyInstance, queryFn: QueryFunction = query) {
  app.get('/api/analytics/summary', async () => {
    const convs = await queryFn<{ count: number }>("SELECT COUNT(*)::int as count FROM comind.cm_conversation");
    const msgs = await queryFn<{ count: number }>("SELECT COUNT(*)::int as count FROM comind.cm_message");
    const top10 = await queryFn<any>("SELECT conv_id, COUNT(*)::int AS messages FROM comind.cm_message GROUP BY conv_id ORDER BY messages DESC LIMIT 10");
    return { conversations: convs.rows[0].count, messages: msgs.rows[0].count, top10: top10.rows };
  });
}
