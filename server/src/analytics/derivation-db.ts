import { Pool } from 'pg';

const DERIVATION_DATABASE_PURPOSE = 'conversation_derivation';
let derivationDatabaseSessionPrepared = false;

function requireDerivationDatabaseUrl(): string {
  if (process.env.COMIND_DATABASE_PURPOSE?.trim() !== DERIVATION_DATABASE_PURPOSE) {
    throw new Error('Conversation derivation access requires COMIND_DATABASE_PURPOSE=conversation_derivation');
  }
  const raw = process.env.CONVERSATION_DERIVATION_DATABASE_URL?.trim();
  if (!raw) {
    throw new Error(
      'CONVERSATION_DERIVATION_DATABASE_URL is required for governed derivation; DATABASE_URL is never used as a fallback'
    );
  }
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error('CONVERSATION_DERIVATION_DATABASE_URL must be a valid PostgreSQL connection URL');
  }
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
    throw new Error('CONVERSATION_DERIVATION_DATABASE_URL must use the postgres or postgresql protocol');
  }
  if (!parsed.username || !parsed.hostname || parsed.pathname === '/' || parsed.pathname === '') {
    throw new Error('CONVERSATION_DERIVATION_DATABASE_URL must identify a database host, login, and database name');
  }
  return raw;
}

export const derivationPool = new Pool({
  connectionString: requireDerivationDatabaseUrl(),
  max: 1,
  idleTimeoutMillis: 60_000,
});

export interface DerivationDatabasePreflight {
  databaseName: string;
  sessionUser: string;
  currentUser: string;
}

export function assertDerivationDatabaseSessionPrepared(): void {
  if (!derivationDatabaseSessionPrepared) {
    throw new Error('Governed conversation derivation requires a successful derivation database preflight in this process');
  }
}

