import { FastifyInstance } from 'fastify';
import { query } from '../db.js';
import { z } from 'zod';

const ChecklistSchema = z.object({
  item: z.string(),
  effort_estimate: z.string().optional(),
  priority: z.enum(['Day-1 Critical','Day-2 Enhancement']).optional(),
  status: z.enum(['pending','in_progress','done']).optional(),
  config_checked: z.boolean().optional(),
  migration_done: z.boolean().optional(),
  test_done: z.boolean().optional()
});

const updateColumns: Record<keyof z.infer<typeof ChecklistSchema>, string> = {
  item: 'item',
  effort_estimate: 'effort_estimate',
  priority: 'priority',
  status: 'status',
  config_checked: 'config_checked',
  migration_done: 'migration_done',
  test_done: 'test_done',
};

export function registerChecklistRoutes(app: FastifyInstance) {
  // List
  app.get('/api/checklist', async () => {
    const { rows } = await query<any>(
      'SELECT item_id, item, effort_estimate, priority, status, config_checked, migration_done, test_done, created_at FROM comind.cm_enterprise_checklist ORDER BY priority, created_at'
    );
    return rows;
  });

  // Create
  app.post('/api/checklist', async (req, res) => {
    const parsed = ChecklistSchema.required({ item: true }).safeParse(req.body);
    if (!parsed.success) return res.code(400).send({ error: 'Invalid body', details: parsed.error.issues });
    const { item, effort_estimate, priority, status, config_checked, migration_done, test_done } = parsed.data;
    const { rows } = await query<any>(
      'INSERT INTO comind.cm_enterprise_checklist (item, effort_estimate, priority, status, config_checked, migration_done, test_done) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
      [item, effort_estimate ?? null, priority ?? null, status ?? 'pending', config_checked ?? false, migration_done ?? false, test_done ?? false]
    );
    return rows[0];
  });

  // Update
  app.put<{ Params: { id: string } }>('/api/checklist/:id', async (req, res) => {
    const { id } = req.params;
    const parsed = ChecklistSchema.partial().safeParse(req.body);
    if (!parsed.success) return res.code(400).send({ error: 'Invalid body', details: parsed.error.issues });
    const updates = parsed.data;
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;
    for (const [k, v] of Object.entries(updates)) {
      if (v === undefined) continue;
      const column = updateColumns[k as keyof typeof updateColumns];
      fields.push(`${column} = $${idx}`);
      values.push(v);
      idx += 1;
    }
    if (fields.length === 0) return res.code(400).send({ error: 'No fields to update' });
    values.push(id);
    const sql = `UPDATE comind.cm_enterprise_checklist SET ${fields.join(', ')}, updated_at = now() WHERE item_id = $${idx} RETURNING *`;
    const { rows } = await query<any>(sql, values);
    if (!rows[0]) return res.code(404).send({ error: 'Not found' });
    return rows[0];
  });
}
