import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync } from 'node:fs';
import { performance } from 'node:perf_hooks';


process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/comind_test';
const { buildApp } = await import('../server/dist/app.js');
const id = '44444444-4444-4444-8444-444444444449';
const uid = '55555555-5555-4555-8555-555555555558';
const samples = 40;
const timings = [];
const checkpointTimings = [];
const payloadBytes = [];
const queryCounts = [];
const checkpoint = {
  execution_context_id: '11111111-1111-4111-8111-111111111111',
  checkpoint_kind: 'provenance_snapshot',
  source_ref: 'foundry-runtime:fixture',
  durable_summary: 'Pre-dispatch authority, scope, idempotency, adapter, and budget checks passed.',
  evidence_refs: [],
};
function percentile(values, p) {
  const sorted = [...values].sort((a, b) => a - b);
  return Number(sorted[Math.ceil((p / 100) * sorted.length) - 1].toFixed(3));
}
for (let i = 0; i < samples; i++) {
  let count = 0;
  const query = async (sql, params = []) => {
    count++;
    if (sql.includes('SELECT conv_id, project_id FROM comind.cm_conversation')) return { rows: [{ conv_id: id, project_id: null }] };
    if (sql.includes('FROM LATERAL (')) return { rows: [{ user_msg_id: uid, assistant_msg_id: null }] };
    if (sql.includes('AS recent')) return { rows: [{ role: 'user', content: 'fixture' }] };
    if (sql.includes('INSERT INTO comind.cm_assistant_generation')) return { rows: [{ generation_id: id, claim_token: id, user_msg_id: uid }] };
    if (sql.includes('WITH inserted AS (')) return { rows: [{ msg_id: uid, conv_id: id, role: 'assistant', content: 'fixture', created_at: '2026-10-10T00:00:00Z', meta: JSON.parse(params[3]) }] };
    throw new Error('Unexpected SQL in benchmark fixture');
  };
  const app = await buildApp({
    query, closePool: async () => {},
    conversationLock: async (_id, fn) => ({ acquired: true, value: await fn(query) }),
    assistantProvider: { name: 'fixture', async generateResponse() { return { content: 'fixture' }; } },
  });
  try {
    const started = performance.now();
    const response = await app.inject({ method: 'POST', url: '/api/conversations/' + id + '/assistant-response' });
    timings.push(performance.now() - started);
    assert.equal(response.statusCode, 201);
    assert.match(response.headers['server-timing'], /persistence;dur=/);
    assert.equal(count, 5);
    queryCounts.push(count);
    const serialized = JSON.stringify(checkpoint);
    payloadBytes.push(Buffer.byteLength(serialized, 'utf8'));
    const checkpointStart = performance.now();
    await Promise.resolve({ rows: [{ id: checkpoint.execution_context_id }] });
    checkpointTimings.push(performance.now() - checkpointStart);
  } finally { await app.close(); }
}
const result = {
  schema_version: 1, kind: 'deterministic_stub_smoke_only',
  main_base_sha: '1e47dd1c61e9f6f91bc50ba8bad8a19bee8fab4f',
  node: process.version, sample_count: samples,
  limitations: ['No PostgreSQL checkpoint write', 'No network or paid provider', 'Local event-loop and CI host variability', 'Not a production latency baseline'],
  interactive_request_ms: { p50: percentile(timings, 50), p95: percentile(timings, 95) },
  checkpoint_stub_ms: { p50: percentile(checkpointTimings, 50), p95: percentile(checkpointTimings, 95) },
  checkpoint_payload_bytes: { min: Math.min(...payloadBytes), max: Math.max(...payloadBytes) },
  query_count_per_request: { min: Math.min(...queryCounts), max: Math.max(...queryCounts) },
  warnings: ['Checkpoint persistence latency remains unmeasured until isolated PostgreSQL integration benchmark'],
};
mkdirSync('artifacts', { recursive: true });
writeFileSync('artifacts/runtime-performance-baseline.json', JSON.stringify(result) + '\n');
console.log(JSON.stringify(result));
