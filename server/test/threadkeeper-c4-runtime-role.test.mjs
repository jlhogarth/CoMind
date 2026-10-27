import test from 'node:test';
import assert from 'node:assert/strict';

const enabled = process.env.THREADKEEPER_C4_DB_TEST === '1';

test('TK-007 application database pool runs under the constrained ThreadKeeper runtime role', {
  skip: !enabled,
}, async () => {
  const { query, closePool } = await import('../dist/db.js');
  try {
    const identity = await query(`
      SELECT session_user::text AS session_user,
             current_user::text AS current_user,
             pg_has_role(session_user, 'comind_threadkeeper_runtime', 'SET') AS can_set_runtime,
             has_table_privilege(current_user, 'comind.cm_threadkeeper_checkpoint', 'SELECT') AS checkpoint_select,
             has_table_privilege(current_user, 'comind.cm_threadkeeper_checkpoint', 'INSERT') AS checkpoint_insert,
             has_table_privilege(current_user, 'comind.cm_threadkeeper_checkpoint', 'UPDATE') AS checkpoint_update,
             has_table_privilege(current_user, 'comind.cm_threadkeeper_checkpoint', 'DELETE') AS checkpoint_delete,
             has_table_privilege(current_user, 'comind.cm_archive_source', 'SELECT') AS archive_select
    `);
    const row = identity.rows[0];
    assert.equal(row.current_user, 'comind_threadkeeper_runtime');
    assert.notEqual(row.session_user, row.current_user);
    assert.equal(row.can_set_runtime, true);
    assert.equal(row.checkpoint_select, true);
    assert.equal(row.checkpoint_insert, true);
    assert.equal(row.checkpoint_update, false);
    assert.equal(row.checkpoint_delete, false);
    assert.equal(row.archive_select, false);
  } finally {
    await closePool();
  }
});
