import type { Pool } from 'pg';

export type FoundryRequestRow = {
  authorization_request_id: string;
  requesting_profile_id: string | null;
  requesting_actor_id: string;
  capability_id: string;
  project_id: string | null;
  task_id: string | null;
  authority_level: string;
  environment: string;
  target_kind: string;
  target_ref: string | null;
  reason: string;
  evidence_refs: unknown;
  status: string;
  requested_at: string;
  expires_at: string | null;
};

export async function verifyFoundryReader(pool: Pool): Promise<void> {
  const result = await pool.query(`
    SELECT current_user = 'comind_foundry_query_login' AND session_user = current_user
      AND NOT (r.rolsuper OR r.rolcreatedb OR r.rolcreaterole OR r.rolreplication OR r.rolbypassrls)
      AND NOT EXISTS (SELECT 1 FROM pg_auth_members WHERE member = r.oid)
      AND NOT EXISTS (
        SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND c.relkind IN ('r','p','v','m','f')
          AND (has_table_privilege(current_user,c.oid,'INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER')
            OR has_any_column_privilege(current_user,c.oid,'INSERT,UPDATE'))
      )
      AND has_table_privilege(current_user,'comind.cm_foundry_authorization_request','SELECT')
      AND NOT has_table_privilege(current_user,'comind.cm_foundry_authorization_request','INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
      AND (SELECT relrowsecurity AND relowner <> r.oid FROM pg_class WHERE oid='comind.cm_foundry_authorization_request'::regclass)
      AND NOT EXISTS (
        SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND c.oid <> 'comind.cm_foundry_authorization_request'::regclass
          AND has_table_privilege(current_user,c.oid,'SELECT')
      )
      AND NOT EXISTS (
        SELECT 1 FROM pg_namespace n WHERE n.nspname !~ '^pg_' AND has_schema_privilege(current_user,n.oid,'CREATE')
      )
      AND NOT EXISTS (
        SELECT 1 FROM pg_proc f JOIN pg_namespace n ON n.oid=f.pronamespace
        WHERE n.nspname='comind' AND f.prosecdef AND has_function_privilege(current_user,f.oid,'EXECUTE')
      ) AS safe
    FROM pg_roles r WHERE r.rolname=current_user`);
  if (result.rows.length !== 1 || result.rows[0].safe !== true) {
    throw new Error('Foundry database reader failed least-privilege preflight');
  }
  await pool.query('SELECT authorization_request_id FROM comind.cm_foundry_authorization_request LIMIT 0');
}

export function createFoundryReadQuery(pool: Pool) {
  return async (projectId: string, limit: number): Promise<{ rows: FoundryRequestRow[]; moreAvailable: boolean }> => {
    const client = await pool.connect();
    let discard = false;
    try {
      await client.query('BEGIN READ ONLY');
      await client.query("SET LOCAL statement_timeout = '3s'");
      const result = await client.query<FoundryRequestRow>(`
        SELECT authorization_request_id, requesting_profile_id, requesting_actor_id, capability_id,
          project_id, task_id, authority_level, environment, target_kind, target_ref, reason,
          evidence_refs, status, requested_at, expires_at
        FROM comind.cm_foundry_authorization_request
        WHERE project_id = $1::uuid
        ORDER BY requested_at DESC, authorization_request_id DESC
        LIMIT $2`, [projectId, limit + 1]);
      await client.query('COMMIT');
      return { rows: result.rows.slice(0, limit), moreAvailable: result.rows.length > limit };
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch { discard = true; }
      throw error;
    } finally { client.release(discard); }
  };
}
