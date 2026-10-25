import { Pool } from 'pg';

const RECONCILIATION_DATABASE_PURPOSE = 'chatgpt_reconciliation';
let reconciliationDatabaseSessionPrepared = false;

function requireReconciliationDatabaseUrl(): string {
  if (process.env.COMIND_DATABASE_PURPOSE?.trim() !== RECONCILIATION_DATABASE_PURPOSE) {
    throw new Error('Reconciliation database access requires COMIND_DATABASE_PURPOSE=chatgpt_reconciliation');
  }
  const raw = process.env.CHATGPT_RECONCILIATION_DATABASE_URL?.trim();
  if (!raw) {
    throw new Error(
      'CHATGPT_RECONCILIATION_DATABASE_URL is required for governed ChatGPT reconciliation; DATABASE_URL is never used as a fallback'
    );
  }
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error('CHATGPT_RECONCILIATION_DATABASE_URL must be a valid PostgreSQL connection URL');
  }
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
    throw new Error('CHATGPT_RECONCILIATION_DATABASE_URL must use the postgres or postgresql protocol');
  }
  if (!parsed.username || !parsed.hostname || parsed.pathname === '/' || parsed.pathname === '') {
    throw new Error('CHATGPT_RECONCILIATION_DATABASE_URL must identify a database host, login, and database name');
  }
  return raw;
}

export const reconciliationPool = new Pool({
  connectionString: requireReconciliationDatabaseUrl(),
  max: 1,
  idleTimeoutMillis: 60_000,
});

export interface ReconciliationDatabasePreflight {
  databaseName: string;
  sessionUser: string;
  currentUser: string;
}

export function assertReconciliationDatabaseSessionPrepared(): void {
  if (!reconciliationDatabaseSessionPrepared) {
    throw new Error(
      'Governed ChatGPT reconciliation requires a successful reconciliation database preflight in this process'
    );
  }
}

export async function prepareReconciliationDatabaseSession(): Promise<ReconciliationDatabasePreflight> {
  reconciliationDatabaseSessionPrepared = false;
  const client = await reconciliationPool.connect();
  let releaseError: Error | undefined = new Error(
    'Discarding PostgreSQL connection after failed reconciliation database preflight'
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
    if (!identity) throw new Error('Reconciliation database session role could not be identified');
    if (identity.current_user !== identity.session_user) {
      throw new Error('Reconciliation database login must begin without a pre-assumed database role');
    }
    if (!identity.rolcanlogin || identity.rolinherit || identity.rolsuper || identity.rolcreatedb
      || identity.rolcreaterole || identity.rolreplication || identity.rolbypassrls) {
      throw new Error('Reconciliation database login has prohibited PostgreSQL role attributes');
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
      throw new Error('Reconciliation database login must have exactly one direct role membership');
    }
    const membership = membershipResult.rows[0];
    if (membership.role_name !== 'comind_conversation_reconciler'
      || membership.admin_option
      || membership.inherit_option
      || !membership.set_option) {
      throw new Error(
        'Reconciliation database login membership must be SET-only access to comind_conversation_reconciler'
      );
    }

    const capabilityResult = await client.query<{
      is_member: boolean;
      inherits_privileges: boolean;
      can_set_role: boolean;
    }>(
      `SELECT pg_has_role(session_user, 'comind_conversation_reconciler', 'MEMBER') AS is_member,
              pg_has_role(session_user, 'comind_conversation_reconciler', 'USAGE') AS inherits_privileges,
              pg_has_role(session_user, 'comind_conversation_reconciler', 'SET') AS can_set_role`
    );
    const capability = capabilityResult.rows[0];
    if (!capability?.is_member || capability.inherits_privileges || !capability.can_set_role) {
      throw new Error('Reconciliation login lacks the required non-inherited SET capability');
    }

    // The constrained login intentionally has no direct USAGE on comind. Do not
    // inspect schema objects before assuming the SET-only reconciliation role.
    await client.query('SET ROLE comind_conversation_reconciler');

    const assumedResult = await client.query<{
      session_user: string;
      current_user: string;
      schema_usage: boolean;
      archive_exists: boolean;
      live_exists: boolean;
      receipt_exists: boolean;
      live_select: boolean;
      live_insert: boolean;
      archive_select: boolean;
      archive_insert: boolean;
      receipt_select: boolean;
      receipt_insert: boolean;
      receipt_update: boolean;
      receipt_delete: boolean;
    }>(
      `SELECT session_user::text AS session_user,
              current_user::text AS current_user,
              has_schema_privilege(current_user, 'comind', 'USAGE') AS schema_usage,
              to_regclass('comind.cm_archive_conversation_observation') IS NOT NULL AS archive_exists,
              to_regclass('comind.cm_conversation') IS NOT NULL AS live_exists,
              to_regclass('comind.cm_conversation_reconciliation_receipt') IS NOT NULL AS receipt_exists,
              has_table_privilege(current_user, 'comind.cm_conversation', 'SELECT') AS live_select,
              has_table_privilege(current_user, 'comind.cm_conversation', 'INSERT') AS live_insert,
              has_table_privilege(current_user, 'comind.cm_archive_conversation_observation', 'SELECT') AS archive_select,
              has_table_privilege(current_user, 'comind.cm_archive_conversation_observation', 'INSERT') AS archive_insert,
              has_table_privilege(current_user, 'comind.cm_conversation_reconciliation_receipt', 'SELECT') AS receipt_select,
              has_table_privilege(current_user, 'comind.cm_conversation_reconciliation_receipt', 'INSERT') AS receipt_insert,
              has_table_privilege(current_user, 'comind.cm_conversation_reconciliation_receipt', 'UPDATE') AS receipt_update,
              has_table_privilege(current_user, 'comind.cm_conversation_reconciliation_receipt', 'DELETE') AS receipt_delete`
    );
    const assumed = assumedResult.rows[0];
    if (!assumed || assumed.session_user !== identity.session_user
      || assumed.current_user !== 'comind_conversation_reconciler') {
      throw new Error('Reconciliation database session did not assume comind_conversation_reconciler');
    }
    if (!assumed.archive_exists || !assumed.live_exists || !assumed.receipt_exists) {
      throw new Error('Required governed reconciliation database objects are not deployed');
    }
    if (!assumed.schema_usage || !assumed.live_select || assumed.live_insert
      || !assumed.archive_select || assumed.archive_insert
      || !assumed.receipt_select || !assumed.receipt_insert
      || assumed.receipt_update || assumed.receipt_delete) {
      throw new Error('Reconciliation database role does not have the expected constrained privilege shape');
    }

    // Exercise real row-level reads. Table privileges alone do not prove the
    // NOBYPASSRLS role has the required SELECT policies.
    await client.query('SELECT conv_id FROM comind.cm_conversation LIMIT 1');
    await client.query('SELECT source_conversation_id FROM comind.cm_archive_conversation_observation LIMIT 1');

    reconciliationDatabaseSessionPrepared = true;
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

export async function closeReconciliationPool(): Promise<void> {
  reconciliationDatabaseSessionPrepared = false;
  await reconciliationPool.end();
}
