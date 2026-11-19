import assert from 'node:assert/strict';
import test from 'node:test';
import { createMdoLiveTestHarness } from '../support/mdo-live-test-harness.mjs';

const harness = createMdoLiveTestHarness({
  connectionString: process.env.SUPABASE_SESSION_DATABASE_URL,
  ollamaBaseUrl: process.env.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434',
  model: process.env.OLLAMA_MODEL ?? 'qwen3:0.6b',
  artifactPath: process.env.MDO_TEST_ARTIFACT ?? 'artifacts/mdo-003-test-acceptance.json',
  candidateRef: process.env.AGCOL_CANDIDATE_REF ?? process.env.GITHUB_SHA,
  runAttempt: process.env.GITHUB_RUN_ATTEMPT ?? '1',
});

test('MDO-003 executes durable governed Test planning with negative authorization, CE preflight, replay safety, and grant cleanup', async () => {
  const evidence = await harness.runAcceptance();
  assert.equal(evidence.readback.contribution_count, 10);
  assert.equal(evidence.readback.completed_lease_count, 10);
  assert.equal(evidence.readback.inference_evidence_count, 10);
  assert.equal(evidence.readback.done_task_count, 10);
  assert.equal(evidence.readback.contribution_evidence_link_count, 10);
  assert.equal(evidence.readback.contribution_audit_count, 10);
  assert.equal(evidence.readback.role_authorization_count, 12);
  assert.equal(evidence.readback.execution_context_count, 10);
  assert.equal(evidence.readback.plan_status, 'in_review');
  assert.equal(evidence.readback.module_lifecycle_stage, evidence.module_lifecycle_stage_before);
  assert.equal(evidence.ce_preflight.proceed_allowed, true);
  assert.deepEqual(evidence.negative_authorizations.map(item => item.error_code).sort(), ['authorization_expired', 'authorization_scope_mismatch']);
  assert.equal(evidence.grant_cleanup.active, 0);
  assert.equal(evidence.production_authorized, false);
  assert.equal(evidence.paid_provider_authorized, false);
  if (process.env.AGCOL_TEST_RUN === 'true') {
    assert.equal(evidence.issue, 548);
    assert.equal(evidence.candidate_ref, process.env.AGCOL_CANDIDATE_REF);
  }
});

test.after(async () => {
  await harness.close();
});
