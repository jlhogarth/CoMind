import { Pool } from 'pg';

const PURPOSE = 'chatgpt_history_certification';
const CERTIFIER_ROLE = 'comind_conversation_history_certifier';
let prepared = false;

function requireUrl(): string {
  if (process.env.COMIND_DATABASE_PURPOSE?.trim() !== PURPOSE) {
    throw new Error(`Conversation History certification requires COMIND_DATABASE_PURPOSE=${PURPOSE}`);
  }
  const raw = process.env.CHATGPT_HISTORY_CERTIFICATION_DATABASE_URL?.trim();
  if (!raw) throw new Error('CHATGPT_HISTORY_CERTIFICATION_DATABASE_URL is required; DATABASE_URL is never used as a fallback');
  let parsed: URL;
  try { parsed = new URL(raw); } catch { throw new Error('CHATGPT_HISTORY_CERTIFICATION_DATABASE_URL must be a valid PostgreSQL URL'); }
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol) || !parsed.username || !parsed.hostname || !parsed.pathname || parsed.pathname === '/') {
    throw new Error('CHATGPT_HISTORY_CERTIFICATION_DATABASE_URL must identify a PostgreSQL host, login, and database');
  }
  return raw;
}

export const baselineCertificationPool = new Pool({ connectionString: requireUrl(), max: 1, idleTimeoutMillis: 60_000 });

export function assertBaselineCertificationSessionPrepared(): void {
  if (!prepared) throw new Error('Conversation History certification requires a successful database preflight in this process');
}

export async function prepareBaselineCertificationSession() {
  prepared = false;
  const client = await baselineCertificationPool.connect();
  let releaseError: Error | undefined = new Error('Discarding connection after failed baseline certification preflight');
  try {
    const identity = (await client.query<{
      database_name: string; session_user: string; current_user: string;
      rolcanlogin: boolean; rolinherit: boolean; rolsuper: boolean; rolcreatedb: boolean;
      rolcreaterole: boolean; rolreplication: boolean; rolbypassrls: boolean;
    }>(`SELECT current_database()::text AS database_name,session_user::text AS session_user,current_user::text AS current_user,
               r.rolcanlogin,r.rolinherit,r.rolsuper,r.rolcreatedb,r.rolcreaterole,r.rolreplication,r.rolbypassrls
        FROM pg_roles r WHERE r.rolname=session_user`)).rows[0];
    if (!identity || identity.current_user !== identity.session_user || !identity.rolcanlogin || identity.rolinherit
      || identity.rolsuper || identity.rolcreatedb || identity.rolcreaterole || identity.rolreplication || identity.rolbypassrls) {
      throw new Error('Conversation History certifier login has prohibited PostgreSQL role attributes');
    }

    const memberships = await client.query<{
      role_name: string; admin_option: boolean; inherit_option: boolean; set_option: boolean;
    }>(`SELECT granted.rolname::text AS role_name,m.admin_option,m.inherit_option,m.set_option
        FROM pg_auth_members m JOIN pg_roles granted ON granted.oid=m.roleid JOIN pg_roles member ON member.oid=m.member
        WHERE member.rolname=session_user ORDER BY granted.rolname`);
    if (memberships.rows.length !== 1) throw new Error('Conversation History certifier login must have exactly one direct role membership');
    const membership = memberships.rows[0];
    if (membership.role_name !== CERTIFIER_ROLE || membership.admin_option || membership.inherit_option || !membership.set_option) {
      throw new Error(`Conversation History certifier login membership must be SET-only access to ${CERTIFIER_ROLE}`);
    }

    await client.query(`SET ROLE ${CERTIFIER_ROLE}`);
    const assumed = (await client.query<{
      current_user: string; archive_select: boolean; archive_insert: boolean;
      baseline_select: boolean; baseline_insert: boolean; baseline_update: boolean; baseline_delete: boolean;
      memory_select: boolean; reconciliation_insert: boolean; derivation_insert: boolean;
    }>(`SELECT current_user::text AS current_user,
               has_table_privilege(current_user,'comind.cm_archive_import','SELECT') AS archive_select,
               has_table_privilege(current_user,'comind.cm_archive_import','INSERT') AS archive_insert,
               has_table_privilege(current_user,'comind.cm_conversation_history_baseline','SELECT') AS baseline_select,
               has_table_privilege(current_user,'comind.cm_conversation_history_baseline','INSERT') AS baseline_insert,
               has_table_privilege(current_user,'comind.cm_conversation_history_baseline','UPDATE') AS baseline_update,
               has_table_privilege(current_user,'comind.cm_conversation_history_baseline','DELETE') AS baseline_delete,
               has_table_privilege(current_user,'comind.cm_memory_node','SELECT') AS memory_select,
               has_table_privilege(current_user,'comind.cm_conversation_reconciliation_receipt','INSERT') AS reconciliation_insert,
               has_table_privilege(current_user,'comind.cm_conversation_derivation','INSERT') AS derivation_insert`)).rows[0];
    if (!assumed || assumed.current_user !== CERTIFIER_ROLE || !assumed.archive_select || assumed.archive_insert
      || !assumed.baseline_select || !assumed.baseline_insert || assumed.baseline_update || assumed.baseline_delete
      || assumed.memory_select || assumed.reconciliation_insert || assumed.derivation_insert) {
      throw new Error('Conversation History certifier role does not have the expected source-read / certificate-append-only privilege shape');
    }

    await client.query('SELECT import_id FROM comind.cm_archive_import LIMIT 1');
    prepared = true;
    releaseError = undefined;
    return { databaseName: identity.database_name, sessionUser: identity.session_user, currentUser: assumed.current_user };
  } finally {
    client.release(releaseError);
  }
}

export async function closeBaselineCertificationPool(): Promise<void> {
  prepared = false;
  await baselineCertificationPool.end();
}
