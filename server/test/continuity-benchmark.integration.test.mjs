import test from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const enabled = process.env.ACP_ISOLATED_DB_TEST === '1';

function percentile(values, p) {
  const sorted = [...values].sort((a, b) => a - b);
  return Number(sorted[Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)].toFixed(3));
}

function state(conversationId, executionId) {
  return {
    conversationId, workflowId: 'acp.benchmark', executionId, parentCheckpointId: null,
    executionCursor: 'benchmark',
    authority: { subjectId: 'benchmark', capabilityIds: [], policyVersion: 'benchmark-v1' },
    context: { objective: 'Measure isolated ACP overhead', decisions: [], references: [] },
    provenance: { sourceRefs: ['benchmark'], evidenceRefs: [] }, pending: [],
  };
}

test('isolated PostgreSQL baseline records checkpoint write and scheduler enqueue overhead', { skip: !enabled }, async () => {
  const { query: databaseQuery, closePool } = await import('../dist/db.js');
  const { createCheckpoint } = await import('../dist/continuity/checkpoint.js');
  const { saveCheckpoint } = await import('../dist/continuity/repository.js');
  const { createCheckpointScheduler } = await import('../dist/continuity/scheduler.js');
  try {
    const samples = 40;
    const conversationId = 'acp-benchmark-' + process.pid;
    const writeMs = [];
    const queryCounts = [];
    const payloadBytes = [];
    const baseTime = Date.now();

    for (let index = 0; index < samples; index++) {
      let count = 0;
      const countedQuery = async (sql, params) => {
        count++;
        return databaseQuery(sql, params);
      };
      const candidate = state(conversationId, 'exec-' + index);
      const createdAt = new Date(baseTime + index).toISOString();
      payloadBytes.push(Buffer.byteLength(JSON.stringify(createCheckpoint(candidate, createdAt)), 'utf8'));
      const started = performance.now();
      await saveCheckpoint(countedQuery, candidate, createdAt);
      writeMs.push(performance.now() - started);
      queryCounts.push(count);
    }

    const enqueueSamples = 1000;
    const enqueueMs = [];
    let sequence = 0;
    const mockQuery = async (sql) => {
      if (sql.startsWith('SELECT checkpoint_id::text')) return { rows: [] };
      if (sql.startsWith('INSERT INTO comind.cm_continuity_checkpoint')) {
        sequence++;
        return { rows: [{ checkpoint_id: `11111111-1111-4111-8111-${String(sequence).padStart(12, '0')}` }] };
      }
      throw new Error('Unexpected benchmark SQL');
    };
    const scheduler = createCheckpointScheduler(mockQuery, { enabled: true, capacity: enqueueSamples });
    for (let index = 0; index < enqueueSamples; index++) {
      const started = performance.now();
      assert.equal(scheduler.schedule(state('enqueue-' + index, 'exec-' + index)), true);
      enqueueMs.push(performance.now() - started);
    }
    await scheduler.drain();

    assert.ok(Math.max(...queryCounts) <= 2, 'new checkpoint writes must remain bounded to parent lookup plus insert');
    assert.ok(Math.max(...payloadBytes) <= 65536, 'checkpoint payload must remain within 64 KiB');

    const evidence = {
      schema_version: 1,
      kind: 'isolated_postgresql_acp_baseline',
      head_sha: process.env.ACP_HEAD_SHA ?? null,
      base_sha: process.env.ACP_BASE_SHA ?? null,
      node: process.version,
      sample_count: samples,
      postgres_checkpoint_write_ms: {
        p50: percentile(writeMs, 50), p95: percentile(writeMs, 95), p99: percentile(writeMs, 99),
      },
      scheduler_enqueue_ms: {
        samples: enqueueSamples,
        p50: percentile(enqueueMs, 50), p95: percentile(enqueueMs, 95), p99: percentile(enqueueMs, 99),
      },
      checkpoint_payload_bytes: { min: Math.min(...payloadBytes), max: Math.max(...payloadBytes) },
      database_queries_per_new_checkpoint: { min: Math.min(...queryCounts), max: Math.max(...queryCounts) },
      synchronous_runtime_contract: 'assistant response schedules the checkpoint; PostgreSQL persistence runs asynchronously',
      limitations: [
        'Disposable isolated PostgreSQL on the CI host',
        'No production network path',
        'No paid provider call',
        'Not a production latency or control-effectiveness claim',
      ],
    };
    const artifacts = path.resolve(process.cwd(), '..', 'artifacts');
    await mkdir(artifacts, { recursive: true });
    await writeFile(path.join(artifacts, 'acp-continuity-baseline.json'), JSON.stringify(evidence) + '\n');
    test.diagnostic?.(JSON.stringify(evidence));
  } finally {
    await closePool();
  }
});
