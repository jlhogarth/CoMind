import { randomUUID } from 'node:crypto';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import swagger from '@fastify/swagger';
import multipart from '@fastify/multipart';
import { env } from './env.js';
import { AssistantProvider } from './assistant.js';
import { createConfiguredAssistantProvider } from './assistant-provider.js';
import {
  persistOpenAIProviderAcquisitionEvent,
  type ProviderAcquisitionWriter,
} from './conversation-acquisition-store.js';
import { createCheckpointScheduler } from './continuity/scheduler.js';
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
import { registerGovernanceRoutes } from './routes/governance.js';
import { registerCbeControlRoutes } from './routes/cbe-control.js';
import { createStagedRecoveryExecutor } from './cbe-control/recovery-executor.js';
import { createCbeControlExecutor, type CbeControlExecutor } from './cbe-control/executor.js';
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
  providerAcquisitionWriter: ProviderAcquisitionWriter;
  checkpointingEnabled: boolean;
  cbeControlExecutor: CbeControlExecutor;
};

const defaultDependencies: AppDependencies = {
  query,
  databaseHealth,
  closePool,
  assistantProvider: createConfiguredAssistantProvider(),
  assistantMaxHistoryMessages: env.ASSISTANT_MAX_HISTORY_MESSAGES,
  conversationLock: withConversationLock,
  providerAcquisitionWriter: persistOpenAIProviderAcquisitionEvent,
  checkpointingEnabled: env.ACP_CHECKPOINTS_ENABLED,
  cbeControlExecutor: createCbeControlExecutor({
    profileDir: env.CBE_PROFILE_DIR,
    headless: env.CBE_HEADLESS,
    humanAuthUrl: env.CBE_HUMAN_AUTH_URL,
    recoveryExecutor: env.CBE_HANDOFF_JOB_FILE && env.CBE_PROFILE_DIR
      ? createStagedRecoveryExecutor({ query, jobFile: env.CBE_HANDOFF_JOB_FILE, profileDir: env.CBE_PROFILE_DIR, headless: env.CBE_HEADLESS })
      : null,
  }),
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
  const checkpointScheduler = createCheckpointScheduler(dependencies.query, {
    enabled: dependencies.checkpointingEnabled,
    onFailure: reason => app.log.warn({ reason }, 'ACP checkpoint scheduling failed'),
  });

  app.addHook('onResponse', (request, reply, done) => {
    const route = request.url.split('?')[0];
    if (reply.statusCode === 201
        && request.method === 'POST'
        && /^\/api\/conversations\/[^/]+\/assistant-response$/.test(route)) {
      const conversationId = decodeURIComponent(route.split('/')[3]);
      checkpointScheduler.schedule({
        conversationId,
        workflowId: 'conversation.assistant-response',
        executionId: randomUUID(),
        parentCheckpointId: null,
        executionCursor: 'assistant_response_persisted',
        authority: {
          subjectId: 'system',
          capabilityIds: [],
          policyVersion: 'system-observation-v1',
        },
        context: {
          objective: 'Assistant response persisted',
          decisions: [],
          references: ['conversation:' + conversationId],
        },
        provenance: {
          sourceRefs: ['route:POST /api/conversations/:id/assistant-response'],
          evidenceRefs: [],
        },
        pending: [],
      });
    }
    done();
  });

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
    dependencies.conversationLock,
    dependencies.providerAcquisitionWriter
  );
  registerMemoryRoutes(app, dependencies.query, dependencies.conversationLock);
  registerAdminRoutes(app);
  registerChatRoutes(app);
  registerGovernanceRoutes(app, dependencies.query);
  registerCbeControlRoutes(app, dependencies.cbeControlExecutor, env.CBE_CONTROL_TOKEN ?? null);

  app.get('/', async () => ({ ok: true }));
  app.get('/health', async () => ({ ok: true, service: 'comind-api' }));
  app.get('/api/db/health', async () => dependencies.databaseHealth());

  app.addHook('onClose', async () => {
    await checkpointScheduler.close();
    await dependencies.cbeControlExecutor.close();
    await dependencies.closePool();
  });

  await app.ready();
  app.swagger();
  return app;
}
