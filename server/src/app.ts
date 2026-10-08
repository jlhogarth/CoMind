import Fastify from 'fastify';
import cors from '@fastify/cors';
import swagger from '@fastify/swagger';
import multipart from '@fastify/multipart';
import { env } from './env.js';
import { AssistantProvider } from './assistant.js';
import { createConfiguredAssistantProvider } from './assistant-provider.js';
import { registerConversationRoutes } from './routes/conversations.js';
import { registerIngestRoutes } from './routes/ingest.js';
import { registerSearchRoutes } from './routes/search.js';
import { registerAnalyticsRoutes } from './routes/analytics.js';
import { registerSpendingGuardrailRoutes } from './routes/spending-guardrail.js';
import { registerAdminRoutes } from './routes/admin.js';
import { registerResearchRoutes } from './routes/research.js';
import { registerChecklistRoutes } from './routes/checklist.js';
import { registerAssistantRoutes } from './routes/assistant.js';
import { registerMemoryRoutes } from './routes/memory.js';
import { registerChatRoutes } from './routes/chat.js';
import {
  closePool,
  ConversationLockRunner,
  databaseHealth,
  query,
  QueryFunction,
  withConversationLock,
} from './db.js';

type AppDependencies = {
  query: QueryFunction;
  databaseHealth: typeof databaseHealth;
  closePool: typeof closePool;
  assistantProvider: AssistantProvider | null;
  assistantMaxHistoryMessages: number;
  conversationLock: ConversationLockRunner;
};

const defaultDependencies: AppDependencies = {
  query,
  databaseHealth,
  closePool,
  assistantProvider: createConfiguredAssistantProvider(),
  assistantMaxHistoryMessages: env.ASSISTANT_MAX_HISTORY_MESSAGES,
  conversationLock: withConversationLock,
};

export async function buildApp(overrides: Partial<AppDependencies> = {}) {
  const dependencies: AppDependencies = { ...defaultDependencies, ...overrides };

  if (overrides.query && overrides.conversationLock === undefined) {
    const injectedQuery = dependencies.query;
    dependencies.conversationLock = async <T>(
      _conversationId: string,
      work: (queryFn: QueryFunction) => Promise<T>
    ) => ({
      acquired: true,
      value: await work(injectedQuery),
    });
  }

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

  registerConversationRoutes(app, dependencies.query, dependencies.conversationLock);
  registerIngestRoutes(app, dependencies.query);
  registerSearchRoutes(app, dependencies.query);
  registerSpendingGuardrailRoutes(app, dependencies.query);
  registerAnalyticsRoutes(app, dependencies.query);
  registerResearchRoutes(app, dependencies.query);
  registerChecklistRoutes(app, dependencies.query);
  registerAssistantRoutes(
    app,
    dependencies.query,
    dependencies.assistantProvider,
    dependencies.assistantMaxHistoryMessages,
    dependencies.conversationLock
  );
  registerMemoryRoutes(app, dependencies.query, dependencies.conversationLock);
  registerAdminRoutes(app);
  registerChatRoutes(app);

  app.get('/', async () => ({ ok: true }));
  app.get('/health', async () => ({ ok: true, service: 'comind-api' }));
  app.get('/api/db/health', async () => dependencies.databaseHealth());

  app.addHook('onClose', async () => {
    await dependencies.closePool();
  });

  await app.ready();
  app.swagger();
  return app;
}
