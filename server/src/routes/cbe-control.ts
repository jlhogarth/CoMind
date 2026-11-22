import { timingSafeEqual } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  CBE_CONTROL_ACTIONS,
  CbeControlUnavailableError,
  type CbeControlExecutor,
  type CbeControlRequest,
} from '../cbe-control/executor.js';

const boundedNullable = z.string().trim().min(1).max(128).nullable().optional().default(null);
const requestSchema = z.strictObject({
  action: z.enum(CBE_CONTROL_ACTIONS),
  work_key: boundedNullable,
  recovery_id: boundedNullable,
  environment: z.literal('development-test'),
  production_change: z.literal(false),
  requested_at: z.string().trim().min(1).max(64),
}).superRefine((value, context) => {
  if ((value.action === 'retry_recovery' || value.action === 'wake_conversation') && !value.work_key) {
    context.addIssue({
      code: 'custom',
      path: ['work_key'],
      message: `${value.action} requires work_key`,
    });
  }
});

function bearerMatches(header: string | undefined, expected: string): boolean {
  if (!header?.startsWith('Bearer ')) return false;
  const supplied = header.slice('Bearer '.length);
  const suppliedBuffer = Buffer.from(supplied);
  const expectedBuffer = Buffer.from(expected);
  return suppliedBuffer.length === expectedBuffer.length
    && timingSafeEqual(suppliedBuffer, expectedBuffer);
}

export function registerCbeControlRoutes(
  app: FastifyInstance,
  executor: CbeControlExecutor,
  controlToken: string | null
) {
  app.post('/api/cbe-control', async (request, reply) => {
    if (!controlToken) {
      return reply.code(503).send({
        status: 'unavailable',
        message: 'CBE execution capability is not configured on this server.',
        human_action_required: false,
        human_action_url: null,
      });
    }
    if (!bearerMatches(request.headers.authorization, controlToken)) {
      return reply.code(401).send({
        status: 'unauthorized',
        message: 'CBE execution authorization failed.',
        human_action_required: false,
        human_action_url: null,
      });
    }

    const parsed = requestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        status: 'invalid_request',
        message: 'CBE control request failed strict validation.',
        human_action_required: false,
        human_action_url: null,
      });
    }

    try {
      const response = await executor.execute(parsed.data as CbeControlRequest);
      return reply.code(202).send(response);
    } catch (error) {
      if (error instanceof CbeControlUnavailableError) {
        request.log.warn({ reason: error.reason }, 'CBE control action unavailable');
        return reply.code(503).send({
          status: 'unavailable',
          message: error.message,
          human_action_required: false,
          human_action_url: null,
        });
      }
      request.log.error({ errorType: error instanceof Error ? error.name : 'unknown' }, 'CBE control action failed');
      return reply.code(500).send({
        status: 'failed',
        message: 'CBE execution failed without a verified result.',
        human_action_required: false,
        human_action_url: null,
      });
    }
  });
}
