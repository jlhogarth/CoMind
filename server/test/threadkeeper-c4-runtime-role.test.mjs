import test from 'node:test';
import assert from 'node:assert/strict';

const enabled = process.env.THREADKEEPER_C4_DB_TEST === '1';

test('TK-007 ThreadKeeper transaction assumes the constrained runtime role and does not leak it', {
  skip: !enabled,
}, async () => {
  const { query, closePool } = await import('../dist/db.js');
  const { withThreadKeeperRuntimeTransaction } = await import('../dist/threadkeeper/database.js');
  try {
    const identity = await withThreadKeeperRuntimeTransaction(async runtimeQuery => {
      const result = await runtimeQuery(`
        SELECT session_user::text AS session_user,
               current_user::text AS current_user,
               pg_has_role(session_user, 'comind_threadkeeper_runtime', 'SET') AS can_set_runtime,
               has_table_privilege(current_user, 'comind.cm_threadkeeper_checkpoint', 'SELECT') AS checkpoint_select,
               has_table_privilege(current_user, 'comind.cm_threadkeeper_checkpoint', 'INSERT') AS checkpoint_insert,
               has_table_privilege(current_user, 'comind.cm_threadkeeper_checkpoint', 'UPDATE') AS checkpoint_update,
               has_table_privilege(current_user, 'comind.cm_threadkeeper_checkpoint', 'DELETE') AS checkpoint_delete,
               has_table_privilege(current_user, 'comind.cm_archive_source', 'SELECT') AS archive_select
      `);
      return result.rows[0];
    });

    assert.equal(identity.current_user, 'comind_threadkeeper_runtime');
    assert.notEqual(identity.session_user, identity.current_user);
    assert.equal(identity.can_set_runtime, true);
    assert.equal(identity.checkpoint_select, true);
    assert.equal(identity.checkpoint_insert, true);
    assert.equal(identity.checkpoint_update, false);
    assert.equal(identity.checkpoint_delete, false);
    assert.equal(identity.archive_select, false);

    const after = await query(`SELECT session_user::text AS session_user, current_user::text AS current_user`);
    assert.equal(after.rows[0].current_user, after.rows[0].session_user);
  } finally {
    await closePool();
  }
});
