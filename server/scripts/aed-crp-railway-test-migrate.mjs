import { readFile } from 'node:fs/promises';
import { Pool } from 'pg';
import { AED_CRP_TEST_RAILWAY_PROJECT, AED_CRP_TEST_RAILWAY_ENVIRONMENT,
  parseHostedTestConfig } from '../dist/return-protocol/hosted-test-host.js';

const config = parseHostedTestConfig(process.env);
if (process.env.RAILWAY_PROJECT_ID !== AED_CRP_TEST_RAILWAY_PROJECT ||
    process.env.RAILWAY_ENVIRONMENT_ID !== AED_CRP_TEST_RAILWAY_ENVIRONMENT) {
  throw new Error('wrong_test_environment');
}
const pool = new Pool({ connectionString: config.databaseUrl, max: 1,
  connectionTimeoutMillis: 3000, query_timeout: 10000 });
try {
  const database = await pool.query('SELECT current_database() AS name');
  if (database.rows[0]?.name !== 'railway') throw new Error('unexpected_database');
  await pool.query('CREATE SCHEMA IF NOT EXISTS comind');
  const migration = await readFile(new URL('../../db/migrations/20261122_001_aed_crp_outbox.sql',
    import.meta.url), 'utf8');
  await pool.query(migration);
  const result = await pool.query(
    "SELECT to_regclass('comind.cm_aed_crp_origin') AS origin, " +
    "to_regclass('comind.cm_aed_crp_return') AS returns, " +
    "to_regclass('comind.cm_aed_crp_event') AS events");
  if (Object.values(result.rows[0]).some(value => !value)) throw new Error('migration_readback_failed');
  const prerequisites = await readFile(new URL('../../db/test/aed_crp_railway_canonical_lease_prerequisites.sql',
    import.meta.url), 'utf8');
  await pool.query(prerequisites);
  for (const name of [
    '20261009_009_foundry_work_lease_kernel.sql',
    '20261101_007_cbe_004_exact_return_lease.sql',
  ]) {
    await pool.query(await readFile(new URL(`../../db/migrations/${name}`, import.meta.url), 'utf8'));
  }
  const authority = await pool.query(
    "SELECT to_regclass('comind.cm_foundry_work_lease') AS lease, " +
    "to_regclass('comind.cm_foundry_work_lease_event') AS events, " +
    "to_regprocedure('comind.cm_cbe_claim_return_work(uuid,text,integer)') AS exact_claim");
  if (Object.values(authority.rows[0]).some(value => !value)) {
    throw new Error('canonical_test_lease_readback_failed');
  }
  process.stdout.write('AED-CRP isolated Test migration verified\n');
} finally {
  await pool.end();
}
