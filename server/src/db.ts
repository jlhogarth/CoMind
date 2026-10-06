import { Pool } from 'pg';
import { env } from './env.js';

export const pool = new Pool({ connectionString: env.DATABASE_URL });

export interface QueryFunction {
  <T>(text: string, params?: any[]): Promise<{ rows: T[] }>;
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

export async function databaseHealth(): Promise<{ ok: number; database_name: string }> {
  const { rows } = await query<{ ok: number; database_name: string }>(
    'SELECT 1::int AS ok, current_database() AS database_name'
  );
  return rows[0];
}

export async function closePool(): Promise<void> {
  await pool.end();
}
