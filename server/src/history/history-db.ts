import { Pool } from 'pg';

const HISTORY_DATABASE_PURPOSE = 'chatgpt_history';
const HISTORY_ROLE = 'comind_conversation_history_reader';
let historyDatabaseSessionPrepared = false;

function requireHistoryDatabaseUrl(): string {
  if (process.env.COMIND_DATABASE_PURPOSE?.trim() !== HISTORY_DATABASE_PURPOSE) {
    throw new Error('Conversation History access requires COMIND_DATABASE_PURPOSE=chatgpt_history');
  }

  const raw = process.env.CHATGPT_HISTORY_DATABASE_URL?.trim();
  if (!raw) {
    throw new Error(
      'CHATGPT_HISTORY_DATABASE_URL is required for governed Conversation History access; DATABASE_URL is never used as a fallback'
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error('CHATGPT_HISTORY_DATABASE_URL must be a valid PostgreSQL connection URL');
  }

  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
    throw new Error('CHATGPT_HISTORY_DATABASE_URL must use the postgres or postgresql protocol');
  }
  if (!parsed.username || !parsed.hostname || parsed.pathname === '/' || parsed.pathname === '') {
    throw new Error('CHATGPT_HISTORY_DATABASE_URL must identify a database host, login, and database name');
  }

  return raw;
}

export const historyPool = new Pool({
  connectionString: requireHistoryDatabaseUrl(),
  max: 1,
  idleTimeoutMillis: 60_000,
});

export interface HistoryDatabasePreflight {
  databaseName: string;
  sessionUser: string;
  currentUser: string;
}

export function assertHistoryDatabaseSessionPrepared(): void {
  if (!historyDatabaseSessionPrepared) {
    throw new Error('Conversation History requires a successful history database preflight in this process');
  }
}

