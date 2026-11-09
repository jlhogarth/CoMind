import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { PGlite } = require('@electric-sql/pglite');
const db = new PGlite();
try {
  // Stand-ins for existing project objects. PostgreSQL executes the actual WEB-001 DDL and verification.
  // Scheduling and the live Supabase privileges are verified separately against the actual Test project.
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create schema comind;
    create table comind.cm_soap_case(id uuid);
    create table comind.cm_cris_mapping(id uuid);
    create schema cron;
    create table cron.job(jobname text primary key, schedule text, command text, active boolean default true);
    create function cron.schedule(p_name text,p_schedule text,p_command text) returns bigint language sql as $$
      insert into cron.job(jobname,schedule,command) values (p_name,p_schedule,p_command)
      on conflict (jobname) do update set schedule=excluded.schedule,command=excluded.command returning 1::bigint;
    $$;
  `);
  const migration = await readFile(new URL('../migrations/visitor_contributions_test.sql', import.meta.url), 'utf8');
  const verify = await readFile(new URL('../migrations/verify_visitor_contributions_test.sql', import.meta.url), 'utf8');
  await db.exec(migration);
  await db.exec(migration);
  const results = await db.exec(verify);
  assert.ok(results.some(result => result.rows.some(row => row.verification?.startsWith('PASS: '))));
  const after = await db.query('select count(*)::int as count from web001_private.contributions');
  assert.equal(after.rows[0].count, 0);
  const version = await db.query("select current_setting('server_version') as version");
  console.log('PostgreSQL ' + version.rows[0].version + ': DDL replay, access controls, consent, duplicates, research projections, withdrawal and retention passed. Synthetic rows rolled back.');
} finally {
  await db.close();
}
