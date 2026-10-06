import { FastifyInstance } from 'fastify';
import { QueryFunction, query } from '../db.js';
import { z } from 'zod';

const RefSchema = z.object({
  title: z.string(),
  url: z.string().url(),
  notes: z.string().optional(),
  tags: z.array(z.string()).optional()
});

const updateColumns: Record<keyof z.infer<typeof RefSchema>, string> = {
  title: 'title',
  url: 'url',
  notes: 'notes',
  tags: 'tags',
};

export function registerResearchRoutes(app: FastifyInstance, queryFn: QueryFunction = query) {
  app.get('/api/research', async () => {
    const { rows } = await queryFn<any>(
      'SELECT ref_id, title, url, notes, tags, created_at FROM comind.cm_research_refs ORDER BY created_at DESC'
    );
    return rows;
  });

  app.get<{ Params: { id: string } }>('/api/research/:id', async (req, res) => {
    const { id } = req.params;
    const { rows } = await queryFn<any>('SELECT * FROM comind.cm_research_refs WHERE ref_id=$1', [id]);
    if (!rows[0]) return res.code(404).send({ error: 'Not found' });
    return rows[0];
  });

  app.post('/api/research', async (req, res) => {
    const parsed = RefSchema.safeParse(req.body);
    if (!parsed.success) return res.code(400).send({ error: 'Invalid body', details: parsed.error.issues });
    const { title, url, notes, tags } = parsed.data;
    const { rows } = await queryFn<any>(
      'INSERT INTO comind.cm_research_refs (title, url, notes, tags) VALUES ($1,$2,$3,$4) RETURNING *',
      [title, url, notes ?? null, tags ?? null]
    );
    return rows[0];
  });

  app.put<{ Params: { id: string } }>('/api/research/:id', async (req, res) => {
    const { id } = req.params;
    const parsed = RefSchema.partial().safeParse(req.body);
    if (!parsed.success) return res.code(400).send({ error: 'Invalid body', details: parsed.error.issues });
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;
    for (const [k, v] of Object.entries(parsed.data)) {
      if (v === undefined) continue;
      const column = updateColumns[k as keyof typeof updateColumns];
      fields.push(`${column} = $${idx}`);
      values.push(v);
      idx += 1;
    }
    if (fields.length === 0) return res.code(400).send({ error: 'No fields to update' });
    values.push(id);
    const sql = `UPDATE comind.cm_research_refs SET ${fields.join(', ')}, updated_at = now() WHERE ref_id = $${idx} RETURNING *`;
    const { rows } = await queryFn<any>(sql, values);
    if (!rows[0]) return res.code(404).send({ error: 'Not found' });
    return rows[0];
  });

  app.delete<{ Params: { id: string } }>('/api/research/:id', async (req, res) => {
    const { id } = req.params;
    const { rows } = await queryFn<any>('DELETE FROM comind.cm_research_refs WHERE ref_id=$1 RETURNING ref_id', [id]);
    if (!rows[0]) return res.code(404).send({ error: 'Not found' });
    return { ok: true };
  });
}
