import { readFile } from 'node:fs/promises';
import { Pool } from 'pg';
import { runLifecycleCheck, type LifecycleLedger } from './lifecycle.js';
import { createLifecycleLedger } from './lifecycle-ledger.js';
import { createGoogleRunBookAuth, createGoogleRunBookReader } from './lifecycle-google.js';

const testProject = 'sbgfuanxiqepcoboxzcl';
const schedulerLogin = 'comind_runbook_scheduler_login';
const intervalMs = 15 * 60_000;

export function getRunBookSchedulerConfig(environment: NodeJS.ProcessEnv) {
  if (environment.DRB_RUNBOOK_SCHEDULER !== 'test') return null;
  const { DRB_RUNBOOK_GOOGLE_DOC_ID: volumeId, DRB_RUNBOOK_DATABASE_URL: database,
    DRB_RUNBOOK_GOOGLE_CREDENTIALS_FILE: credentialsFile } = environment;
  if (!volumeId || !/^[A-Za-z0-9_-]{1,160}$/.test(volumeId) || !database || !credentialsFile) {
    throw new Error('RunBook Test scheduler requires a fixed document, dedicated database connection and Google credential configuration');
  }
  const url = new URL(database);
  const direct = url.hostname === `db.${testProject}.supabase.co` && url.username === schedulerLogin;
  const pooled = url.hostname.endsWith('.pooler.supabase.com') && url.username === `${schedulerLogin}.${testProject}`;
  if (!['postgresql:', 'postgres:'].includes(url.protocol) || !(direct || pooled)
    || url.pathname !== '/postgres' || url.searchParams.get('sslmode') !== 'verify-full') {
    throw new Error('RunBook scheduler must use the verified TLS connection to CoMind Test');
  }
  return { volumeId, database, credentialsFile };
}

export async function runDueRunBookCheck(
  volumeId: string,
  readDueSlot: () => Promise<string>,
  ledger: LifecycleLedger,
  readDocument: Parameters<typeof runLifecycleCheck>[2],
) {
  const scheduledFor = await readDueSlot();
  return runLifecycleCheck({ volumeId, scheduledFor }, ledger, readDocument);
}

export async function startRunBookLifecycleScheduler(
  environment: NodeJS.ProcessEnv,
  onError: () => void,
) {
  const config = getRunBookSchedulerConfig(environment);
  if (!config) return null;
  const credentials = JSON.parse(await readFile(config.credentialsFile, 'utf8')) as {
    type?: string; service_account_impersonation_url?: string;
  };
  if (credentials.type !== 'external_account' || !credentials.service_account_impersonation_url) {
    throw new Error('RunBook Test scheduler requires a federated Google Viewer service account');
  }
  const pool = new Pool({ connectionString: config.database, max: 2,
    connectionTimeoutMillis: 5_000, query_timeout: 15_000 });
  try {
    const { rows } = await pool.query<{ safe: boolean }>(
      `SELECT current_user = $1 AND session_user = current_user
        AND NOT (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls)
        FROM pg_roles WHERE rolname = current_user`,
      [schedulerLogin],
    );
    if (rows[0]?.safe !== true) throw new Error('RunBook scheduler database identity rejected');
  } catch (error) {
    await pool.end();
    throw error;
  }
  const ledger = createLifecycleLedger(pool, 'scheduled');
  const readDocument = createGoogleRunBookReader(config.volumeId, createGoogleRunBookAuth(config.credentialsFile));
  let running: Promise<void> | undefined;
  const tick = () => {
    if (running) return;
    running = runDueRunBookCheck(config.volumeId, async () => {
      const { rows } = await pool.query<{ due: Date }>('SELECT public.comind_runbook_lifecycle_due_at(now()) AS due');
      if (!rows[0]?.due) throw new Error('RunBook due slot unavailable');
      return rows[0].due.toISOString();
    }, ledger, readDocument).then(() => {}, onError).finally(() => { running = undefined; });
  };
  const timer = setInterval(tick, intervalMs);
  timer.unref();
  tick();
  return async () => {
    clearInterval(timer);
    await running;
    await pool.end();
  };
}
