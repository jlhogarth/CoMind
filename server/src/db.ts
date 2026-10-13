import { Pool } from 'pg';

const ARCHIVE_DATABASE_PURPOSE = 'chatgpt_archive';
const databasePurpose = process.env.COMIND_DATABASE_PURPOSE?.trim() || 'application';
const archiveMode = databasePurpose === ARCHIVE_DATABASE_PURPOSE;
let archiveDatabaseSessionPrepared = false;

function requireArchiveDatabaseUrl(): string {
  const raw = process.env.CHATGPT_ARCHIVE_DATABASE_URL?.trim();
  if (!raw) {
    throw new Error(
      'CHATGPT_ARCHIVE_DATABASE_URL is required for governed ChatGPT archive database access; DATABASE_URL is never used as a fallback'
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error('CHATGPT_ARCHIVE_DATABASE_URL must be a valid PostgreSQL connection URL');
  }

  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
    throw new Error('CHATGPT_ARCHIVE_DATABASE_URL must use the postgres or postgresql protocol');
  }
  if (!parsed.username || !parsed.hostname || parsed.pathname === '/' || parsed.pathname === '') {
    throw new Error('CHATGPT_ARCHIVE_DATABASE_URL must identify a database host, login, and database name');
  }

  return raw;
}

let connectionString: string;
if (archiveMode) {
  connectionString = requireArchiveDatabaseUrl();
} else if (databasePurpose === 'application') {
  const { env } = await import('./env.js');
  connectionString = env.DATABASE_URL;
} else {
  throw new Error(`Unsupported COMIND_DATABASE_PURPOSE: ${databasePurpose}`);
}

export const pool = new Pool({
  connectionString,
  ...(archiveMode ? { max: 1, idleTimeoutMillis: 60_000 } : {}),
});

export interface QueryFunction {
  <T>(text: string, params?: any[]): Promise<{ rows: T[] }>;
}

export type ConversationLockResult<T> =
  | { acquired: false }
  | { acquired: true; value: T };

export type ConversationLockRunner = <T>(
  conversationId: string,
  work: (queryFn: QueryFunction) => Promise<T>
) => Promise<ConversationLockResult<T>>;

export interface ArchiveDatabasePreflight {
  databaseName: string;
  sessionUser: string;
  currentUser: string;
}

export function assertArchiveDatabaseSessionPrepared(): void {
  if (!archiveMode || !archiveDatabaseSessionPrepared) {
    throw new Error(
      'Governed ChatGPT archive ingestion requires a successful archive database preflight in this process'
    );
  }
}

