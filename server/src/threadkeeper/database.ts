import { pool, type QueryFunction } from '../db.js';

const THREADKEEPER_RUNTIME_ROLE = 'comind_threadkeeper_runtime';

export interface ThreadKeeperRuntimeTransactionOptions {
  serializable?: boolean;
  advisoryLockKey?: string;
}

export interface ThreadKeeperRuntimeIdentity {
  sessionUser: string;
  currentUser: string;
}

function boundedLockKey(value: string): void {
  if (!value || value.length > 4096 || value.trim() !== value) {
    throw new Error('Invalid ThreadKeeper transaction lock key');
  }
}

async function assumeThreadKeeperRuntimeRole(query: QueryFunction): Promise<ThreadKeeperRuntimeIdentity> {
  const capability = await query<{
    session_user: string;
    can_set_role: boolean;
  }>(
    `SELECT session_user::text AS session_user,
            pg_has_role(session_user, '${THREADKEEPER_RUNTIME_ROLE}', 'SET') AS can_set_role`
  );
  const session = capability.rows[0];
  if (!session?.can_set_role) {
    throw new Error('Database session cannot SET ROLE comind_threadkeeper_runtime');
  }

  await query(`SET LOCAL ROLE ${THREADKEEPER_RUNTIME_ROLE}`);

  const assumed = await query<{
    session_user: string;
    current_user: string;
    schema_usage: boolean;
    checkpoint_select: boolean;
    checkpoint_insert: boolean;
    checkpoint_update: boolean;
    checkpoint_delete: boolean;
    operation_select: boolean;
    operation_insert: boolean;
    operation_update: boolean;
    operation_delete: boolean;
    archive_select: boolean;
  }>(
    `SELECT session_user::text AS session_user,
            current_user::text AS current_user,
            has_schema_privilege(current_user, 'comind', 'USAGE') AS schema_usage,
            has_table_privilege(current_user, 'comind.cm_threadkeeper_checkpoint', 'SELECT') AS checkpoint_select,
            has_table_privilege(current_user, 'comind.cm_threadkeeper_checkpoint', 'INSERT') AS checkpoint_insert,
            has_table_privilege(current_user, 'comind.cm_threadkeeper_checkpoint', 'UPDATE') AS checkpoint_update,
            has_table_privilege(current_user, 'comind.cm_threadkeeper_checkpoint', 'DELETE') AS checkpoint_delete,
            has_table_privilege(current_user, 'comind.cm_threadkeeper_operation_event', 'SELECT') AS operation_select,
            has_table_privilege(current_user, 'comind.cm_threadkeeper_operation_event', 'INSERT') AS operation_insert,
            has_table_privilege(current_user, 'comind.cm_threadkeeper_operation_event', 'UPDATE') AS operation_update,
            has_table_privilege(current_user, 'comind.cm_threadkeeper_operation_event', 'DELETE') AS operation_delete,
            CASE
              WHEN to_regclass('comind.cm_archive_source') IS NULL THEN false
              ELSE has_table_privilege(current_user, 'comind.cm_archive_source', 'SELECT')
            END AS archive_select`
  );
  const identity = assumed.rows[0];
  if (!identity || identity.current_user !== THREADKEEPER_RUNTIME_ROLE) {
    throw new Error('ThreadKeeper database transaction did not assume the constrained runtime role');
  }
  if (!identity.schema_usage
      || !identity.checkpoint_select || !identity.checkpoint_insert
      || !identity.operation_select || !identity.operation_insert
      || identity.checkpoint_update || identity.checkpoint_delete
      || identity.operation_update || identity.operation_delete
      || identity.archive_select) {
    throw new Error('ThreadKeeper runtime role has an unexpected privilege shape');
  }

  return {
    sessionUser: identity.session_user,
    currentUser: identity.current_user,
  };
}

export async function withThreadKeeperRuntimeTransaction<T>(
  work: (query: QueryFunction, identity: ThreadKeeperRuntimeIdentity) => Promise<T>,
  options: ThreadKeeperRuntimeTransactionOptions = {},
): Promise<T> {
  if (options.advisoryLockKey !== undefined) boundedLockKey(options.advisoryLockKey);

  const client = await pool.connect();
  let discardConnection = false;
  const query: QueryFunction = async <Row>(text: string, params?: any[]) => {
    const result = await client.query(text, params);
    return { rows: result.rows as Row[] };
  };

  try {
    await client.query('BEGIN');
    if (options.serializable) {
      await client.query('SET TRANSACTION ISOLATION LEVEL SERIALIZABLE');
    }

    const identity = await assumeThreadKeeperRuntimeRole(query);

    if (options.advisoryLockKey !== undefined) {
      await query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [options.advisoryLockKey]);
    }

    const result = await work(query, identity);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      discardConnection = true;
    }
    throw error;
  } finally {
    client.release(
      discardConnection
        ? new Error('Discarding PostgreSQL connection after ThreadKeeper runtime transaction failure')
        : undefined
    );
  }
}

export async function threadKeeperRuntimeQuery<T>(
  text: string,
  params?: any[],
): Promise<{ rows: T[] }> {
  return withThreadKeeperRuntimeTransaction(query => query<T>(text, params));
}
