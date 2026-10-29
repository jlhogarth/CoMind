import { Pool } from 'pg';

const PURPOSE = 'chatgpt_history_derivation';
const DERIVER_ROLE = 'comind_conversation_history_deriver';
let prepared = false;

function requireUrl(): string {
  if (process.env.COMIND_DATABASE_PURPOSE?.trim() !== PURPOSE) {
    throw new Error(`Archive history derivation requires COMIND_DATABASE_PURPOSE=${PURPOSE}`);
  }
  const raw = process.env.CHATGPT_HISTORY_DERIVATION_DATABASE_URL?.trim();
  if (!raw) {
    throw new Error('CHATGPT_HISTORY_DERIVATION_DATABASE_URL is required; DATABASE_URL is never used as a fallback');
  }
  let parsed: URL;
  try { parsed = new URL(raw); } catch { throw new Error('CHATGPT_HISTORY_DERIVATION_DATABASE_URL must be a valid PostgreSQL URL'); }
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol) || !parsed.username || !parsed.hostname || !parsed.pathname || parsed.pathname === '/') {
    throw new Error('CHATGPT_HISTORY_DERIVATION_DATABASE_URL must identify a PostgreSQL host, login, and database');
  }
  return raw;
}

export const archiveDerivationPool = new Pool({ connectionString: requireUrl(), max: 1, idleTimeoutMillis: 60_000 });

export function assertArchiveDerivationSessionPrepared(): void {
  if (!prepared) throw new Error('Archive history derivation requires a successful database preflight in this process');
}

export async function prepareArchiveDerivationSession() {
  prepared = false;
  const client = await archiveDerivationPool.connect();
  let releaseError: Error | undefined = new Error('Discarding connection after failed archive derivation preflight');
  try {
    const identity = (await client.query<{
      database_name: string; session_user: string; current_user: string;
      rolcanlogin: boolean; rolinherit: boolean; rolsuper: boolean; rolcreatedb: boolean;
      rolcreaterole: boolean; rolreplication: boolean; rolbypassrls: boolean;
    }>(`SELECT current_database()::text AS database_name, session_user::text AS session_user,
               current_user::text AS current_user, r.rolcanlogin, r.rolinherit, r.rolsuper,
               r.rolcreatedb, r.rolcreaterole, r.rolreplication, r.rolbypassrls
        FROM pg_roles r WHERE r.rolname=session_user`)).rows[0];
    if (!identity) throw new Error('Archive derivation database login could not be identified');
    if (identity.current_user !== identity.session_user || !identity.rolcanlogin || identity.rolinherit || identity.rolsuper
      || identity.rolcreatedb || identity.rolcreaterole || identity.rolreplication || identity.rolbypassrls) {
      throw new Error('Archive derivation login has prohibited PostgreSQL role attributes');
    }

    const memberships = await client.query<{
      role_name: string; admin_option: boolean; inherit_option: boolean; set_option: boolean;
    }>(`SELECT granted.rolname::text AS role_name, m.admin_option, m.inherit_option, m.set_option
        FROM pg_auth_members m
        JOIN pg_roles granted ON granted.oid=m.roleid
        JOIN pg_roles member ON member.oid=m.member
        WHERE member.rolname=session_user
        ORDER BY granted.rolname`);
    if (memberships.rows.length !== 1) throw new Error('Archive derivation login must have exactly one direct role membership');
    const membership = memberships.rows[0];
    if (membership.role_name !== DERIVER_ROLE || membership.admin_option || membership.inherit_option || !membership.set_option) {
      throw new Error(`Archive derivation login membership must be SET-only access to ${DERIVER_ROLE}`);
    }

    await client.query(`SET ROLE ${DERIVER_ROLE}`);
    const assumed = (await client.query<{
      current_user: string;
      archive_select: boolean; archive_insert: boolean;
      baseline_select: boolean; run_select: boolean; run_insert: boolean; run_update: boolean;
      memory_select: boolean; live_derivation_insert: boolean;
    }>(`SELECT current_user::text AS current_user,
               has_table_privilege(current_user,'comind.cm_archive_conversation_observation','SELECT') AS archive_select,
               has_table_privilege(current_user,'comind.cm_archive_conversation_observation','INSERT') AS archive_insert,
               has_table_privilege(current_user,'comind.cm_conversation_history_baseline','SELECT') AS baseline_select,
               has_table_privilege(current_user,'comind.cm_archive_derivation_run','SELECT') AS run_select,
               has_table_privilege(current_user,'comind.cm_archive_derivation_run','INSERT') AS run_insert,
               has_table_privilege(current_user,'comind.cm_archive_derivation_run','UPDATE') AS run_update,
               has_table_privilege(current_user,'comind.cm_memory_node','SELECT') AS memory_select,
               has_table_privilege(current_user,'comind.cm_conversation_derivation','INSERT') AS live_derivation_insert`)).rows[0];
    if (!assumed || assumed.current_user !== DERIVER_ROLE || !assumed.archive_select || assumed.archive_insert
      || !assumed.baseline_select || !assumed.run_select || !assumed.run_insert || assumed.run_update
      || assumed.memory_select || assumed.live_derivation_insert) {
      throw new Error('Archive derivation role does not have the expected certified-source-read / archive-derived-write privilege shape');
    }

    await client.query('SELECT import_id FROM comind.cm_conversation_history_baseline LIMIT 1');
    await client.query('SELECT source_conversation_id FROM comind.cm_archive_conversation_observation LIMIT 1');
    await client.query('RESET ROLE');
    prepared = true;
    releaseError = undefined;
    return { databaseName: identity.database_name, sessionUser: identity.session_user, currentUser: assumed.current_user };
  } finally {
    client.release(releaseError);
  }
}

export async function listCertifiedArchiveConversationIds(
  importId: string,
  limit?: number,
): Promise<string[]> {
  assertArchiveDerivationSessionPrepared();
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > 100_000)) {
    throw new Error('Archive bulk derivation limit must be an integer from 1 through 100000');
  }

  const client = await archiveDerivationPool.connect();
  try {
    await client.query('BEGIN READ ONLY');
    await client.query(`SET LOCAL ROLE ${DERIVER_ROLE}`);
    const result = await client.query<{ source_conversation_id: string }>(
      `SELECT o.source_conversation_id
         FROM comind.cm_archive_conversation_observation o
         JOIN comind.cm_conversation_history_baseline b ON b.import_id=o.import_id
        WHERE o.import_id=$1::uuid
        ORDER BY o.source_conversation_id
        LIMIT $2::integer`,
      [importId, limit ?? 100_000],
    );
    await client.query('COMMIT');
    return result.rows.map((row) => row.source_conversation_id);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function computeArchiveConversationMetrics(
  archiveDerivationRunId: string,
): Promise<number> {
  assertArchiveDerivationSessionPrepared();
  const client = await archiveDerivationPool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SET LOCAL ROLE ${DERIVER_ROLE}`);
    const result = await client.query<{ inserted_count: number }>(
      `SELECT comind.cm_compute_archive_conversation_metrics($1::uuid)::integer AS inserted_count`,
      [archiveDerivationRunId],
    );
    await client.query('COMMIT');
    return Number(result.rows[0]?.inserted_count ?? 0);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function closeArchiveDerivationPool(): Promise<void> {
  prepared = false;
  await archiveDerivationPool.end();
}
