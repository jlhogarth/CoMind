import { FastifyInstance } from 'fastify';
import { QueryFunction, query } from '../db.js';
import { z } from 'zod';

const SourceKind = z.enum([
  'standard', 'framework', 'profile', 'playbook', 'guidance', 'draft',
  'paper', 'report', 'documentation', 'web_reference', 'repository',
  'policy', 'other',
]);

const AuthorityLevel = z.enum([
  'official_standard', 'primary_authoritative', 'secondary_guidance',
  'internal_canonical', 'community', 'unverified',
]);

const LifecycleStatus = z.enum([
  'candidate', 'current', 'superseded', 'withdrawn', 'retired',
  'historical', 'rejected',
]);

const nullableText = z.string().nullable().optional();
const nullableDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional();
const nullableTimestamp = z.string().datetime({ offset: true }).nullable().optional();

const RefSchema = z.object({
  title: z.string().trim().min(1),
  url: z.string().url(),
  notes: nullableText,
  tags: z.array(z.string().trim().min(1)).nullable().optional(),
  publisher: nullableText,
  document_identifier: nullableText,
  source_kind: SourceKind.optional(),
  authority_level: AuthorityLevel.optional(),
  lifecycle_status: LifecycleStatus.optional(),
  version_label: nullableText,
  published_on: nullableDate,
  drive_file_id: nullableText,
  drive_url: z.string().url().nullable().optional(),
  drive_folder_id: nullableText,
  mime_type: nullableText,
  byte_size: z.number().int().nonnegative().nullable().optional(),
  content_sha256: z.string().regex(/^[0-9a-f]{64}$/).nullable().optional(),
  observed_fingerprint: nullableText,
  fingerprint_algorithm: nullableText,
  ingested_at: nullableTimestamp,
  last_verified_at: nullableTimestamp,
  freshness_due_at: nullableTimestamp,
  superseded_by_ref_id: z.string().uuid().nullable().optional(),
  research_session_id: z.string().uuid().nullable().optional(),
  source_link_id: z.string().uuid().nullable().optional(),
  related_capabilities: z.array(z.string().trim().min(1)).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

type RefInput = z.infer<typeof RefSchema>;

const columns: Record<keyof RefInput, string> = {
  title: 'title',
  url: 'url',
  notes: 'notes',
  tags: 'tags',
  publisher: 'publisher',
  document_identifier: 'document_identifier',
  source_kind: 'source_kind',
  authority_level: 'authority_level',
  lifecycle_status: 'lifecycle_status',
  version_label: 'version_label',
  published_on: 'published_on',
  drive_file_id: 'drive_file_id',
  drive_url: 'drive_url',
  drive_folder_id: 'drive_folder_id',
  mime_type: 'mime_type',
  byte_size: 'byte_size',
  content_sha256: 'content_sha256',
  observed_fingerprint: 'observed_fingerprint',
  fingerprint_algorithm: 'fingerprint_algorithm',
  ingested_at: 'ingested_at',
  last_verified_at: 'last_verified_at',
  freshness_due_at: 'freshness_due_at',
  superseded_by_ref_id: 'superseded_by_ref_id',
  research_session_id: 'research_session_id',
  source_link_id: 'source_link_id',
  related_capabilities: 'related_capabilities',
  metadata: 'metadata',
};

const listColumns = `
  ref_id, title, url, notes, tags, publisher, document_identifier,
  source_kind, authority_level, lifecycle_status, version_label, published_on,
  drive_file_id, drive_url, drive_folder_id, mime_type, byte_size,
  content_sha256, observed_fingerprint, fingerprint_algorithm,
  ingested_at, last_verified_at, freshness_due_at, superseded_by_ref_id,
  research_session_id, source_link_id, related_capabilities, metadata,
  created_at, updated_at
`;

function buildWrite(input: Partial<RefInput>) {
  const names: string[] = [];
  const values: unknown[] = [];
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) continue;
    const column = columns[key as keyof RefInput];
    names.push(column);
    values.push(value);
  }
  return { names, values };
}

export function registerResearchRoutes(app: FastifyInstance, queryFn: QueryFunction = query) {
  app.get('/api/research', async () => {
    const { rows } = await queryFn<any>(
      `SELECT ${listColumns} FROM comind.cm_research_refs ORDER BY created_at DESC`
    );
    return rows;
  });

  app.get<{ Params: { id: string } }>('/api/research/:id', async (req, res) => {
    const { id } = req.params;
    const { rows } = await queryFn<any>(
      `SELECT ${listColumns} FROM comind.cm_research_refs WHERE ref_id=$1`,
      [id]
    );
    if (!rows[0]) return res.code(404).send({ error: 'Not found' });
    return rows[0];
  });

  app.post('/api/research', async (req, res) => {
    const parsed = RefSchema.safeParse(req.body);
    if (!parsed.success) return res.code(400).send({ error: 'Invalid body', details: parsed.error.issues });

    const { names, values } = buildWrite(parsed.data);
    const placeholders = values.map((_, index) => `$${index + 1}`);
    const { rows } = await queryFn<any>(
      `INSERT INTO comind.cm_research_refs (${names.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING *`,
      values
    );
    return res.code(201).send(rows[0]);
  });

  app.put<{ Params: { id: string } }>('/api/research/:id', async (req, res) => {
    const { id } = req.params;
    const parsed = RefSchema.partial().safeParse(req.body);
    if (!parsed.success) return res.code(400).send({ error: 'Invalid body', details: parsed.error.issues });

    const { names, values } = buildWrite(parsed.data);
    if (names.length === 0) return res.code(400).send({ error: 'No fields to update' });

    const assignments = names.map((column, index) => `${column} = $${index + 1}`);
    values.push(id);
    const { rows } = await queryFn<any>(
      `UPDATE comind.cm_research_refs SET ${assignments.join(', ')}, updated_at = now() WHERE ref_id = $${values.length} RETURNING *`,
      values
    );
    if (!rows[0]) return res.code(404).send({ error: 'Not found' });
    return rows[0];
  });

  app.delete<{ Params: { id: string } }>('/api/research/:id', async (req, res) => {
    const { id } = req.params;
    const { rows } = await queryFn<any>(
      `UPDATE comind.cm_research_refs
          SET lifecycle_status = 'retired',
              metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
                'retired_at', now(),
                'retirement_reason', 'api_delete_compatibility'
              ),
              updated_at = now()
        WHERE ref_id = $1
        RETURNING ref_id, lifecycle_status`,
      [id]
    );
    if (!rows[0]) return res.code(404).send({ error: 'Not found' });
    return { ok: true, ...rows[0] };
  });
}
