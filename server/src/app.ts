import Fastify from 'fastify';
import cors from '@fastify/cors';
import swagger from '@fastify/swagger';
import multipart from '@fastify/multipart';
import { env } from './env.js';
import { registerConversationRoutes } from './routes/conversations.js';
import { registerIngestRoutes } from './routes/ingest.js';
import { registerSearchRoutes } from './routes/search.js';
import { registerAnalyticsRoutes } from './routes/analytics.js';
import { registerAdminRoutes } from './routes/admin.js';
import { registerResearchRoutes } from './routes/research.js';
import { registerChecklistRoutes } from './routes/checklist.js';
import { closePool, databaseHealth } from './db.js';

export async function buildApp() {
  const app = Fastify({ logger: true });
  const allowedOrigins = env.CORS_ORIGINS
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  await app.register(cors, { origin: allowedOrigins.length > 0 ? allowedOrigins : false });
  await app.register(swagger, {
    openapi: { info: { title: 'CoMind API', version: '0.1.0' } },
  });
  await app.register(multipart);

  registerConversationRoutes(app);
  registerIngestRoutes(app);
  registerSearchRoutes(app);
  registerAnalyticsRoutes(app);
  registerResearchRoutes(app);
  registerChecklistRoutes(app);
  registerAdminRoutes(app);

  app.get('/', async () => ({ ok: true }));
  app.get('/health', async () => ({ ok: true, service: 'comind-api' }));
  app.get('/api/db/health', async () => databaseHealth());

  app.addHook('onClose', async () => {
    await closePool();
  });

  await app.ready();
  app.swagger();
  return app;
}
