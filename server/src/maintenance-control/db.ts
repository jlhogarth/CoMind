import { Client } from 'pg';

export interface AuditQueryExecutor {
  <Row>(text: string, params?: unknown[]): Promise<{ rows: Row[] }>;
}

function requirePostgresUrl(raw: string): string {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error('MAINTENANCE_CONTROL_DATABASE_URL must be a valid PostgreSQL connection URL');
  }

  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
    throw new Error('MAINTENANCE_CONTROL_DATABASE_URL must use the postgres or postgresql protocol');
  }
  if (!parsed.username || !parsed.hostname || parsed.pathname === '/' || parsed.pathname === '') {
    throw new Error('MAINTENANCE_CONTROL_DATABASE_URL must identify a database host, login, and database name');
  }
  return raw;
}

export async function withReadOnlyMaintenanceClient<T>(
  connectionString: string,
  work: (query: AuditQueryExecutor) => Promise<T>
): Promise<T> {
  const client = new Client({
    connectionString: requirePostgresUrl(connectionString),
    application_name: 'comind_mctrl_001',
  });
  await client.connect();

  let transactionOpen = false;
  try {
    await client.query('SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY');
    await client.query('BEGIN READ ONLY');
    transactionOpen = true;
    await client.query("SET LOCAL statement_timeout = '10000ms'");
    await client.query("SET LOCAL lock_timeout = '2000ms'");

    const mode = await client.query<{ transaction_read_only: string }>('SHOW transaction_read_only');
    if (mode.rows[0]?.transaction_read_only !== 'on') {
      throw new Error('Maintenance control transaction is not read-only');
    }

    const query: AuditQueryExecutor = async <Row>(text: string, params: unknown[] = []) => {
      const result = await client.query(text, params);
      return { rows: result.rows as Row[] };
    };

    return await work(query);
  } finally {
    if (transactionOpen) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // Closing the client below discards any unusable session after rollback failure.
      }
    }
    await client.end();
  }
}
