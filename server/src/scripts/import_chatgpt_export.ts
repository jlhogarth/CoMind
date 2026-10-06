/**
 * Node script to import a ChatGPT export JSON (conversations.json)
 * Usage: ts-node src/scripts/import_chatgpt_export.ts /path/to/conversations.json
 */
import { readFileSync } from 'fs';
import { query } from '../db.js';

async function main() {
  const path = process.argv[2];
  if (!path) { console.error('Provide path to conversations.json'); process.exit(1); }
  const raw = readFileSync(path, 'utf8');
  const data = JSON.parse(raw);

  const { rows: proj } = await query<{ project_id: string }>("SELECT project_id FROM comind.cm_project WHERE slug='comind' LIMIT 1");
  const projectId = proj[0]?.project_id ?? null;

  for (const cv of data.conversations ?? []) {
    const title = cv.title ?? 'Untitled';
    const { rows: convRows } = await query<{ conv_id: string }>(
      "INSERT INTO comind.cm_conversation (project_id, source, title, metadata) VALUES ($1,'chatgpt_export',$2,$3) RETURNING conv_id",
      [projectId, title, cv]
    );
    const convId = convRows[0].conv_id;
    for (const m of (cv.messages ?? [])) {
      const role = (m.author?.role ?? 'user');
      const parts = m.content?.parts ?? [];
      const content = parts.join('\n\n');
      const ts = m.create_time ? Math.floor(m.create_time) : Math.floor(Date.now()/1000);
      await query("INSERT INTO comind.cm_message (conv_id, role, content, created_at, meta) VALUES ($1,$2,$3, to_timestamp($4), $5)",
        [convId, role, content, ts, { export_id: m.id, content_type: m.content?.content_type }]
      );
    }
  }
  console.log('Import complete');
}

main().catch(e => { console.error(e); process.exit(1); });
