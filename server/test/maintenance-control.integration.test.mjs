import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from 'pg';
import { withReadOnlyMaintenanceClient } from '../dist/maintenance-control/db.js';

const connectionString = process.env.MCTRL_TEST_DATABASE_URL;

test('maintenance client proves transaction read-only and rejects writes', {
  skip: !connectionString,
}, async () => {
  const admin = new Client({ connectionString });
  await admin.connect();
  try {
    await admin.query('DROP TABLE IF EXISTS public.mctrl_read_only_probe');
    await admin.query('CREATE TABLE public.mctrl_read_only_probe (id integer PRIMARY KEY)');

    await withReadOnlyMaintenanceClient(connectionString, async (query) => {
      const mode = await query('SHOW transaction_read_only');
      assert.equal(mode.rows[0].transaction_read_only, 'on');

      const readable = await query('SELECT count(*)::int AS count FROM public.mctrl_read_only_probe');
      assert.equal(readable.rows[0].count, 0);

      await assert.rejects(
        query('INSERT INTO public.mctrl_read_only_probe (id) VALUES (1)'),
        (error) => error && error.code === '25006'
      );
    });

    const after = await admin.query('SELECT count(*)::int AS count FROM public.mctrl_read_only_probe');
    assert.equal(after.rows[0].count, 0);
  } finally {
    await admin.query('DROP TABLE IF EXISTS public.mctrl_read_only_probe');
    await admin.end();
  }
});
