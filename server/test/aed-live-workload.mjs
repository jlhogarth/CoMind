import { Pool } from 'pg';

const { DATABASE_URL, AED_TEST_SOURCE_REF, AED_PM_PROJECT_ID } = process.env;
if (!DATABASE_URL || !AED_TEST_SOURCE_REF || !AED_PM_PROJECT_ID) throw new Error('isolated workload configuration required');
const parsed = new URL(DATABASE_URL);
if (!['127.0.0.1', 'localhost'].includes(parsed.hostname) || parsed.pathname !== '/comind_ci')
  throw new Error('refusing workload outside isolated comind_ci');
const pool = new Pool({ connectionString: DATABASE_URL, max: 1 });
try {
  for (;;) {
    await pool.query(
      `INSERT INTO comind_pm.pm_events (project_id,event_type,actor,actor_type,source_system,source_ref,summary,consequential)
       VALUES ($1,'action','aed-007-workload','system','github',$2,'AED-007 workload progress',false)`,
      [AED_PM_PROJECT_ID, AED_TEST_SOURCE_REF]
    );
    process.stdout.write('progress\n');
    await new Promise((resolve) => setTimeout(resolve, 80));
  }
} finally {
  await pool.end();
}
