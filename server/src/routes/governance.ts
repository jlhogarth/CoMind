import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { QueryFunction } from '../db.js';

const forbiddenContextKeys = new Set([
  'prompt',
  'raw_prompt',
  'secret',
  'password',
  'token',
  'api_key',
  'apikey',
  'authorization',
  'credential',
  'credentials',
  'key_material',
]);

const preflightBody = z.object({
  controlKey: z.string().min(1).max(64),
  context: z.record(z.string(), z.unknown()),
  record: z.boolean().optional().default(true),
});

function hasForbiddenKey(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasForbiddenKey);
  if (!value || typeof value !== 'object') return false;
  return Object.entries(value as Record<string, unknown>).some(
    ([key, nested]) => forbiddenContextKeys.has(key.toLowerCase()) || hasForbiddenKey(nested),
  );
}

export function registerGovernanceRoutes(app: FastifyInstance, query: QueryFunction): void {
  app.post('/api/governance/preflight', async (request, reply) => {
    const parsed = preflightBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: 'invalid_governance_preflight_request',
        details: parsed.error.flatten(),
      });
    }

    const { controlKey, context, record } = parsed.data;
    if (hasForbiddenKey(context)) {
      return reply.code(400).send({
        error: 'raw_sensitive_context_rejected',
        message: 'Governance preflight accepts structured metadata only. Raw prompts, tokens, credentials, passwords, key material, and secrets are prohibited.',
      });
    }

    const result = await query<{ decision: unknown }>(
      'select comind_pm.governance_preflight($1::text, $2::jsonb, $3::boolean) as decision',
      [controlKey, JSON.stringify(context), record],
    );

    const decision = result.rows[0]?.decision;
    if (!decision || typeof decision !== 'object') {
      request.log.error({ controlKey }, 'Governance preflight returned no decision');
      return reply.code(503).send({ error: 'governance_preflight_unavailable' });
    }

    return reply.code(200).send(decision);
  });
}