export async function prepareDerivationDatabaseSession(): Promise<DerivationDatabasePreflight> {
  derivationDatabaseSessionPrepared = false;
  const client = await derivationPool.connect();
  let releaseError: Error | undefined = new Error('Discarding PostgreSQL connection after failed derivation database preflight');

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
    if (!identity) throw new Error('Derivation database session role could not be identified');
    if (identity.current_user !== identity.session_user) {
      throw new Error('Derivation database login must begin without a pre-assumed database role');
    }
    if (!identity.rolcanlogin || identity.rolinherit || identity.rolsuper || identity.rolcreatedb
      || identity.rolcreaterole || identity.rolreplication || identity.rolbypassrls) {
      throw new Error('Derivation database login has prohibited PostgreSQL role attributes');
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
      throw new Error('Derivation database login must have exactly one direct role membership');
    }
    const membership = membershipResult.rows[0];
    if (membership.role_name !== 'comind_conversation_deriver'
      || membership.admin_option
      || membership.inherit_option
      || !membership.set_option) {
      throw new Error('Derivation database login membership must be SET-only access to comind_conversation_deriver');
    }

    const capabilityResult = await client.query<{
      is_member: boolean;
      inherits_privileges: boolean;
      can_set_role: boolean;
    }>(
      `SELECT pg_has_role(session_user, 'comind_conversation_deriver', 'MEMBER') AS is_member,
              pg_has_role(session_user, 'comind_conversation_deriver', 'USAGE') AS inherits_privileges,
              pg_has_role(session_user, 'comind_conversation_deriver', 'SET') AS can_set_role`
    );
    const capability = capabilityResult.rows[0];
    if (!capability?.is_member || capability.inherits_privileges || !capability.can_set_role) {
      throw new Error('Derivation login lacks the required non-inherited SET capability');
    }

    await client.query('SET ROLE comind_conversation_deriver');

    const assumedResult = await client.query<{
      session_user: string;
      current_user: string;
      schema_usage: boolean;
      conversation_select: boolean;
      conversation_insert: boolean;
      message_select: boolean;
      message_insert: boolean;
      capture_select: boolean;
      capture_insert: boolean;
      checkpoint_select: boolean;
      checkpoint_insert: boolean;
      run_select: boolean;
      run_insert: boolean;
      run_update: boolean;
      run_delete: boolean;
      derivation_select: boolean;
      derivation_insert: boolean;
      candidate_select: boolean;
      candidate_insert: boolean;
      message_analytics_select: boolean;
      message_analytics_insert: boolean;
      message_analytics_update: boolean;
      message_analytics_delete: boolean;
      conversation_analytics_select: boolean;
      conversation_analytics_insert: boolean;
      conversation_analytics_update: boolean;
      conversation_analytics_delete: boolean;
    }>(
      `SELECT session_user::text AS session_user,
              current_user::text AS current_user,
              has_schema_privilege(current_user, 'comind', 'USAGE') AS schema_usage,
              has_table_privilege(current_user, 'comind.cm_conversation', 'SELECT') AS conversation_select,
              has_table_privilege(current_user, 'comind.cm_conversation', 'INSERT') AS conversation_insert,
              has_table_privilege(current_user, 'comind.cm_message', 'SELECT') AS message_select,
              has_table_privilege(current_user, 'comind.cm_message', 'INSERT') AS message_insert,
              has_table_privilege(current_user, 'comind.cm_conversation_capture_event', 'SELECT') AS capture_select,
              has_table_privilege(current_user, 'comind.cm_conversation_capture_event', 'INSERT') AS capture_insert,
              has_table_privilege(current_user, 'comind.cm_conversation_recovery_checkpoint', 'SELECT') AS checkpoint_select,
              has_table_privilege(current_user, 'comind.cm_conversation_recovery_checkpoint', 'INSERT') AS checkpoint_insert,
              has_table_privilege(current_user, 'comind.cm_conversation_derivation_run', 'SELECT') AS run_select,
              has_table_privilege(current_user, 'comind.cm_conversation_derivation_run', 'INSERT') AS run_insert,
              has_table_privilege(current_user, 'comind.cm_conversation_derivation_run', 'UPDATE') AS run_update,
              has_table_privilege(current_user, 'comind.cm_conversation_derivation_run', 'DELETE') AS run_delete,
              has_table_privilege(current_user, 'comind.cm_conversation_derivation', 'SELECT') AS derivation_select,
              has_table_privilege(current_user, 'comind.cm_conversation_derivation', 'INSERT') AS derivation_insert,
              has_table_privilege(current_user, 'comind.cm_conversation_promotion_candidate', 'SELECT') AS candidate_select,
              has_table_privilege(current_user, 'comind.cm_conversation_promotion_candidate', 'INSERT') AS candidate_insert,
              has_table_privilege(current_user, 'comind.cm_message_analytics', 'SELECT') AS message_analytics_select,
              has_table_privilege(current_user, 'comind.cm_message_analytics', 'INSERT') AS message_analytics_insert,
              has_table_privilege(current_user, 'comind.cm_message_analytics', 'UPDATE') AS message_analytics_update,
              has_table_privilege(current_user, 'comind.cm_message_analytics', 'DELETE') AS message_analytics_delete,
              has_table_privilege(current_user, 'comind.cm_conversation_analytics', 'SELECT') AS conversation_analytics_select,
              has_table_privilege(current_user, 'comind.cm_conversation_analytics', 'INSERT') AS conversation_analytics_insert,
              has_table_privilege(current_user, 'comind.cm_conversation_analytics', 'UPDATE') AS conversation_analytics_update,
              has_table_privilege(current_user, 'comind.cm_conversation_analytics', 'DELETE') AS conversation_analytics_delete`
    );
    const assumed = assumedResult.rows[0];
    if (!assumed || assumed.session_user !== identity.session_user || assumed.current_user !== 'comind_conversation_deriver') {
      throw new Error('Derivation database session did not assume comind_conversation_deriver');
    }
    if (!assumed.schema_usage
      || !assumed.conversation_select || assumed.conversation_insert
      || !assumed.message_select || assumed.message_insert
      || !assumed.capture_select || assumed.capture_insert
      || !assumed.checkpoint_select || assumed.checkpoint_insert
      || !assumed.run_select || !assumed.run_insert || assumed.run_update || assumed.run_delete
      || !assumed.derivation_select || !assumed.derivation_insert
      || !assumed.candidate_select || !assumed.candidate_insert
      || !assumed.message_analytics_select || !assumed.message_analytics_insert || !assumed.message_analytics_update || assumed.message_analytics_delete
      || !assumed.conversation_analytics_select || !assumed.conversation_analytics_insert || !assumed.conversation_analytics_update || assumed.conversation_analytics_delete) {
      throw new Error('Derivation database role does not have the expected constrained privilege shape');
    }

    // Exercise real row-level reads after SET ROLE; grants alone do not prove RLS access.
    await client.query('SELECT conv_id FROM comind.cm_conversation LIMIT 1');
    await client.query('SELECT msg_id FROM comind.cm_message LIMIT 1');

    derivationDatabaseSessionPrepared = true;
    releaseError = undefined;
    return { databaseName: identity.database_name, sessionUser: assumed.session_user, currentUser: assumed.current_user };
  } finally {
    client.release(releaseError);
  }
}

export async function closeDerivationPool(): Promise<void> {
  derivationDatabaseSessionPrepared = false;
  await derivationPool.end();
}
