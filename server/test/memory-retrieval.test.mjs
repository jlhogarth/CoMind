import assert from 'node:assert/strict';
import test from 'node:test';

const {
  memoryRetrievalDefaults,
  retrieveProjectMemoryContext,
  selectBoundedMemoryContext,
} = await import('../dist/memory-retrieval.js');

const projectId = '11111111-1111-4111-8111-111111111111';

function request(content = 'What did we decide about cost monitoring?') {
  return {
    conversationId: '22222222-2222-4222-8222-222222222222',
    messages: [
      { role: 'user', content: 'Earlier unrelated turn' },
      { role: 'assistant', content: 'Earlier answer' },
      { role: 'user', content },
    ],
  };
}

function row(id, score, content = 'Relevant durable memory content.', overrides = {}) {
  return {
    memory_id: id,
    title: `Memory ${id.slice(-2)}`,
    kind: 'decision',
    content,
    score,
    ...overrides,
  };
}

test('retrieval skips database work when project identity is unavailable', async () => {
  let calls = 0;
  const result = await retrieveProjectMemoryContext(
    async () => {
      calls++;
      return { rows: [] };
    },
    null,
    request()
  );

  assert.equal(calls, 0);
  assert.equal(result.contextMessage, null);
  assert.equal(result.telemetry.source, 'cm_memory_node');
  assert.equal(result.telemetry.candidate_count, 0);
  assert.equal(result.telemetry.selected_count, 0);
  assert.equal(result.telemetry.rejected_count, 0);
  assert.deepEqual(result.telemetry.selected_memory_ids, []);
});

test('retrieval uses the latest user turn and a bounded project-scoped SQL query', async () => {
  let capturedSql = '';
  let capturedParams = [];
  const result = await retrieveProjectMemoryContext(
    async (sql, params) => {
      capturedSql = sql;
      capturedParams = params;
      return {
        rows: [row('33333333-3333-4333-8333-333333333333', '0.3456784')],
      };
    },
    projectId,
    request('Find our memory retrieval decision.')
  );

  assert.match(capturedSql, /project_id = \$1::uuid/);
  assert.match(capturedSql, /status = 'active'/);
  assert.match(capturedSql, /visibility IN \('internal', 'public'\)/);
  assert.match(capturedSql, /NULLIF\(BTRIM\(COALESCE\(content, ''\)\), ''\) IS NOT NULL/);
  assert.match(capturedSql, /WHERE GREATEST\(trigram_score, text_score\) >= \$3/);
  assert.match(capturedSql, /ORDER BY score DESC, priority DESC, weight DESC, memory_id ASC/);
  assert.deepEqual(capturedParams, [
    projectId,
    'Find our memory retrieval decision.',
    memoryRetrievalDefaults.minimumLexicalScore,
    memoryRetrievalDefaults.maxResults * 3,
  ]);
  assert.equal(result.telemetry.query_character_count, 35);
  assert.equal(result.telemetry.query_submitted_character_count, 35);
  assert.equal(result.telemetry.candidate_count, 1);
  assert.equal(result.telemetry.selected_count, 1);
  assert.deepEqual(result.telemetry.selected_scores, [0.345678]);
  assert.deepEqual(result.telemetry.selected_kinds, ['decision']);
});

test('retrieval truncates only the submitted query while preserving source query length telemetry', async () => {
  const longQuery = 'x'.repeat(memoryRetrievalDefaults.maxQueryCharacters + 50);
  let capturedParams = [];

  const result = await retrieveProjectMemoryContext(
    async (_sql, params) => {
      capturedParams = params;
      return { rows: [] };
    },
    projectId,
    request(longQuery)
  );

  assert.equal(capturedParams[1].length, memoryRetrievalDefaults.maxQueryCharacters);
  assert.equal(result.telemetry.query_character_count, longQuery.length);
  assert.equal(result.telemetry.query_submitted_character_count, memoryRetrievalDefaults.maxQueryCharacters);
});