export async function prepareHistoryDatabaseSession(): Promise<HistoryDatabasePreflight> {
  historyDatabaseSessionPrepared = false;
  const client = await historyPool.connect();
  let releaseError: Error | undefined = new Error(
    'Discarding PostgreSQL connection after failed Conversation History database preflight'
  );

  try {
    const identityResult = await client.query<{
      database_name: string;
      session_user: string;
      current_user: string;
      rolcanlogin: boolean;
      rolinherit: boolean;
      rolsuper: boolean;
      rolcreatedb: boolean;
      rolcreaterole: boolean;
      rolreplication: boolean;
      rolbypassrls: boolean;
    }>(
      `SELECT current_database()::text AS database_name,
              session_user::text AS session_user,
              current_user::text AS current_user,
              r.rolcanlogin,
              r.rolinherit,
              r.rolsuper,
              r.rolcreatedb,
              r.rolcreaterole,
              r.rolreplication,
              r.rolbypassrls
       FROM pg_roles r
       WHERE r.rolname = session_user`
    );
    const identity = identityResult.rows[0];
    if (!identity) throw new Error('Conversation History database login could not be identified');
    if (identity.current_user !== identity.session_user) {
      throw new Error('Conversation History login must begin without a pre-assumed database role');
    }
    if (!identity.rolcanlogin || identity.rolinherit || identity.rolsuper || identity.rolcreatedb
      || identity.rolcreaterole || identity.rolreplication || identity.rolbypassrls) {
      throw new Error('Conversation History login has prohibited PostgreSQL role attributes');
    }

    const membershipResult = await client.query<{
      role_name: string;
      admin_option: boolean;
      inherit_option: boolean;
      set_option: boolean;
    }>(
      `SELECT granted.rolname::text AS role_name,
              membership.admin_option,
              membership.inherit_option,
              membership.set_option
       FROM pg_auth_members membership
       JOIN pg_roles granted ON granted.oid = membership.roleid
       JOIN pg_roles member ON member.oid = membership.member
       WHERE member.rolname = session_user
       ORDER BY granted.rolname`
    );
    if (membershipResult.rows.length !== 1) {
      throw new Error('Conversation History login must have exactly one direct role membership');
    }
    const membership = membershipResult.rows[0];
    if (membership.role_name !== HISTORY_ROLE
      || membership.admin_option
      || membership.inherit_option
      || !membership.set_option) {
      throw new Error(
        `Conversation History login membership must be SET-only access to ${HISTORY_ROLE}`
      );
    }

    const roleCapability = await client.query<{
      is_member: boolean;
      inherits_privileges: boolean;
      can_set_role: boolean;
    }>(
      `SELECT pg_has_role(session_user, $1, 'MEMBER') AS is_member,
              pg_has_role(session_user, $1, 'USAGE') AS inherits_privileges,
              pg_has_role(session_user, $1, 'SET') AS can_set_role`,
      [HISTORY_ROLE]
    );
    const capability = roleCapability.rows[0];
    if (!capability?.is_member || capability.inherits_privileges || !capability.can_set_role) {
      throw new Error('Conversation History login lacks the required non-inherited SET capability');
    }

    await client.query(`SET ROLE ${HISTORY_ROLE}`);

    const assumedResult = await client.query<{
      session_user: string;
      current_user: string;
      schema_usage: boolean;
      archive_select: boolean;
      archive_insert: boolean;
      receipt_select: boolean;
      receipt_insert: boolean;
      derivation_select: boolean;
      derivation_insert: boolean;
      memory_select: boolean;
    }>(
      `SELECT session_user::text AS session_user,
              current_user::text AS current_user,
              has_schema_privilege(current_user, 'comind', 'USAGE') AS schema_usage,
              has_table_privilege(current_user, 'comind.cm_archive_conversation_observation', 'SELECT') AS archive_select,
              has_table_privilege(current_user, 'comind.cm_archive_conversation_observation', 'INSERT') AS archive_insert,
              has_table_privilege(current_user, 'comind.cm_conversation_reconciliation_receipt', 'SELECT') AS receipt_select,
              has_table_privilege(current_user, 'comind.cm_conversation_reconciliation_receipt', 'INSERT') AS receipt_insert,
              has_table_privilege(current_user, 'comind.cm_conversation_derivation', 'SELECT') AS derivation_select,
              has_table_privilege(current_user, 'comind.cm_conversation_derivation', 'INSERT') AS derivation_insert,
              has_table_privilege(current_user, 'comind.cm_memory_node', 'SELECT') AS memory_select`
    );
    const assumed = assumedResult.rows[0];
    if (!assumed || assumed.session_user !== identity.session_user || assumed.current_user !== HISTORY_ROLE) {
      throw new Error(`Conversation History session did not assume ${HISTORY_ROLE}`);
    }
    if (!assumed.schema_usage || !assumed.archive_select || assumed.archive_insert
      || !assumed.receipt_select || assumed.receipt_insert
      || !assumed.derivation_select || assumed.derivation_insert
      || assumed.memory_select) {
      throw new Error('Conversation History role does not have the expected read-only privilege shape');
    }

    // Exercise actual row-level reads. Privilege metadata alone does not prove
    // that the NOBYPASSRLS reader can see forced-RLS archive evidence.
    await client.query('SELECT import_id FROM comind.cm_archive_import LIMIT 1');
    await client.query('SELECT source_conversation_id FROM comind.cm_archive_conversation_observation LIMIT 1');
    await client.query('SELECT reconciliation_id FROM comind.cm_conversation_reconciliation_receipt LIMIT 1');
    await client.query('SELECT derivation_id FROM comind.cm_conversation_derivation LIMIT 1');

    historyDatabaseSessionPrepared = true;
    releaseError = undefined;
    return {
      databaseName: identity.database_name,
      sessionUser: assumed.session_user,
      currentUser: assumed.current_user,
    };
  } finally {
    client.release(releaseError);
  }
}

export async function closeHistoryPool(): Promise<void> {
  historyDatabaseSessionPrepared = false;
  await historyPool.end();
}
