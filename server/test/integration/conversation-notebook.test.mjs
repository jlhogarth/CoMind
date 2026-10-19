import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { after, before, test } from 'node:test';

process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/comind_ci';
const testDatabaseUrl = new URL(process.env.DATABASE_URL);
if (!['localhost', '127.0.0.1', '[::1]', '::1'].includes(testDatabaseUrl.hostname)
    || testDatabaseUrl.pathname !== '/comind_ci') {
  throw new Error('Conversation Notebook integration refuses any database except local PostgreSQL comind_ci');
}

const { buildApp } = await import('../../dist/app.js');
const { query: databaseQuery } = await import('../../dist/db.js');

const marker = `ConversationNotebook-${process.pid}`;
const syntheticReviewer = 'Notebook acceptance person';
const extractorVersion = 'notebook-test-rules-v1';
const providerCalls = [];
const conversationIds = [];
const projectIds = [];
let actorId;
let app;
let approvedMemoryId;
let targetProjectId;
let otherProjectId;

const assistantProvider = {
  name: 'conversation-notebook-test-provider',
  async generateResponse(request) {
    providerCalls.push(request);
    return {
      content: `Notebook retrieval ${marker}`,
      metadata: {
        provider: 'conversation-notebook-test-provider',
        model: 'deterministic-notebook-test-model',
        response_id: `notebook-${process.pid}-${providerCalls.length}`,
      },
    };
  },
};

async function createProject(label) {
  const result = await databaseQuery(
    `INSERT INTO comind.cm_project (title, slug, priority, created_by)
     VALUES ($1, $2, 5, $3)
     RETURNING project_id`,
    [`${label} ${marker}`, `notebook-${label.toLowerCase()}-${process.pid}`, actorId]
  );
  const id = result.rows[0].project_id;
  projectIds.push(id);
  return id;
}

async function createConversation(title, projectId) {
  const response = await app.inject({
    method: 'POST',
    url: '/api/conversations',
    payload: { title: `${title} ${marker}`, project_id: projectId },
  });
  assert.equal(response.statusCode, 201);
  conversationIds.push(response.json().conv_id);
  return response.json().conv_id;
}

async function appendMessage(conversationId, role, content) {
  const response = await app.inject({
    method: 'POST',
    url: `/api/conversations/${conversationId}/messages`,
    payload: { role, content },
  });
  assert.equal(response.statusCode, 201);
  return response.json();
}