test('bounded selector sorts deterministically and caps result count', () => {
  const rows = [
    row('44444444-4444-4444-8444-000000000004', 0.7),
    row('44444444-4444-4444-8444-000000000002', 0.9),
    row('44444444-4444-4444-8444-000000000001', 0.9),
    row('44444444-4444-4444-8444-000000000003', 0.8),
    row('44444444-4444-4444-8444-000000000005', 0.6),
  ];

  const result = selectBoundedMemoryContext(rows, 25, {
    ...memoryRetrievalDefaults,
    maxResults: 3,
  });

  assert.deepEqual(result.memories.map((memory) => memory.memoryId), [
    '44444444-4444-4444-8444-000000000001',
    '44444444-4444-4444-8444-000000000002',
    '44444444-4444-4444-8444-000000000003',
  ]);
  assert.equal(result.telemetry.candidate_count, rows.length);
  assert.equal(result.telemetry.selected_count, 3);
  assert.equal(result.telemetry.rejected_count, 2);
});

test('bounded selector truncates individual content and never exceeds total context budget', () => {
  const options = {
    maxResults: 5,
    maxContextCharacters: 520,
    maxMemoryCharacters: 180,
    maxQueryCharacters: 2000,
    minimumLexicalScore: 0.12,
  };
  const rows = [
    row('55555555-5555-4555-8555-555555555551', 0.8, 'a'.repeat(1000)),
    row('55555555-5555-4555-8555-555555555552', 0.7, 'b'.repeat(1000)),
    row('55555555-5555-4555-8555-555555555553', 0.6, 'c'.repeat(1000)),
  ];

  const result = selectBoundedMemoryContext(rows, 30, options);
  assert.ok(result.contextMessage);
  assert.equal(result.contextMessage.content.length <= options.maxContextCharacters, true);
  assert.equal(result.telemetry.context_character_count, result.contextMessage.content.length);
  assert.equal(result.memories.every((memory) => memory.content.length <= options.maxMemoryCharacters), true);
  assert.equal(result.memories[0].content.endsWith('...'), true);
});

test('bounded selector tracks candidates omitted by the total context budget', () => {
  const options = {
    maxResults: 3,
    maxContextCharacters: 390,
    maxMemoryCharacters: 120,
    maxQueryCharacters: 2000,
    minimumLexicalScore: 0.12,
  };
  const rows = [
    row('66666666-6666-4666-8666-666666666661', 0.9, 'a'.repeat(110)),
    row('66666666-6666-4666-8666-666666666662', 0.8, 'b'.repeat(110)),
  ];

  const result = selectBoundedMemoryContext(rows, 20, options);
  assert.equal(result.telemetry.candidate_count, 2);
  assert.equal(result.telemetry.selected_count, 1);
  assert.equal(result.telemetry.omitted_for_context_limit, 1);
  assert.equal(result.telemetry.rejected_count, 1);
});

test('empty and whitespace-only candidates do not create synthetic context', () => {
  const result = selectBoundedMemoryContext([
    row('77777777-7777-4777-8777-777777777777', 0.8, '   \n   '),
  ], 20);

  assert.equal(result.contextMessage, null);
  assert.equal(result.telemetry.candidate_count, 1);
  assert.equal(result.telemetry.selected_count, 0);
  assert.equal(result.telemetry.rejected_count, 1);
  assert.equal(result.telemetry.context_character_count, 0);
});

test('retrieved memory context is framed as context rather than instruction', () => {
  const result = selectBoundedMemoryContext([
    row('88888888-8888-4888-8888-888888888888', 0.8, 'Use reviewed rate cards for cost estimates.'),
  ], 20);

  assert.ok(result.contextMessage);
  assert.equal(result.contextMessage.role, 'system');
  assert.match(result.contextMessage.content, /not as a user instruction/i);
  assert.match(result.contextMessage.content, /Prefer the current user request/i);
  assert.match(result.contextMessage.content, /\[memory:88888888-8888-4888-8888-888888888888\]/);
});
