import { readFile } from 'node:fs/promises';
import { Pool } from 'pg';
import { createTestLifecycleLedger } from './lifecycle-ledger.js';
import { readLifecycleFreshness, runLifecycleCheck } from './lifecycle.js';

async function main() {
  const [command, volumeId, scheduledFor, fixture, ...extra] = process.argv.slice(2);
  if (!volumeId || !scheduledFor || extra.length
    || !(command === 'check' && fixture || command === 'status' && !fixture)) {
    throw new Error('Usage: lifecycle-cli check <volume-id> <scheduled-utc> <fixture.json> | status <volume-id> <scheduled-utc>');
  }
  const raw = process.env.DRB_TEST_ADMIN_URL;
  if (!raw) throw new Error('DRB_TEST_ADMIN_URL is required');
  const url = new URL(raw);
  if (!['postgresql:', 'postgres:'].includes(url.protocol)
    || url.hostname !== '127.0.0.1' || url.pathname !== '/drb_test' || url.search || url.hash) {
    throw new Error('Lifecycle CLI requires the disposable loopback drb_test database');
  }

  const pool = new Pool({ connectionString: raw, connectionTimeoutMillis: 5_000, query_timeout: 15_000 });
  try {
    const ledger = createTestLifecycleLedger(pool);
    const slot = { volumeId, scheduledFor };
    if (command === 'status') {
      const status = await readLifecycleFreshness(slot, ledger);
      console.log(JSON.stringify(status));
      if (status.status !== 'current') process.exitCode = 2;
    } else {
      const result = await runLifecycleCheck(slot, ledger, async () => {
        const { snapshot, plan, retention } = JSON.parse(await readFile(fixture, 'utf8'));
        return { snapshot, plan, retention };
      });
      console.log(JSON.stringify(result));
      if (result.evaluation.size === 'invalid' || result.evaluation.size === 'unavailable') process.exitCode = 2;
    }
  } finally {
    await pool.end();
  }
}

main().catch(() => {
  console.error('RunBook lifecycle command failed. Check the command arguments and disposable database availability.');
  process.exitCode = 2;
});
