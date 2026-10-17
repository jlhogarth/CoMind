import type { Pool } from 'pg';
import type { ReadQuery } from './query-service.js';

export async function verifyRunbookReader(pool: Pool): Promise<void> {
  const result = await pool.query(`
    SELECT current_user = 'comind_runbook_query_login' AND session_user = current_user
      AND NOT (r.rolsuper OR r.rolcreatedb OR r.rolcreaterole OR r.rolreplication OR r.rolbypassrls)
      AND NOT EXISTS (SELECT 1 FROM pg_auth_members WHERE member = r.oid)
      AND NOT EXISTS (
        SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND c.relkind IN ('r','p','v','m','f')
          AND (has_table_privilege(current_user,c.oid,'INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER')
            OR has_any_column_privilege(current_user,c.oid,'INSERT,UPDATE'))
      )
      AND NOT EXISTS (
        SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='comind_pm' AND c.relkind IN ('r','p')
          AND c.relname IN ('pm_projects','pm_work_items','pm_events','pm_authorizations','pm_verifications')
          AND (NOT c.relrowsecurity OR c.relowner=r.oid)
      )
      AND NOT EXISTS (
        SELECT 1 FROM pg_namespace n WHERE n.nspname !~ '^pg_' AND has_schema_privilege(current_user,n.oid,'CREATE')
      )
      AND NOT EXISTS (
        SELECT 1 FROM pg_proc f JOIN pg_namespace n ON n.oid=f.pronamespace
        WHERE n.nspname='comind_pm' AND f.prosecdef AND has_function_privilege(current_user,f.oid,'EXECUTE')
      ) AS safe
    FROM pg_roles r WHERE r.rolname=current_user`);
  if (result.rows.length !== 1 || result.rows[0].safe !== true) {
    throw new Error('RunBook database reader failed least-privilege preflight');
  }
  for (const view of ['v_runbook_lane_state', 'v_runbook_timeline', 'v_runbook_authority', 'v_runbook_verification']) {
    await pool.query(`SELECT 1 FROM comind_pm.${view} LIMIT 0`);
  }
}

export function createRunbookReadQuery(pool: Pool): ReadQuery {
  return async (sql, params) => {
    const client = await pool.connect();
    let discard = false;
    try {
      await client.query('BEGIN READ ONLY');
      await client.query("SET LOCAL statement_timeout = '3s'");
      const result = await client.query(sql, params);
      await client.query('COMMIT');
      return { rows: result.rows };
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch { discard = true; }
      throw error;
    } finally { client.release(discard); }
  };
}