function digest(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

async function captureSource({ scope, projectId = null, conversationId = null, title, rawText }) {
  const hash = digest(rawText);
  const inserted = await databaseQuery(
    `INSERT INTO comind_notebook.source_records
       (scope, project_id, source_conversation_id, captured_by, title, source_type, source_ref, raw_text, content_sha256)
     VALUES ($1, $2, $3, $4, $5, 'synthetic', $6, $7, $8)
     ON CONFLICT DO NOTHING
     RETURNING source_id`,
    [scope, projectId, conversationId, actorId, title, `synthetic://${marker}/${title}`, rawText, hash]
  );
  if (inserted.rows[0]) return inserted.rows[0].source_id;
  const existing = await databaseQuery(
    `SELECT source_id FROM comind_notebook.source_records
     WHERE scope=$1 AND project_id IS NOT DISTINCT FROM $2::uuid AND content_sha256=$3`,
    [scope, projectId, hash]
  );
  assert.equal(existing.rows.length, 1, 'idempotent source capture resolves one existing source');
  return existing.rows[0].source_id;
}

async function addFinding({ sourceId, projectId = null, messageId = null, kind, excerpt }) {
  const inserted = await databaseQuery(
    `INSERT INTO comind_notebook.findings
       (source_id, project_id, source_message_id, kind, content, content_sha256, extractor_version)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT DO NOTHING
     RETURNING finding_id`,
    [sourceId, projectId, messageId, kind, excerpt, digest(excerpt), extractorVersion]
  );
  if (inserted.rows[0]) return inserted.rows[0].finding_id;
  const existing = await databaseQuery(
    `SELECT finding_id FROM comind_notebook.findings
     WHERE source_id=$1 AND source_message_id IS NOT DISTINCT FROM $2::uuid
       AND extractor_version=$3 AND kind=$4 AND content_sha256=$5`,
    [sourceId, messageId, extractorVersion, kind, digest(excerpt)]
  );
  assert.equal(existing.rows.length, 1, 'idempotent candidate extraction resolves one existing finding');
  return existing.rows[0].finding_id;
}

async function addExactEvidence({ sourceId, findingId, rawText, excerpt, lineNumber }) {
  const sourcePoints = Array.from(rawText);
  const excerptPoints = Array.from(excerpt);
  const startChar = sourcePoints.join('').indexOf(excerptPoints.join(''));
  assert.notEqual(startChar, -1, 'candidate evidence exists verbatim in the captured source');
  const startPoint = Array.from(sourcePoints.join('').slice(0, startChar)).length;
  const endChar = startPoint + excerptPoints.length;
  await databaseQuery(
    `INSERT INTO comind_notebook.evidence_spans
       (source_id, finding_id, start_char, end_char, line_number, excerpt)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [sourceId, findingId, startPoint, endChar, lineNumber, excerpt]
  );
  const evidence = await databaseQuery(
    `SELECT e.excerpt,
            substring(s.raw_text FROM e.start_char + 1 FOR e.end_char - e.start_char) AS source_slice,
            e.line_number
     FROM comind_notebook.evidence_spans e
     JOIN comind_notebook.source_records s USING (source_id)
     WHERE e.finding_id=$1`,
    [findingId]
  );
  assert.equal(evidence.rows.length, 1);
  assert.equal(evidence.rows[0].excerpt, excerpt);
  assert.equal(evidence.rows[0].source_slice, excerpt);
  assert.equal(evidence.rows[0].line_number, lineNumber);
}

async function recordProjectApproval({ findingId, memoryId }) {
  const result = await databaseQuery(
    `WITH eligible AS (
       SELECT f.finding_id
       FROM comind_notebook.findings f
       JOIN comind.cm_memory_node m
         ON m.memory_id=$2::uuid AND m.project_id=f.project_id
       WHERE f.finding_id=$1::uuid AND f.status='candidate' AND f.project_id IS NOT NULL
     ), review AS (
       INSERT INTO comind_notebook.review_events
         (finding_id, reviewer_id, decision, destination, memory_id, note)
       SELECT finding_id, $3::uuid, 'approve', 'project_memory', $2::uuid,
              'Synthetic explicit human approval in isolated Test'
       FROM eligible
       ON CONFLICT (finding_id) DO NOTHING
       RETURNING finding_id
     )
     UPDATE comind_notebook.findings f
     SET status='approved', destination='project_memory', memory_id=$2::uuid
     FROM review r
     WHERE f.finding_id=r.finding_id
     RETURNING f.finding_id`,
    [findingId, memoryId, actorId]
  );
  assert.equal(result.rows.length, 1, 'only a candidate linked to memory in the same project can be approved');
}

async function recordPersonalApproval({ findingId }) {
  const result = await databaseQuery(
    `WITH eligible AS (
       SELECT finding_id FROM comind_notebook.findings
       WHERE finding_id=$1::uuid AND status='candidate' AND project_id IS NULL
     ), review AS (
       INSERT INTO comind_notebook.review_events
         (finding_id, reviewer_id, decision, destination, note)
       SELECT finding_id, $2::uuid, 'approve', 'personal_local',
              'Synthetic explicit human approval; retained only in the separate Personal notebook'
       FROM eligible
       ON CONFLICT (finding_id) DO NOTHING
       RETURNING finding_id
     )
     UPDATE comind_notebook.findings f
     SET status='approved', destination='personal_local'
     FROM review r
     WHERE f.finding_id=r.finding_id
     RETURNING f.finding_id`,
    [findingId, actorId]
  );
  assert.equal(result.rows.length, 1);
}

async function rejectFinding({ findingId }) {
  const result = await databaseQuery(
    `WITH eligible AS (
       SELECT finding_id FROM comind_notebook.findings
       WHERE finding_id=$1::uuid AND status='candidate'
     ), review AS (
       INSERT INTO comind_notebook.review_events
         (finding_id, reviewer_id, decision, note)
       SELECT finding_id, $2::uuid, 'reject',
              'Synthetic explicit human rejection in isolated Test'
       FROM eligible
       ON CONFLICT (finding_id) DO NOTHING
       RETURNING finding_id
     )
     UPDATE comind_notebook.findings f
     SET status='rejected'
     FROM review r
     WHERE f.finding_id=r.finding_id
     RETURNING f.finding_id`,
    [findingId, actorId]
  );
  assert.equal(result.rows.length, 1, 'only an unreviewed candidate can be rejected');
  return result.rows[0].finding_id;
}

async function retrieve(projectId, conversationId, queryText) {
  const userMessage = await appendMessage(conversationId, 'user', queryText);
  assert.ok(userMessage.msg_id);
  const response = await app.inject({
    method: 'POST',
    url: `/api/conversations/${conversationId}/assistant-response`,
  });
  assert.equal(response.statusCode, 201);
  const request = providerCalls.at(-1);
  assert.ok(request);
  const memory = await databaseQuery(
    `SELECT memory_id FROM comind.cm_memory_node WHERE project_id=$1::uuid AND memory_id=$2::uuid`,
    [projectId, approvedMemoryId]
  );
  assert.equal(memory.rows.length, projectId === targetProjectId ? 1 : 0);
  const memoryContext = request.messages
    .filter(message => message.role === 'system' && message.content.startsWith('CoMind retrieved memory context follows.'))
    .map(message => message.content)
    .join('\n');
  return { response: response.json(), memoryContext };
}

before(async () => {
  const actor = await databaseQuery(
    `INSERT INTO comind.cm_actor (kind, handle, display_name, meta)
     VALUES ('person', $1, $2, $3::jsonb) RETURNING actor_id`,
    [`notebook-test-${process.pid}`, syntheticReviewer, JSON.stringify({ test_only: true, marker })]
  );
  actorId = actor.rows[0].actor_id;
  targetProjectId = await createProject('Target');
  otherProjectId = await createProject('Other');
  app = await buildApp({ assistantProvider });
});

after(async () => {
  await databaseQuery('DROP SCHEMA IF EXISTS comind_notebook CASCADE');
  if (approvedMemoryId) {
    await databaseQuery('DELETE FROM comind.cm_memory_node WHERE memory_id=$1', [approvedMemoryId]);
  }
  for (const conversationId of conversationIds) {
    await databaseQuery('DELETE FROM comind.cm_conversation WHERE conv_id=$1', [conversationId]);
  }
  for (const projectId of projectIds) {
    await databaseQuery('DELETE FROM comind.cm_project WHERE project_id=$1', [projectId]);
  }
  if (actorId) await databaseQuery('DELETE FROM comind.cm_actor WHERE actor_id=$1', [actorId]);
  if (app) await app.close();
});

test('Notebook capture, exact evidence, explicit review, canonical project promotion, Personal separation, rejection, isolation, and retrieval', async () => {
  const projectConversation = await createConversation('Notebook source', targetProjectId);
  const approvedExcerpt = 'The cobalt orchard protocol preserves 🧭 provenance before durable retention.';
  const rejectedExcerpt = 'The rust meadow protocol skips human review before retention.';
  const rawText = `${approvedExcerpt}\n${rejectedExcerpt}`;
  const sourceId = await captureSource({
    scope: 'project',
    projectId: targetProjectId,
    conversationId: projectConversation,
    title: 'Synthetic governance discussion',
    rawText,
  });
  const repeatedSourceId = await captureSource({
    scope: 'project',
    projectId: targetProjectId,
    conversationId: projectConversation,
    title: 'Synthetic governance discussion retry',
    rawText,
  });
  assert.equal(repeatedSourceId, sourceId, 'source capture is idempotent by project and content hash');

  const otherConversation = await createConversation('Other project source', otherProjectId);
  const outOfScopeMessage = await appendMessage(otherConversation, 'user', 'An unrelated synthetic project note.');
  await assert.rejects(
    databaseQuery(
      `INSERT INTO comind_notebook.findings
         (source_id, project_id, source_message_id, kind, content, content_sha256, extractor_version)
       VALUES ($1, $2, $3, 'decision', $4, $5, $6)`,
      [sourceId, targetProjectId, outOfScopeMessage.msg_id, approvedExcerpt, digest(approvedExcerpt), extractorVersion]
    ),
    /outside the canonical project/
  );

  const approvedMessage = await appendMessage(projectConversation, 'user', approvedExcerpt);
  const rejectedMessage = await appendMessage(projectConversation, 'assistant', rejectedExcerpt);
  const approvedFinding = await addFinding({
    sourceId,
    projectId: targetProjectId,
    messageId: approvedMessage.msg_id,
    kind: 'decision',
    excerpt: approvedExcerpt,
  });
  const rejectedFinding = await addFinding({
    sourceId,
    projectId: targetProjectId,
    messageId: rejectedMessage.msg_id,
    kind: 'decision',
    excerpt: rejectedExcerpt,
  });
  assert.equal(await addFinding({
    sourceId,
    projectId: targetProjectId,
    messageId: approvedMessage.msg_id,
    kind: 'decision',
    excerpt: approvedExcerpt,
  }), approvedFinding, 'candidate extraction is idempotent');
  await addExactEvidence({ sourceId, findingId: approvedFinding, rawText, excerpt: approvedExcerpt, lineNumber: 1 });
  await addExactEvidence({ sourceId, findingId: rejectedFinding, rawText, excerpt: rejectedExcerpt, lineNumber: 2 });

  const beforePromotion = await databaseQuery(
    'SELECT status, destination, memory_id FROM comind_notebook.findings WHERE finding_id=$1',
    [approvedFinding]
  );
  assert.deepEqual(beforePromotion.rows[0], { status: 'candidate', destination: null, memory_id: null });

  const promote = await app.inject({
    method: 'POST',
    url: `/api/messages/${approvedMessage.msg_id}/promote-memory`,
    payload: {
      title: 'Cobalt orchard provenance protocol',
      kind: 'decision',
      subtype: 'governance',
      priority: 8,
      visibility: 'internal',
    },
  });
  assert.equal(promote.statusCode, 201);
  assert.equal(promote.json().created, true);
  const memory = promote.json().memory;
  approvedMemoryId = memory.memory_id;
  assert.equal(memory.project_id, targetProjectId);
  assert.equal(memory.content, approvedExcerpt);
  assert.deepEqual(memory.json_payload, {
    promotion_method: 'conversation_message_explicit_v1',
    source_conversation_id: projectConversation,
    source_message_id: approvedMessage.msg_id,
    source_role: 'user',
    source_created_at: approvedMessage.created_at,
  });
  await recordProjectApproval({ findingId: approvedFinding, memoryId: approvedMemoryId });

  const retryPromotion = await app.inject({
    method: 'POST',
    url: `/api/messages/${approvedMessage.msg_id}/promote-memory`,
    payload: { title: 'Ignored duplicate', kind: 'note', priority: 2 },
  });
  assert.equal(retryPromotion.statusCode, 200);
  assert.equal(retryPromotion.json().created, false);
  assert.equal(retryPromotion.json().memory.memory_id, approvedMemoryId);
  const linked = await databaseQuery(
    `SELECT f.status, f.destination, f.memory_id, e.decision, e.reviewer_id,
            m.project_id AS memory_project_id
     FROM comind_notebook.findings f
     JOIN comind_notebook.review_events e USING (finding_id)
     JOIN comind.cm_memory_node m ON m.memory_id=f.memory_id
     WHERE f.finding_id=$1`,
    [approvedFinding]
  );
  assert.equal(linked.rows.length, 1);
  assert.equal(linked.rows[0].status, 'approved');
  assert.equal(linked.rows[0].destination, 'project_memory');
  assert.equal(linked.rows[0].memory_id, approvedMemoryId);
  assert.equal(linked.rows[0].memory_project_id, targetProjectId);
  assert.equal(linked.rows[0].decision, 'approve');
  assert.equal(linked.rows[0].reviewer_id, actorId);

  const reject = await rejectFinding({ findingId: rejectedFinding });
  assert.equal(reject, rejectedFinding);
  const rejected = await databaseQuery(
    `SELECT f.status, f.destination, f.memory_id, e.decision
     FROM comind_notebook.findings f
     JOIN comind_notebook.review_events e USING (finding_id)
     WHERE f.finding_id=$1`,
    [rejectedFinding]
  );
  assert.deepEqual(rejected.rows[0], {
    status: 'rejected',
    destination: null,
    memory_id: null,
    decision: 'reject',
  });
  const rejectedMemory = await databaseQuery(
    `SELECT memory_id FROM comind.cm_memory_node
     WHERE project_id=$1 AND json_payload->>'source_message_id'=$2`,
    [targetProjectId, rejectedMessage.msg_id]
  );
  assert.equal(rejectedMemory.rows.length, 0, 'rejected candidate never becomes canonical memory');

  const rejectedRetrieval = await retrieve(
    targetProjectId,
    projectConversation,
    'What does the rust meadow protocol say about skipping review?'
  );
  assert.equal(rejectedRetrieval.memoryContext, '', 'rejected source text is not present in canonical memory context');
  assert.deepEqual(rejectedRetrieval.response.meta.memory_retrieval.selected_memory_ids, []);

  const reviewMutation = databaseQuery(
    `UPDATE comind_notebook.review_events SET note='rewritten' WHERE finding_id=$1`,
    [rejectedFinding]
  );
  await assert.rejects(reviewMutation, /append-only/);

  const personalExcerpt = 'I prefer quiet mornings for focused work.';
  const personalSourceId = await captureSource({
    scope: 'personal',
    title: 'Synthetic personal continuity',
    rawText: personalExcerpt,
  });
  const personalFinding = await addFinding({
    sourceId: personalSourceId,
    kind: 'preference',
    excerpt: personalExcerpt,
  });
  await addExactEvidence({
    sourceId: personalSourceId,
    findingId: personalFinding,
    rawText: personalExcerpt,
    excerpt: personalExcerpt,
    lineNumber: 1,
  });
  const memoriesBeforePersonalApproval = await databaseQuery('SELECT count(*)::int AS count FROM comind.cm_memory_node');
  await recordPersonalApproval({ findingId: personalFinding });
  const personalRead = await databaseQuery(
    `SELECT f.content, f.status, f.destination, f.project_id, f.memory_id, e.decision
     FROM comind_notebook.findings f
     JOIN comind_notebook.review_events e USING (finding_id)
     WHERE f.finding_id=$1 AND f.destination='personal_local'`,
    [personalFinding]
  );
  assert.deepEqual(personalRead.rows[0], {
    content: personalExcerpt,
    status: 'approved',
    destination: 'personal_local',
    project_id: null,
    memory_id: null,
    decision: 'approve',
  });
  const memoriesAfterPersonalApproval = await databaseQuery('SELECT count(*)::int AS count FROM comind.cm_memory_node');
  assert.equal(memoriesAfterPersonalApproval.rows[0].count, memoriesBeforePersonalApproval.rows[0].count,
    'Personal approval does not write a CoMind project memory');

  const targetRetrieval = await retrieve(
    targetProjectId,
    projectConversation,
    'What does the cobalt orchard protocol say about provenance?'
  );
  assert.match(targetRetrieval.memoryContext, /cobalt orchard protocol preserves/);
  assert.equal(targetRetrieval.response.meta.memory_retrieval.selected_memory_ids.includes(approvedMemoryId), true);

  const otherRetrieval = await retrieve(
    otherProjectId,
    otherConversation,
    'What does the cobalt orchard protocol say about provenance?'
  );
  assert.doesNotMatch(otherRetrieval.memoryContext, /cobalt orchard protocol preserves/);
  assert.equal(otherRetrieval.response.meta.memory_retrieval.selected_memory_ids.includes(approvedMemoryId), false);

  const archive = await app.inject({
    method: 'POST',
    url: `/api/projects/${targetProjectId}/memories/${approvedMemoryId}/archive`,
  });
  assert.equal(archive.statusCode, 200);
  assert.equal(archive.json().status, 'archived');
  const archivedRetrieval = await retrieve(
    targetProjectId,
    projectConversation,
    'What does the cobalt orchard protocol say about provenance?'
  );
  assert.doesNotMatch(archivedRetrieval.memoryContext, /cobalt orchard protocol preserves/);
  assert.equal(archivedRetrieval.response.meta.memory_retrieval.selected_memory_ids.includes(approvedMemoryId), false);

  const restore = await app.inject({
    method: 'POST',
    url: `/api/projects/${targetProjectId}/memories/${approvedMemoryId}/restore`,
  });
  assert.equal(restore.statusCode, 200);
  assert.equal(restore.json().status, 'active');
  const restoredRetrieval = await retrieve(
    targetProjectId,
    projectConversation,
    'What does the cobalt orchard protocol say about provenance?'
  );
  assert.match(restoredRetrieval.memoryContext, /cobalt orchard protocol preserves/);
  assert.equal(restoredRetrieval.response.meta.memory_retrieval.selected_memory_ids.includes(approvedMemoryId), true);

  const finalCounts = await databaseQuery(
    `SELECT
       (SELECT count(*)::int FROM comind_notebook.findings WHERE status='candidate') AS candidates,
       (SELECT count(*)::int FROM comind_notebook.findings WHERE status='approved') AS approved,
       (SELECT count(*)::int FROM comind_notebook.findings WHERE status='rejected') AS rejected,
       (SELECT count(*)::int FROM comind_notebook.review_events) AS reviews,
       (SELECT count(*)::int FROM comind.cm_memory_node
        WHERE project_id=$1 AND json_payload->>'source_message_id'=$2) AS canonical_rows`,
    [targetProjectId, approvedMessage.msg_id]
  );
  assert.deepEqual(finalCounts.rows[0], {
    candidates: 0,
    approved: 2,
    rejected: 1,
    reviews: 3,
    canonical_rows: 1,
  });
});
