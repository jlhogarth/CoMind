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
let orgId;
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
    `INSERT INTO comind.cm_project (org_id, title, slug, priority, created_by)
     VALUES ($1, $2, $3, 5, $4)
     RETURNING project_id`,
    [orgId, `${label} ${marker}`, `notebook-${label.toLowerCase()}-${process.pid}`, actorId]
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
     WHERE source_id=$1 AND kind=$2 AND content_sha256=$3 AND extractor_version=$4`,
    [sourceId, kind, digest(excerpt), extractorVersion]
  );
  assert.equal(existing.rows.length, 1, 'idempotent finding resolves one existing finding');
  return existing.rows[0].finding_id;
}

async function addEvidence(findingId, sourceId, rawText, excerpt) {
  const start = Array.from(rawText).indexOf(Array.from(excerpt)[0]);
  const codePoints = Array.from(rawText);
  const excerptPoints = Array.from(excerpt);
  let startCp = -1;
  for (let i = 0; i <= codePoints.length - excerptPoints.length; i += 1) {
    if (codePoints.slice(i, i + excerptPoints.length).join('') === excerpt) {
      startCp = i;
      break;
    }
  }
  assert.ok(start >= 0 && startCp >= 0);
  const result = await databaseQuery(
    `INSERT INTO comind_notebook.evidence_spans
       (finding_id, source_id, start_cp, end_cp, quoted_text, quote_sha256)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING evidence_id`,
    [findingId, sourceId, startCp, startCp + excerptPoints.length, excerpt, digest(excerpt)]
  );
  return result.rows[0].evidence_id;
}

async function reviewFinding(findingId, status, note) {
  const result = await databaseQuery(
    `INSERT INTO comind_notebook.review_events
       (finding_id, review_status, reviewer_id, reviewer_note)
     VALUES ($1, $2, $3, $4)
     RETURNING review_id`,
    [findingId, status, actorId, note]
  );
  return result.rows[0].review_id;
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
  const org = await databaseQuery(
    `INSERT INTO comind.cm_org (name, slug)
     VALUES ($1, $2) RETURNING org_id`,
    [`Notebook acceptance org ${marker}`, `notebook-acceptance-${process.pid}`]
  );
  orgId = org.rows[0].org_id;
  const actor = await databaseQuery(
    `INSERT INTO comind.cm_actor (org_id, kind, handle, display_name, meta)
     VALUES ($1, 'person', $2, $3, $4::jsonb) RETURNING actor_id`,
    [orgId, `notebook-test-${process.pid}`, syntheticReviewer, JSON.stringify({ test_only: true, marker })]
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
  if (orgId) await databaseQuery('DELETE FROM comind.cm_org WHERE org_id=$1', [orgId]);
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
    kind: 'risk',
    excerpt: rejectedExcerpt,
  });
  const repeatedFinding = await addFinding({
    sourceId,
    projectId: targetProjectId,
    messageId: approvedMessage.msg_id,
    kind: 'decision',
    excerpt: approvedExcerpt,
  });
  assert.equal(repeatedFinding, approvedFinding, 'finding extraction is idempotent by source, kind, hash, and extractor');

  await addEvidence(approvedFinding, sourceId, rawText, approvedExcerpt);
  await addEvidence(rejectedFinding, sourceId, rawText, rejectedExcerpt);
  await reviewFinding(approvedFinding, 'approved', 'Synthetic approval for canonical project memory.');
  await reviewFinding(rejectedFinding, 'rejected', 'Synthetic rejection must not create durable memory.');

  const evidence = await databaseQuery(
    `SELECT e.start_cp, e.end_cp, e.quoted_text, s.raw_text
     FROM comind_notebook.evidence_spans e
     JOIN comind_notebook.source_records s ON s.source_id=e.source_id
     WHERE e.finding_id=$1`,
    [approvedFinding]
  );
  assert.equal(evidence.rows.length, 1);
  const exact = Array.from(evidence.rows[0].raw_text).slice(evidence.rows[0].start_cp, evidence.rows[0].end_cp).join('');
  assert.equal(exact, approvedExcerpt);
  assert.equal(evidence.rows[0].quoted_text, approvedExcerpt);

  const promotion = await app.inject({
    method: 'POST',
    url: `/api/messages/${approvedMessage.msg_id}/promote-memory`,
    payload: {
      title: 'Notebook approved governance memory',
      kind: 'decision',
      subtype: 'conversation-notebook',
      priority: 8,
      weight: 1.5,
      tags: ['notebook', 'synthetic'],
    },
  });
  assert.equal(promotion.statusCode, 201);
  approvedMemoryId = promotion.json().memory_id;

  const promoted = await databaseQuery(
    `SELECT project_id, content, json_payload FROM comind.cm_memory_node WHERE memory_id=$1`,
    [approvedMemoryId]
  );
  assert.equal(promoted.rows.length, 1);
  assert.equal(promoted.rows[0].project_id, targetProjectId);
  assert.equal(promoted.rows[0].content, approvedExcerpt);
  assert.equal(promoted.rows[0].json_payload.source_message_id, approvedMessage.msg_id);

  const rejectedPromotion = await databaseQuery(
    `SELECT memory_id FROM comind.cm_memory_node
     WHERE json_payload->>'source_message_id'=$1`,
    [rejectedMessage.msg_id]
  );
  assert.equal(rejectedPromotion.rows.length, 0, 'rejected finding creates no canonical durable memory');

  const personalRaw = 'Personal synthetic note remains browser-local and never becomes project memory.';
  const personalSource = await captureSource({
    scope: 'personal',
    title: 'Personal synthetic note',
    rawText: personalRaw,
  });
  const personalFinding = await addFinding({
    sourceId: personalSource,
    kind: 'preference',
    excerpt: personalRaw,
  });
  await addEvidence(personalFinding, personalSource, personalRaw, personalRaw);
  await reviewFinding(personalFinding, 'approved_personal', 'Browser-local approval only.');
  const personalCanonical = await databaseQuery(
    `SELECT memory_id FROM comind.cm_memory_node WHERE content=$1`,
    [personalRaw]
  );
  assert.equal(personalCanonical.rows.length, 0, 'Personal approval never writes canonical project memory');

  const targetRetrievalConversation = await createConversation('Target retrieval', targetProjectId);
  const targetRetrieval = await retrieve(targetProjectId, targetRetrievalConversation, 'cobalt orchard provenance');
  assert.match(targetRetrieval.memoryContext, /cobalt orchard protocol preserves/);

  const otherRetrievalConversation = await createConversation('Other retrieval', otherProjectId);
  const otherRetrieval = await retrieve(otherProjectId, otherRetrievalConversation, 'cobalt orchard provenance');
  assert.doesNotMatch(otherRetrieval.memoryContext, /cobalt orchard protocol preserves/);

  await assert.rejects(
    databaseQuery(`UPDATE comind_notebook.review_events SET reviewer_note='mutated' WHERE finding_id=$1`, [approvedFinding]),
    /append-only/
  );
  await assert.rejects(
    databaseQuery(`UPDATE comind_notebook.evidence_spans SET quoted_text='mutated' WHERE finding_id=$1`, [approvedFinding]),
    /append-only/
  );
});
