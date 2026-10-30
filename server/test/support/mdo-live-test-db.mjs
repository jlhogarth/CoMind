import assert from 'node:assert/strict';
import { Pool } from 'pg';

export const TEST_HOST = 'aws-0-us-east-1.pooler.supabase.com';
export const TEST_USER = 'postgres.sbgfuanxiqepcoboxzcl';
export const TEST_DATABASE = 'postgres';
export const TEST_PROJECT_REF = 'sbgfuanxiqepcoboxzcl';

function requiredText(value, name) {
  if (typeof value !== 'string' || value.trim().length === 0) throw new Error(`${name} is required`);
  return value.trim();
}

export function liveMdoTestDatabaseConfig(raw, applicationName = 'comind-mdo-003-test') {
  if (!raw) throw new Error('SUPABASE_SESSION_DATABASE_URL is required.');
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error('Supabase connection URL is invalid.');
  }
  const username = decodeURIComponent(parsed.username);
  const database = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)
      || parsed.hostname !== TEST_HOST
      || parsed.port !== '5432'
      || username !== TEST_USER
      || database !== TEST_DATABASE
      || !parsed.password) {
    throw new Error('Refusing MDO-003 connection outside the exact CoMind Supabase Test pooler target.');
  }
  return {
    host: parsed.hostname,
    port: Number(parsed.port),
    user: username,
    password: decodeURIComponent(parsed.password),
    database,
    ssl: { rejectUnauthorized: true },
    application_name: applicationName,
    connectionTimeoutMillis: 10_000,
    statement_timeout: 30_000,
    query_timeout: 35_000,
    max: 2,
  };
}

export function createMdoLiveTestDb({ connectionString, applicationName } = {}) {
  const pool = new Pool(liveMdoTestDatabaseConfig(connectionString, applicationName));

  async function query(text, params = []) {
    const result = await pool.query(text, params);
    return { rows: result.rows };
  }

  async function one(text, params = []) {
    const result = await query(text, params);
    assert.equal(result.rows.length, 1, 'Expected exactly one governed MDO-003 Test row');
    return result.rows[0];
  }

  async function verifyDatabaseIdentity() {
    const row = await one(
      `SELECT current_database()::text AS database_name,
              current_user::text AS database_user,
              current_setting('server_version_num')::integer AS server_version_num,
              current_setting('transaction_read_only')::text AS transaction_read_only`
    );
    assert.equal(row.database_name, TEST_DATABASE);
    assert.equal(row.database_user, 'postgres');
    assert.ok(Number(row.server_version_num) >= 170000, 'Expected PostgreSQL 17 or newer');
    assert.equal(row.transaction_read_only, 'off');
    return { ...row, project_ref: TEST_PROJECT_REF };
  }

  return Object.freeze({
    query,
    one,
    verifyDatabaseIdentity,
    close: () => pool.end(),
    requiredText,
  });
}
