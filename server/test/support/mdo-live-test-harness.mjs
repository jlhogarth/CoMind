import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { createMdoLiveTestDb } from './mdo-live-test-db.mjs';
import { createMdoLiveTestFixtures } from './mdo-live-test-fixtures.mjs';
import { createMdoLiveTestGovernance } from './mdo-live-test-governance.mjs';
import { createMdoLiveTestRunner } from './mdo-live-test-runner.mjs';

function safeError(error) {
  if (!error || typeof error !== 'object') return { name: 'unknown_error', code: null };
  return {
    name: typeof error.name === 'string' ? error.name : 'unknown_error',
    code: typeof error.code === 'string' ? error.code : null,
  };
}

export function createMdoLiveTestHarness({
  connectionString,
  ollamaBaseUrl = 'http://127.0.0.1:11434',
  model = 'qwen3:0.6b',
  artifactPath = 'artifacts/mdo-003-test-acceptance.json',
  candidateRef = process.env.GITHUB_SHA ?? randomUUID(),
  runAttempt = process.env.GITHUB_RUN_ATTEMPT ?? '1',
} = {}) {
  const db = createMdoLiveTestDb({ connectionString });
  const candidateKey = `${candidateRef}:${runAttempt}`.replace(/[^A-Za-z0-9._:-]/g, '_').slice(0, 160);
  const fixtures = createMdoLiveTestFixtures({ db, model, candidateRef, candidateKey });
  const governance = createMdoLiveTestGovernance({ db, fixtures, candidateRef, candidateKey });
  const runner = createMdoLiveTestRunner({ db, fixtures, ollamaBaseUrl, model, candidateKey });
  const agcolRun = process.env.AGCOL_TEST_RUN === 'true';
  const evidenceIssue = agcolRun ? 548 : 370;
  const evidenceSchema = agcolRun ? 'comind.agcol-001.test-acceptance.v1' : 'comind.mdo-003.test-acceptance.v1';

  async function writeArtifact(evidence) {
    mkdirSync(dirname(artifactPath), { recursive: true });
    writeFileSync(artifactPath, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
    if (process.env.GITHUB_STEP_SUMMARY) {
      const lines = [
        agcolRun ? '# AGCOL-001 governed collaboration Test acceptance' : '# MDO-003 governed persistent Test acceptance',
        '',
        `- Exact candidate: ${candidateRef}`,
        `- Provider/model: ollama_local / ${model}`,
        `- Plan: ${evidence.plan_id ?? 'not-created'}`,
        `- Outcome: ${evidence.outcome}`,
        `- Contributions: ${evidence.readback?.contribution_count ?? 0}`,
        `- Completed leases: ${evidence.readback?.completed_lease_count ?? 0}`,
        `- Evidence rows: ${evidence.readback?.inference_evidence_count ?? 0}`,
        `- CE-003 decision: ${evidence.ce_preflight?.decision ?? 'not-run'}`,
        `- Run grants active after cleanup: ${evidence.grant_cleanup?.active ?? 0}`,
        '',
        'Production authorization: false. Paid-provider authorization: false.',
        '',
      ];
      writeFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join('\n'), { flag: 'a' });
    }
  }

  async function runAcceptance() {
    let grantIds = [];
    let grantCleanup = null;
    let planId = null;
    try {
      const fixture = await fixtures.ensureSponsorAndFixture();
      const profiles = await fixtures.ensureWorkforce(fixture);
      const plan = await governance.enqueuePlan(fixture);
      planId = plan.planId;
      const ce = await governance.runCePreflight(fixture, plan);
      grantIds = await fixtures.grantRunAuthority(fixture, profiles, plan.planId);
      const runtime = runner.createRuntime();
      const negativeAuthorizations = await runner.proveAuthorizationFailures(fixture, profiles, plan.planId, runtime);
      const results = await runner.executeTenRoles(fixture, profiles, plan.planId, runtime);
      const initialReadback = await fixtures.readback(plan.planId, fixture.module.module_id);

      assert.equal(initialReadback.contribution_count, 10);
      assert.equal(initialReadback.completed_lease_count, 10);
      assert.equal(initialReadback.inference_evidence_count, 10);
      assert.equal(initialReadback.done_task_count, 10);
      assert.equal(initialReadback.contribution_evidence_link_count, 10);
      assert.equal(initialReadback.contribution_audit_count, 10);
      assert.equal(initialReadback.role_authorization_count, 12);
      assert.equal(initialReadback.execution_context_count, 10);
      assert.equal(initialReadback.plan_status, 'in_review');
      assert.equal(initialReadback.module_lifecycle_stage, fixture.module.lifecycle_stage);

      const replay = await plan.mdo.enqueuePlan({
        moduleId: fixture.module.module_id,
        projectId: fixture.project.project_id,
        requestedByActorId: fixture.sponsor.actor_id,
        authorizationDecisionId: plan.authorizationDecisionId,
        objective: plan.objective,
        idempotencyKey: plan.idempotencyKey,
      });
      assert.equal(replay.planId, plan.planId);
      assert.equal(replay.created, false);
      const replayReadback = await fixtures.readback(plan.planId, fixture.module.module_id);
      assert.deepEqual(replayReadback, initialReadback);
      await runner.assertProviderProvenance(plan.planId);

      grantCleanup = await fixtures.revokeRunAuthority(grantIds);
      assert.equal(grantCleanup.revoked, 5);
      assert.equal(grantCleanup.active, 0);

      const evidence = {
        schema_version: evidenceSchema,
        issue: evidenceIssue,
        outcome: 'accepted_test_proof',
        candidate_ref: candidateRef,
        run_attempt: runAttempt,
        environment: 'isolated',
        database: fixture.databaseIdentity,
        provider: 'ollama_local',
        model,
        production_authorized: false,
        paid_provider_authorized: false,
        project_id: fixture.project.project_id,
        module_id: fixture.module.module_id,
        module_lifecycle_stage_before: fixture.module.lifecycle_stage,
        plan_id: plan.planId,
        workforce: Object.values(profiles).map(profile => ({
          key: profile.key,
          profile_id: profile.profileId,
          actor_id: profile.actorId,
          capability: profile.capabilityCode,
        })),
        ce_preflight: {
          evidence_id: ce.evidenceId,
          scan_fingerprint: ce.result.scanFingerprint,
          decision: ce.result.decision,
          proceed_allowed: ce.result.proceedAllowed,
          finding_count: ce.result.findings.length,
          persisted_signal_count: ce.persistence.persisted.length,
        },
        negative_authorizations: negativeAuthorizations,
        readback: initialReadback,
        grant_cleanup: grantCleanup,
        results,
      };
      await writeArtifact(evidence);
      return evidence;
    } catch (error) {
      if (!grantCleanup && grantIds.length > 0) grantCleanup = await fixtures.revokeRunAuthority(grantIds);
      await writeArtifact({
        schema_version: evidenceSchema,
        issue: evidenceIssue,
        outcome: 'failed_test_proof',
        candidate_ref: candidateRef,
        run_attempt: runAttempt,
        plan_id: planId,
        environment: 'isolated',
        production_authorized: false,
        paid_provider_authorized: false,
        grant_cleanup: grantCleanup ?? { revoked: 0, active: 0 },
        error: safeError(error),
      });
      throw error;
    } finally {
      if (!grantCleanup && grantIds.length > 0) await fixtures.revokeRunAuthority(grantIds);
    }
  }

  return Object.freeze({
    runAcceptance,
    verifyDatabaseIdentity: db.verifyDatabaseIdentity,
    close: db.close,
  });
}
