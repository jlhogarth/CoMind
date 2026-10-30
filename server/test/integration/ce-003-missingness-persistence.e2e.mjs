import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import {
  persistMissingnessFindings,
  scanMissingness,
} from '../../dist/continuous-excellence/missingness.js';

const { Pool } = pg;
const PROJECT_ID = '00000000-0000-4000-8000-000000000001';
const TASK_ID = '00000000-0000-4000-8000-000000000003';
const NOW = '2026-10-30T10:20:00.000Z';

function evidence(key) {
  return [{ sourceSystem: 'ce-003-integration', sourceRef: `test://${key}` }];
}

test('CE-003 persists one CE signal per material finding and replay is idempotent', async () => {
  const databaseUrl = process.env.DATABASE_URL;
  assert.ok(databaseUrl, 'DATABASE_URL is required for CE-003 integration proof');
  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO comind.cm_task(task_id,project_id,created_at)
       VALUES ($1::uuid,$2::uuid,$3::timestamptz)
       ON CONFLICT (task_id) DO NOTHING`,
      [TASK_ID, PROJECT_ID, NOW],
    );

    const request = {
      projectId: PROJECT_ID,
      taskId: TASK_ID,
      objective: 'Prove CE-003 real persistence against CE-001',
      proposedAction: 'Persist a deterministic missing-authority finding',
      consequenceLevel: 'low',
      substantialWork: false,
      authority: { state: 'unknown', evidenceRefs: evidence('authority') },
      sourceSystem: 'github',
      sourceRef: 'https://github.com/jlhogarth/CoMind/issues/364',
      observedAt: NOW,
      dependencies: [{ key: 'postgres', required: true, status: 'available', evidenceRefs: evidence('postgres') }],
      reuse: {
        status: 'checked_reuse',
        capabilityRef: 'comind.record_ce_signal',
        rationale: 'CE-001 signal persistence is the accepted durable substrate.',
        evidenceRefs: evidence('reuse'),
      },
    };
    const scan = scanMissingness(request);
    assert.equal(scan.decision, 'blocked');
    assert.equal(scan.findings.length, 1);
    assert.equal(scan.findings[0].code, 'AUTHORITY_UNKNOWN');

    const query = (text, params = []) => client.query(text, params);
    const first = await persistMissingnessFindings(query, request, scan);
    const second = await persistMissingnessFindings(query, request, scan);

    assert.equal(first.persisted.length, 1);
    assert.equal(first.persisted[0].replayed, false);
    assert.equal(second.persisted.length, 1);
    assert.equal(second.persisted[0].replayed, true);
    assert.equal(first.persisted[0].signalId, second.persisted[0].signalId);

    const count = await client.query(
      `SELECT count(*)::int AS count
         FROM comind.cm_ce_signal
        WHERE project_id=$1::uuid
          AND idempotency_key=$2`,
      [PROJECT_ID, first.persisted[0].idempotencyKey],
    );
    assert.equal(count.rows[0].count, 1);

    const row = await client.query(
      `SELECT signal_type,severity,requires_action,source_system,source_ref,details
         FROM comind.cm_ce_signal
        WHERE signal_id=$1::uuid`,
      [first.persisted[0].signalId],
    );
    assert.equal(row.rows[0].signal_type, 'missingness');
    assert.equal(row.rows[0].severity, 'high');
    assert.equal(row.rows[0].requires_action, true);
    assert.equal(row.rows[0].source_system, 'continuous_excellence');
    assert.equal(row.rows[0].source_ref, request.sourceRef);
    assert.equal(row.rows[0].details.ceVersion, 'ce-003-missingness-v1');
    assert.equal(row.rows[0].details.scanFingerprint, scan.scanFingerprint);
  } finally {
    await client.query('ROLLBACK');
    client.release();
    await pool.end();
  }
});
