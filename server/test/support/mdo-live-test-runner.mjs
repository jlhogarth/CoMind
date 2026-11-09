import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const { FoundryAdapterRegistry, FoundryRuntimeOrchestrator } = await import('../../dist/foundry-runtime.js');
const { MdoOrchestrator } = await import('../../dist/mdo-orchestrator.js');
const { MdoPlanningWorker, createMdoFoundryAdapter } = await import('../../dist/mdo-planning-runtime.js');
const { runMdoCollaboration } = await import('../../dist/agent-collaboration.js');
const { createLocalOllamaFoundryAdapter } = await import('../../dist/providers/ollama-foundry-adapter.js');

const SCHEDULE = Object.freeze([
  ['analyze', 'module_planner'],
  ['analyze', 'architecture_analyst'],
  ['research', 'external_capability_scout'],
  ['research', 'lessons_learned_analyst'],
  ['analyze', 'dependency_analyst'],
  ['review', 'governance_reviewer'],
  ['review', 'assumption_validator'],
  ['review', 'integration_reviewer'],
  ['synthesize', 'plan_synthesizer'],
  ['portfolio', 'portfolio_coordinator'],
]);

export function createMdoLiveTestRunner({ db, fixtures, ollamaBaseUrl, model, candidateKey }) {
  const { query, one } = db;

  function createRuntime() {
    const registry = new FoundryAdapterRegistry();
    registry.register('ollama_local', createLocalOllamaFoundryAdapter({
      baseUrl: ollamaBaseUrl,
      model,
      maxOutputTokens: 48,
      timeoutMs: 120_000,
    }));
    registry.register('mdo', createMdoFoundryAdapter({
      queryFn: query,
      inferenceRegistry: registry,
      maxPromptChars: 5_900,
      maxOutputChars: 8_000,
    }));
    const foundryRuntime = new FoundryRuntimeOrchestrator(query, registry);
    const mdo = new MdoOrchestrator(query);
    return { mdo, worker: new MdoPlanningWorker({ queryFn: query, foundryRuntime, mdo }) };
  }

  async function proveAuthorizationFailure(fixture, profile, planId, runtime, mode, expectedRole) {
    const workerId = `mdo003-${mode}-${profile.key}-${candidateKey}`.slice(0, 120);
    const claim = await runtime.mdo.claimWork({ profileId: profile.profileId, workerInstanceId: workerId, leaseSeconds: 300 });
    assert.ok(claim, `Expected ${expectedRole} to be claimable for ${mode} authorization proof`);
    const context = await runtime.mdo.loadTaskContext(claim.taskId);
    assert.equal(context.roleCode, expectedRole);
    const before = await one(
      `SELECT count(*)::int AS execution_count FROM comind.cm_foundry_execution_context WHERE task_id=$1::uuid`,
      [claim.taskId]
    );
    const targetRef = mode === 'mismatch' ? randomUUID() : planId;
    const decisionId = await fixtures.issueAuthorization({
      profile,
      actorId: profile.actorId,
      capabilityId: profile.capabilityId,
      projectId: fixture.project.project_id,
      taskId: claim.taskId,
      targetKind: 'module_plan',
      targetRef,
      sponsorActorId: fixture.sponsor.actor_id,
      reason: `MDO-003 ${mode}-authorization negative proof.`,
      expired: mode === 'expired',
    });
    let error = null;
    try {
      await runtime.worker.executeClaim({
        profileId: profile.profileId,
        workerInstanceId: workerId,
        authorizationDecisionId: decisionId,
        claim,
        idempotencyKey: `mdo003-${mode}-exec:${candidateKey}`,
      });
    } catch (caught) {
      error = caught;
    }
    const expectedCode = mode === 'expired' ? 'authorization_expired' : 'authorization_scope_mismatch';
    assert.ok(error, `${mode} authorization must reject execution`);
    assert.equal(error.code, expectedCode);
    const after = await one(
      `SELECT
         (SELECT count(*)::int FROM comind.cm_foundry_execution_context WHERE task_id=$1::uuid) AS execution_count,
         (SELECT count(*)::int FROM comind.cm_mdo_contribution WHERE task_id=$1::uuid) AS contribution_count,
         (SELECT state FROM comind.cm_foundry_work_lease WHERE task_id=$1::uuid) AS lease_state`,
      [claim.taskId]
    );
    assert.equal(after.execution_count, before.execution_count);
    assert.equal(after.contribution_count, 0);
    assert.equal(after.lease_state, 'ready');
    return {
      mode,
      role: expectedRole,
      task_id: claim.taskId,
      authorization_decision_id: decisionId,
      error_code: error.code,
    };
  }

  async function proveAuthorizationFailures(fixture, profiles, planId, runtime) {
    return [
      await proveAuthorizationFailure(fixture, profiles.analyze, planId, runtime, 'expired', 'module_planner'),
      await proveAuthorizationFailure(fixture, profiles.research, planId, runtime, 'mismatch', 'external_capability_scout'),
    ];
  }

  async function executeTenRoles(fixture, profiles, planId, runtime) {
    const keyByRole = new Map(SCHEDULE.map(([key, role]) => [role, key]));
    const assignments = SCHEDULE.map(([key, role], index) => ({
      role,
      profileId: profiles[key].profileId,
      workerInstanceId: `mdo003-${key}-${index + 1}-${candidateKey}`.slice(0, 120),
    }));
    const outcome = await runMdoCollaboration({
      mdo: runtime.mdo,
      worker: runtime.worker,
      async authorizeClaim(claim, context, assignment) {
        const profile = profiles[keyByRole.get(assignment.role)];
        assert.equal(context.planId, planId);
        return fixtures.issueAuthorization({
          profile,
          actorId: profile.actorId,
          capabilityId: profile.capabilityId,
          projectId: fixture.project.project_id,
          taskId: claim.taskId,
          targetKind: 'module_plan',
          targetRef: planId,
          sponsorActorId: fixture.sponsor.actor_id,
          reason: `AGCOL-001 Test execution for ${assignment.role}.`,
        });
      },
      async releaseMismatchedClaim(claim, workerInstanceId) {
        const release = await query(
          `SELECT comind.cm_foundry_finish_work($1::uuid, $2::text, $3::uuid, $4::bigint, false) AS ok`,
          [claim.taskId, workerInstanceId, claim.leaseToken, claim.fencingEpoch]
        );
        if (release.rows.length !== 1 || release.rows[0].ok !== true) {
          throw new Error('Fenced collaboration claim release failed');
        }
      },
    }, planId, assignments, `agcol001:${candidateKey}`);
    assert.equal(outcome.status, 'completed', `${outcome.blockedRole}: ${outcome.reason}`);
    assert.equal(outcome.receipts.length, 10);
    return outcome.receipts.map((receipt) => {
      assert.equal(receipt.provider, 'ollama_local');
      assert.equal(receipt.model, model);
      return {
        role: receipt.role,
        task_id: receipt.taskId,
        contribution_id: receipt.contributionId,
        evidence_id: receipt.evidenceId,
        execution_context_id: receipt.executionContextId,
        authorization_decision_id: receipt.authorizationDecisionId,
      };
    });
  }

  async function assertProviderProvenance(planId) {
    const provenance = await query(
      `SELECT DISTINCT metadata->>'provider_adapter' AS provider_adapter,
                       metadata->>'provider' AS provider,
                       metadata->>'model' AS model,
                       metadata ? 'prompt_checksum' AS has_prompt_checksum,
                       metadata ? 'prompt' AS stores_raw_prompt
       FROM comind.cm_evidence
       WHERE source_type='mdo_provider_output' AND metadata->>'plan_id'=$1::text`,
      [planId]
    );
    assert.deepEqual(provenance.rows, [{
      provider_adapter: 'ollama_local',
      provider: 'ollama_local',
      model,
      has_prompt_checksum: true,
      stores_raw_prompt: false,
    }]);
  }

  return Object.freeze({ createRuntime, proveAuthorizationFailures, executeTenRoles, assertProviderProvenance });
}