export async function prepareArchiveDatabaseSession(): Promise<ArchiveDatabasePreflight> {
  if (!archiveMode) {
    throw new Error('Archive database preflight requires COMIND_DATABASE_PURPOSE=chatgpt_archive');
  }

  archiveDatabaseSessionPrepared = false;
  const client = await pool.connect();
  let releaseError: Error | undefined = new Error('Discarding PostgreSQL connection after failed archive database preflight');

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
    if (!identity) throw new Error('Archive database session role could not be identified');
    if (identity.current_user !== identity.session_user) {
      throw new Error('Archive database login must begin without a pre-assumed database role');
    }
    if (!identity.rolcanlogin || identity.rolinherit || identity.rolsuper || identity.rolcreatedb
      || identity.rolcreaterole || identity.rolreplication || identity.rolbypassrls) {
      throw new Error('Archive database login has prohibited PostgreSQL role attributes');
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
      throw new Error('Archive database login must have exactly one direct role membership');
    }
    const membership = membershipResult.rows[0];
    if (membership.role_name !== 'comind_archive_ingestor'
      || membership.admin_option
      || membership.inherit_option
      || !membership.set_option) {
      throw new Error('Archive database login membership must be SET-only access to comind_archive_ingestor');
    }

    const capabilityResult = await client.query<{
      is_member: boolean;
      inherits_privileges: boolean;
      can_set_role: boolean;
      archive_source_exists: boolean;
      archive_import_exists: boolean;
      archive_quarantine_exists: boolean;
    }>(
      `SELECT pg_has_role(session_user, 'comind_archive_ingestor', 'MEMBER') AS is_member,
              pg_has_role(session_user, 'comind_archive_ingestor', 'USAGE') AS inherits_privileges,
              pg_has_role(session_user, 'comind_archive_ingestor', 'SET') AS can_set_role,
              EXISTS (
                SELECT 1
                FROM pg_class c
                JOIN pg_namespace n ON n.oid = c.relnamespace
                WHERE n.nspname = 'comind' AND c.relname = 'cm_archive_source' AND c.relkind IN ('r', 'p')
              ) AS archive_source_exists,
              EXISTS (
                SELECT 1
                FROM pg_class c
                JOIN pg_namespace n ON n.oid = c.relnamespace
                WHERE n.nspname = 'comind' AND c.relname = 'cm_archive_import' AND c.relkind IN ('r', 'p')
              ) AS archive_import_exists,
              EXISTS (
                SELECT 1
                FROM pg_class c
                JOIN pg_namespace n ON n.oid = c.relnamespace
                WHERE n.nspname = 'comind' AND c.relname = 'cm_archive_quarantine' AND c.relkind IN ('r', 'p')
              ) AS archive_quarantine_exists`
    );
    const capability = capabilityResult.rows[0];
    if (!capability?.is_member || capability.inherits_privileges || !capability.can_set_role) {
      throw new Error('Archive database login does not have the required non-inherited SET capability');
    }
    if (!capability.archive_source_exists || !capability.archive_import_exists || !capability.archive_quarantine_exists) {
      throw new Error('Required governed archive database objects are not deployed');
    }

    await client.query('SET ROLE comind_archive_ingestor');

    const assumedResult = await client.query<{
      session_user: string;
      current_user: string;
      schema_usage: boolean;
      source_select: boolean;
      source_insert: boolean;
      source_delete: boolean;
      source_truncate: boolean;
      import_update: boolean;
    }>(
      `SELECT session_user::text AS session_user,
              current_user::text AS current_user,
              has_schema_privilege(current_user, 'comind', 'USAGE') AS schema_usage,
              has_table_privilege(current_user, 'comind.cm_archive_source', 'SELECT') AS source_select,
              has_table_privilege(current_user, 'comind.cm_archive_source', 'INSERT') AS source_insert,
              has_table_privilege(current_user, 'comind.cm_archive_source', 'DELETE') AS source_delete,
              has_table_privilege(current_user, 'comind.cm_archive_source', 'TRUNCATE') AS source_truncate,
              has_table_privilege(current_user, 'comind.cm_archive_import', 'UPDATE') AS import_update`
    );
    const assumed = assumedResult.rows[0];
    if (!assumed || assumed.session_user !== identity.session_user
      || assumed.current_user !== 'comind_archive_ingestor') {
      throw new Error('Archive database session did not assume comind_archive_ingestor');
    }
    if (!assumed.schema_usage || !assumed.source_select || !assumed.source_insert || !assumed.import_update
      || assumed.source_delete || assumed.source_truncate) {
      throw new Error('Archive database role does not have the expected constrained privilege shape');
    }

    archiveDatabaseSessionPrepared = true;
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

export async function query<T>(text: string, params?: any[]): Promise<{ rows: T[] }> {
  const client = await pool.connect();
  try {
    const res = await client.query(text, params);
    return { rows: res.rows as T[] };
  } finally {
    client.release();
  }
}

export const withConversationLock: ConversationLockRunner = async <T>(
  conversationId: string,
  work: (queryFn: QueryFunction) => Promise<T>
): Promise<ConversationLockResult<T>> => {
  const client = await pool.connect();
  let acquired = false;
  let discardConnection = false;

  const clientQuery: QueryFunction = async <Row>(text: string, params?: any[]) => {
    const result = await client.query(text, params);
    return { rows: result.rows as Row[] };
  };

  try {
    const lock = await clientQuery<{ acquired: boolean }>(
      'SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS acquired',
      [conversationId]
    );
    acquired = lock.rows[0]?.acquired === true;
    if (!acquired) {
      return { acquired: false };
    }

    return {
      acquired: true,
      value: await work(clientQuery),
    };
  } finally {
    if (acquired) {
      try {
        const unlock = await client.query<{ unlocked: boolean }>(
          'SELECT pg_advisory_unlock(hashtextextended($1, 0)) AS unlocked',
          [conversationId]
        );
        discardConnection = unlock.rows[0]?.unlocked !== true;
      } catch {
        discardConnection = true;
      }
    }

    client.release(
      discardConnection
        ? new Error('Discarding PostgreSQL connection after advisory lock release failure')
        : undefined
    );
  }
};

export async function databaseHealth(): Promise<{ ok: number; database_name: string }> {
  const { rows } = await query<{ ok: number; database_name: string }>(
    'SELECT 1::int AS ok, current_database() AS database_name'
  );
  return rows[0];
}

export async function closePool(): Promise<void> {
  archiveDatabaseSessionPrepared = false;
  await pool.end();
}
