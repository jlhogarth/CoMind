import { Pool } from 'pg';
import { env } from './env.js';

export const pool = new Pool({ connectionString: env.DATABASE_URL });

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
  await pool.end();
}
