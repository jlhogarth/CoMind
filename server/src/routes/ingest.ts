import { FastifyInstance } from 'fastify';
import { QueryFunction, query } from '../db.js';
import { z } from 'zod';

const MessageSchema = z.object({
  id: z.string().optional(),
  author: z.object({ role: z.string().optional() }).optional(),
  create_time: z.number().nullable().optional(),
  content: z.object({
    content_type: z.string().optional(),
    parts: z.array(z.union([z.string(), z.record(z.any())])).optional()
  }).optional()
});

const ConversationSchema = z.object({
  id: z.string().optional(),
  title: z.string().nullable().optional(),
  create_time: z.number().nullable().optional(),
  update_time: z.number().nullable().optional(),
  mapping: z.record(z.object({ message: MessageSchema.nullable().optional() })).optional(),
  messages: z.array(MessageSchema).optional()
});

const ChatGPTExportSchema = z.union([
  z.object({ conversations: z.array(ConversationSchema) }),
  z.array(ConversationSchema)
]).transform((value) => Array.isArray(value) ? { conversations: value } : value);

type ConversationExport = z.infer<typeof ConversationSchema>;
type MessageExport = z.infer<typeof MessageSchema>;

function messageText(message: MessageExport): string {
  return (message.content?.parts ?? [])
    .map((part) => typeof part === 'string' ? part : JSON.stringify(part))
    .filter(Boolean)
    .join('\n\n');
}

function normalizeRole(role: string | undefined): 'user' | 'assistant' | 'system' | 'tool' {
  if (role === 'assistant' || role === 'system' || role === 'tool') return role;
  return 'user';
}

function extractMessages(conversation: ConversationExport): MessageExport[] {
  if (conversation.messages) return conversation.messages;
  if (!conversation.mapping) return [];

  return Object.values(conversation.mapping)
    .map((node) => node.message)
    .filter((message): message is MessageExport => Boolean(message))
    .filter((message) => messageText(message).length > 0)
    .sort((left, right) => (left.create_time ?? 0) - (right.create_time ?? 0));
}

export function registerIngestRoutes(app: FastifyInstance, queryFn: QueryFunction = query) {
  app.post('/api/ingest/chatgpt', async (req, res) => {
    const body = await req.file();
    if (!body) return res.code(400).send({ error: 'Upload a JSON file from ChatGPT export' });
    const json = JSON.parse((await body.toBuffer()).toString('utf8'));
    const parsed = ChatGPTExportSchema.safeParse(json);
    if (!parsed.success) {
      return res.code(400).send({ error: 'Invalid export format', details: parsed.error.issues });
    }

    const project = await queryFn<{ project_id: string }>("SELECT project_id FROM comind.cm_project WHERE slug='comind' LIMIT 1");
    const projectId = project.rows[0]?.project_id ?? null;

    for (const cv of parsed.data.conversations) {
      const title = cv.title ?? 'Untitled';
      const { rows: convRows } = await queryFn<{ conv_id: string }>(
        "INSERT INTO comind.cm_conversation (project_id, source, title, metadata) VALUES ($1,'chatgpt_export',$2,$3) RETURNING conv_id",
        [projectId, title, cv as any]
      );
      const convId = convRows[0].conv_id;

      for (const m of extractMessages(cv)) {
        const role = normalizeRole(m.author?.role);
        const content = messageText(m);
        await queryFn("INSERT INTO comind.cm_message (conv_id, role, content, created_at, meta) VALUES ($1,$2,$3, to_timestamp($4), $5)",
          [convId, role, content, Math.floor((m.create_time ?? Date.now()/1000)), { export_id: m.id, content_type: m.content?.content_type }]
        );
      }
    }

    return { ok: true };
  });
}
