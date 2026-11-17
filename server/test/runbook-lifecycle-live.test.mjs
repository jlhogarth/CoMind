import test from 'node:test';
import assert from 'node:assert/strict';
import { createGoogleRunBookReader } from '../dist/runbook/lifecycle-google.js';
import { evaluateLifecycle } from '../dist/runbook/lifecycle.js';
import { getRunBookSchedulerConfig, runDueRunBookCheck, verifyCloudRunViewerIdentity } from '../dist/runbook/lifecycle-scheduler.js';

const due = '2026-11-09T14:00:00.000Z';
const volumeId = 'synthetic-runbook';
const tab = (tabId, endIndex, childTabs) => ({
  tabProperties: { tabId }, documentTab: { body: { content: [{ endIndex }] } }, childTabs,
});

test('Google Viewer reads nested structural fields and permits measurement without revision', async () => {
  const read = createGoogleRunBookReader(volumeId, async () => 'test-viewer-token', async (url, options) => {
    assert.equal(url.origin, 'https://docs.googleapis.com');
    assert.equal(url.pathname, '/v1/documents/synthetic-runbook');
    assert.equal(url.searchParams.get('includeTabsContent'), 'true');
    assert.match(url.searchParams.get('fields'), /childTabs.*endIndex/);
    const fields = url.searchParams.get('fields');
    assert.equal(fields.split('(').length, fields.split(')').length);
    assert.doesNotMatch(fields, /textRun/);
    assert.equal(options.redirect, 'error');
    assert.equal(options.headers.Authorization, 'Bearer test-viewer-token');
    return Response.json({ documentId: volumeId, tabs: [tab('t.1', 300001, [tab('t.2', 40001, [tab('t.3', 2)])])] });
  });
  const plan = { documentId: volumeId, reviewedRevisionId: 'prior-revision', milestoneEvidence: 'test-milestone',
    archiveEvidence: 'test-archive', handoffEvidence: 'test-handoff', writerInventoryEvidence: 'test-writer',
    writers: [] };
  const evaluation = evaluateLifecycle({ volumeId, scheduledFor: due }, due, {
    kind: 'received', ...await read(), plan,
  });
  assert.equal(evaluation.approximateUtf16Units, 340001);
  assert.equal(evaluation.size, 'review');
  assert.equal(evaluation.rollover, 'blocked');
  assert.deepEqual(evaluation.blockers, ['revision_unverified']);
});

test('scheduler stays off unless explicitly bound to CoMind Test', () => {
  assert.equal(getRunBookSchedulerConfig({}), null);
  assert.throws(() => getRunBookSchedulerConfig({ DRB_RUNBOOK_SCHEDULER: 'test' }), /requires/);
  const binding = {
    DRB_RUNBOOK_SCHEDULER: 'test', DRB_RUNBOOK_GOOGLE_DOC_ID: volumeId,
    DRB_RUNBOOK_GOOGLE_CREDENTIALS_FILE: 'synthetic-auth.json',
  };
  for (const database of ['postgres://test@localhost/postgres?sslmode=verify-full',
    'postgres://postgres@db.sbgfuanxiqepcoboxzcl.supabase.co/postgres?sslmode=verify-full']) {
    assert.throws(() => getRunBookSchedulerConfig({ ...binding, DRB_RUNBOOK_DATABASE_URL: database }), /CoMind Test/);
  }
  const database = 'postgres://comind_runbook_scheduler_login@db.sbgfuanxiqepcoboxzcl.supabase.co/postgres?sslmode=verify-full';
  assert.equal(getRunBookSchedulerConfig({ ...binding, DRB_RUNBOOK_DATABASE_URL: database }).database, database);
});

test('a scheduler tick records provider failure once and retries reuse the due-slot receipt', async () => {
  let stored;
  let tokenRequests = 0;
  const ledger = {
    find: async () => stored ?? null,
    record: async (evaluation) => (stored = { eventId: 'synthetic-receipt', evaluation }),
  };
  const read = createGoogleRunBookReader(volumeId, async () => {
    tokenRequests += 1;
    return null;
  });
  const execute = () => runDueRunBookCheck(volumeId, async () => due, ledger, read);
  const first = await execute();
  assert.equal(first.evaluation.size, 'unavailable');
  assert.deepEqual(await execute(), first);
  assert.equal(tokenRequests, 1);
});

test('Google-managed Test Viewer is attested and rejects wrong host or account', async () => {
  const database = 'postgres://comind_runbook_scheduler_login@db.sbgfuanxiqepcoboxzcl.supabase.co/postgres?sslmode=verify-full';
  const binding = { DRB_RUNBOOK_SCHEDULER: 'test', DRB_RUNBOOK_GOOGLE_DOC_ID: volumeId,
    DRB_RUNBOOK_DATABASE_URL: database, DRB_RUNBOOK_GOOGLE_IDENTITY: 'cloud-run',
    DRB_RUNBOOK_GOOGLE_PROJECT_ID: 'comind-513807', K_SERVICE: 'comind-runbook-scheduler-test',
    DRB_RUNBOOK_GOOGLE_SERVICE_ACCOUNT_EMAIL: 'comind-drb-runbook-viewer@comind-513807.iam.gserviceaccount.com' };
  assert.equal(getRunBookSchedulerConfig(binding).cloudRun, true);
  for (const override of [{ K_SERVICE: '' }, { DRB_RUNBOOK_GOOGLE_PROJECT_ID: 'other' },
    { DRB_RUNBOOK_GOOGLE_SERVICE_ACCOUNT_EMAIL: 'other@example.com' },
    { DRB_RUNBOOK_GOOGLE_CREDENTIALS_FILE: 'other.json' }]) {
    assert.throws(() => getRunBookSchedulerConfig({ ...binding, ...override }), /scoped Test Viewer/);
  }
  const identity = 'comind-drb-runbook-viewer@comind-513807.iam.gserviceaccount.com';
  let requests = 0;
  await verifyCloudRunViewerIdentity(async (url, options) => {
    requests++;
    assert.match(url, /^http:\/\/metadata\.google\.internal\//);
    assert.equal(options.headers['Metadata-Flavor'], 'Google');
    return new Response(identity, { headers: { 'Metadata-Flavor': 'Google' } });
  });
  assert.equal(requests, 1);
  await assert.rejects(verifyCloudRunViewerIdentity(async () => new Response('other@example.com',
    { headers: { 'Metadata-Flavor': 'Google' } })), /differs/);
});
