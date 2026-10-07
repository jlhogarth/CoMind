import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  ConversationLockRunner,
  QueryFunction,
  query,
  withConversationLock,
} from '../db.js';

const PromoteMemorySchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    kind: z.string().trim().min(1).max(80).default('conversation'),
    subtype: z.string().trim().min(1).max(80).optional(),
    priority: z.number().int().min(1).max(10).default(5),
    visibility: z.enum(['internal', 'public', 'private']).default('internal'),
  })
  .strict();

const MemoryListQuerySchema = z
  .object({
    status: z.enum(['active', 'archived', 'all']).default('active'),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();

const UpdateMemorySchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    kind: z.string().trim().min(1).max(80).optional(),
    subtype: z.string().trim().min(1).max(80).nullable().optional(),
    priority: z.number().int().min(1).max(10).optional(),
    visibility: z.enum(['internal', 'public', 'private']).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, { message: 'At least one field is required' });

type SourceMessage = {
  msg_id: string;
  conv_id: string;
  project_id: string | null;
  role: string;
  content: string;
  created_at: string;
};

const promotableRoles = new Set(['user', 'assistant']);
const promotionMethod = 'conversation_message_explicit_v1';
const memoryColumns = `memory_id, project_id, author_id, title, kind, subtype, content, json_payload,
                       priority, weight, status, visibility, created_at, updated_at, last_accessed`;

export function registerMemoryRoutes(
  app: FastifyInstance,
  queryFn: QueryFunction = query,
  conversationLock: ConversationLockRunner = withConversationLock
) {
  app.get<{ Params: { projectId: string }; Querystring: Record<string, unknown> }>(
    '/api/projects/:projectId/memories',
    async (req, reply) => {
      const parsed = MemoryListQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'Invalid query', details: parsed.error.issues });
      }
      const { status, limit } = parsed.data;
      const result = await queryFn<any>(
        `SELECT ${memoryColumns}
         FROM comind.cm_memory_node
         WHERE project_id = $1::uuid
           AND ($2 = 'all' OR status = $2)
         ORDER BY updated_at DESC, created_at DESC, memory_id ASC
         LIMIT $3`,
        [req.params.projectId, status, limit]
      );
      return result.rows;
    }
  );

  app.get<{ Params: { projectId: string; memoryId: string } }>(
    '/api/projects/:projectId/memories/:memoryId',
    async (req, reply) => {
      const result = await queryFn<any>(
        `SELECT ${memoryColumns}
         FROM comind.cm_memory_node
         WHERE project_id = $1::uuid AND memory_id = $2::uuid`,
        [req.params.projectId, req.params.memoryId]
      );
      if (!result.rows[0]) return reply.code(404).send({ error: 'Memory not found' });
      return result.rows[0];
    }
  );

  app.patch<{ Params: { projectId: string; memoryId: string } }>(
    '/api/projects/:projectId/memories/:memoryId',
    async (req, reply) => {
      const parsed = UpdateMemorySchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'Invalid body', details: parsed.error.issues });
      }
      const input = parsed.data;
      const result = await queryFn<any>(
        `UPDATE comind.cm_memory_node
         SET title = COALESCE($3, title),
             kind = COALESCE($4, kind),
             subtype = CASE WHEN $5::boolean THEN $6 ELSE subtype END,
             priority = COALESCE($7, priority),
             visibility = COALESCE($8, visibility),
             updated_at = now()
         WHERE project_id = $1::uuid AND memory_id = $2::uuid
         RETURNING ${memoryColumns}`,
        [
          req.params.projectId,
          req.params.memoryId,
          input.title ?? null,
          input.kind ?? null,
          Object.prototype.hasOwnProperty.call(input, 'subtype'),
          input.subtype ?? null,
          input.priority ?? null,
          input.visibility ?? null,
        ]
      );
      if (!result.rows[0]) return reply.code(404).send({ error: 'Memory not found' });
      return result.rows[0];
    }
  );

  app.post<{ Params: { projectId: string; memoryId: string } }>(
    '/api/projects/:projectId/memories/:memoryId/archive',
    async (req, reply) => {
      const result = await queryFn<any>(
        `UPDATE comind.cm_memory_node
         SET status = 'archived', updated_at = now()
         WHERE project_id = $1::uuid AND memory_id = $2::uuid
         RETURNING ${memoryColumns}`,
        [req.params.projectId, req.params.memoryId]
      );
      if (!result.rows[0]) return reply.code(404).send({ error: 'Memory not found' });
      return result.rows[0];
    }
  );

  app.post<{ Params: { projectId: string; memoryId: string } }>(
    '/api/projects/:projectId/memories/:memoryId/restore',
    async (req, reply) => {
      const result = await queryFn<any>(
        `UPDATE comind.cm_memory_node
         SET status = 'active', updated_at = now()
         WHERE project_id = $1::uuid AND memory_id = $2::uuid
         RETURNING ${memoryColumns}`,
        [req.params.projectId, req.params.memoryId]
      );
      if (!result.rows[0]) return reply.code(404).send({ error: 'Memory not found' });
      return result.rows[0];
    }
  );

  app.post<{ Params: { id: string } }>(
    '/api/messages/:id/promote-memory',
    async (req, reply) => {
      const parsed = PromoteMemorySchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'Invalid body', details: parsed.error.issues });
      }

      const source = await queryFn<SourceMessage>(
        `SELECT m.msg_id, m.conv_id, c.project_id, m.role, m.content, m.created_at
         FROM comind.cm_message m
         JOIN comind.cm_conversation c ON c.conv_id = m.conv_id
         WHERE m.msg_id = $1`,
        [req.params.id]
      );
      const sourceMessage = source.rows[0];
      if (!sourceMessage) {
        return reply.code(404).send({ error: 'Message not found' });
      }
      if (!sourceMessage.project_id) {
        return reply.code(409).send({ error: 'Source conversation is not assigned to a project' });
      }
      if (!promotableRoles.has(sourceMessage.role)) {
        return reply.code(409).send({ error: 'Only user or assistant messages can be promoted to memory' });
      }

      const locked = await conversationLock(sourceMessage.conv_id, async (lockedQuery) => {
        const existing = await lockedQuery<any>(
          `SELECT ${memoryColumns}
           FROM comind.cm_memory_node
           WHERE project_id = $1::uuid
             AND json_payload->>'promotion_method' = $2
             AND json_payload->>'source_message_id' = $3
           ORDER BY created_at ASC, memory_id ASC
           LIMIT 1`,
          [sourceMessage.project_id, promotionMethod, sourceMessage.msg_id]
        );
        if (existing.rows[0]) {
          return { kind: 'existing' as const, memory: existing.rows[0] };
        }

        const input = parsed.data;
        const provenance = {
          promotion_method: promotionMethod,
          source_conversation_id: sourceMessage.conv_id,
          source_message_id: sourceMessage.msg_id,
          source_role: sourceMessage.role,
          source_created_at: sourceMessage.created_at,
        };
        const inserted = await lockedQuery<any>(
          `INSERT INTO comind.cm_memory_node
             (project_id, title, kind, subtype, content, json_payload,
              priority, weight, status, visibility)
           VALUES ($1::uuid, $2, $3, $4, $5, $6::jsonb, $7, 1.0, 'active', $8)
           RETURNING ${memoryColumns}`,
          [
            sourceMessage.project_id,
            input.title,
            input.kind,
            input.subtype ?? null,
            sourceMessage.content,
            JSON.stringify(provenance),
            input.priority,
            input.visibility,
          ]
        );
        return { kind: 'created' as const, memory: inserted.rows[0] };
      });

      if (!locked.acquired) {
        return reply
          .header('Retry-After', '1')
          .code(409)
          .send({ error: 'Conversation memory promotion is already in progress' });
      }
      if (locked.value.kind === 'existing') {
        return reply.code(200).send({ created: false, memory: locked.value.memory });
      }
      return reply.code(201).send({ created: true, memory: locked.value.memory });
    }
  );
}
