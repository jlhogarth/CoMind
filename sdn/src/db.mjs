import pg from 'pg';

const { Pool } = pg;

export function createPool(connectionString = process.env.DATABASE_URL) {
  if (!connectionString) throw new Error('DATABASE_URL is required');
  const pool = new Pool({ connectionString, max: 10, idleTimeoutMillis: 10_000, connectionTimeoutMillis: 5_000 });
  pool.on('error', (error) => {
    console.error(JSON.stringify({
      level: 'error',
      event: 'sdn_postgres_idle_client_error',
      message: error instanceof Error ? error.message : String(error),
    }));
  });
  return pool;
}

export async function withTransaction(pool, fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
