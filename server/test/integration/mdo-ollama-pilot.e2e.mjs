import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { Pool } from 'pg';

const model = process.env.OLLAMA_MODEL ?? 'qwen3:0.6b';
const ollamaBaseUrl = process.env.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434';
const artifactPath = process.env.MDO_PILOT_ARTIFACT ?? 'artifacts/mdo-002-ollama-pilot-evidence.json';
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required for the MDO-002 isolated pilot.');

const parsed = new URL(databaseUrl);
if (!['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname) || parsed.pathname !== '/comind_ci') {
  throw new Error('Refusing MDO-002 pilot outside isolated local comind_ci.');
}

const { FoundryAdapterRegistry, FoundryRuntimeOrchestrator } = await import('../../dist/foundry-runtime.js');
const { MdoOrchestrator } = await import('../../dist/mdo-orchestrator.js');
const { MdoPlanningWorker, createMdoFoundryAdapter } = await import('../../dist/mdo-planning-runtime.js');
const { createLocalOllamaFoundryAdapter } = await import('../../dist/providers/ollama-foundry-adapter.js');

// Keep the pool idle timeout deliberately short. The rollback-only pilot must
// remain correct because it owns one checked-out client for the whole fixture,
// not because a pooled client happens to survive a slow local inference call.
const pool = new Pool({ connectionString: databaseUrl, max: 1, idleTimeoutMillis: 1_000 });
let transactionClient = null;
async function query(sql, params = []) {
  const runner = transactionClient ?? pool;
  const result = await runner.query(sql, params);
  return { rows: result.rows };
}
async function one(sql, params = []) {
  const result = await query(sql, params);
  assert.equal(result.rows.length, 1, 'Expected exactly one MDO-002 pilot row');
  return result.rows[0];
}

function writeEvidence(evidence) {
  mkdirSync(dirname(artifactPath), { recursive: true });
  writeFileSync(artifactPath, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
  if (process.env.GITHUB_STEP_SUMMARY) {
    const lines = [
      '# MDO-002 zero-cost Ollama planning pilot',
      '',
      `- Provider/model: ollama_local / ${model}`,
      '- Authority: C1 isolated, non-cost-bearing',
      `- Plan: ${evidence.plan_id}`,
      `- Contributions: ${evidence.contribution_count}`,
      `- Completed leases: ${evidence.completed_lease_count}`,
      `- Evidence rows: ${evidence.inference_evidence_count}`,
      `- Module maturity unchanged: ${evidence.module_lifecycle_stage}`,
      '',
      'The complete fixture is rollback-only. No Production state or paid provider call is created.',
      '',
    ];
    writeFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join('\n'), { flag: 'a' });
  }
}

async function createProfile({ orgId, founderActorId, projectId, planId, roleCode, capabilityCode, suffix }) {
  const actor = await one(
    `INSERT INTO comind.cm_actor(org_id, kind, handle, display_name)
     VALUES ($1::uuid, 'agent', $2::text, $3::text)
     RETURNING actor_id::text`,
    [orgId, `mdo002-${roleCode}-${suffix}`, `MDO-002 ${roleCode}`]
  );
  const agent = await one(
    `INSERT INTO comind.cm_agent(org_id, name, description)
     VALUES ($1::uuid, $2::text, 'Rollback-only MDO-002 planning pilot profile')
     RETURNING agent_id::text`,
    [orgId, `MDO-002 ${roleCode} ${suffix}`]
  );
  const capability = await one(
    `SELECT capability_id::text, capability_code, adapter, max_authority, cost_bearing
     FROM comind.cm_foundry_capability
     WHERE capability_code = $1::text`,
    [capabilityCode]
  );
  assert.equal(capability.adapter, 'mdo');
  assert.equal(capability.max_authority, 'C1');
  assert.equal(capability.cost_bearing, false);

  const profile = await one(
    `INSERT INTO comind.cm_foundry_agent_profile(
       agent_id, actor_id, org_id, role_code, display_name,
       authority_floor, authority_ceiling, instruction_version,
       runtime_defaults, competencies, status, activated_at
     ) VALUES (
       $1::uuid, $2::uuid, $3::uuid, $4::text, $5::text,
       'C0', 'C1', 'mdo-002-pilot-v1',
       $6::jsonb, $7::jsonb, 'active', clock_timestamp()
     )
     RETURNING profile_id::text`,
    [
      agent.agent_id,
      actor.actor_id,
      orgId,
      roleCode,
      `MDO-002 ${roleCode}`,
      JSON.stringify({
        provider: 'mdo',
        environment: 'isolated',
        mdo_inference: { adapter: 'ollama_local', provider: 'ollama_local', model },
        paid_provider_allowed: false,
        production_target_allowed: false,
      }),
      JSON.stringify([roleCode, 'module_planning']),
    ]
  );

  await query(
    `INSERT INTO comind.cm_foundry_capability_grant(
       profile_id, capability_id, org_id, project_id,
       environment, authority_ceiling, scope,
       granted_by_actor_id, grant_reason, expires_at
     ) VALUES (
       $1::uuid, $2::uuid, $3::uuid, $4::uuid,
       'isolated', 'C1', $5::jsonb,
       $6::uuid, 'MDO-002 rollback-only zero-cost Ollama pilot',
       clock_timestamp() + interval '2 hours'
     )`,
    [
      profile.profile_id,
      capability.capability_id,
      orgId,
      projectId,
      JSON.stringify({ target_refs: [planId] }),
      founderActorId,
    ]
  );
  return {
    profileId: profile.profile_id,
    actorId: actor.actor_id,
    capabilityId: capability.capability_id,
    capabilityCode,
    roleCode,
  };
}

async function authorizeClaim(profile, claim, projectId, planId, founderActorId) {
  const request = await one(
    `INSERT INTO comind.cm_foundry_authorization_request(
       requesting_profile_id, requesting_actor_id, capability_id,
       project_id, task_id, authority_level, environment,
       target_kind, target_ref, reason, evidence_refs, status, expires_at
     ) VALUES (
       $1::uuid, $2::uuid, $3::uuid,
       $4::uuid, $5::uuid, 'C1', 'isolated',
       'module_plan', $6::text,
       'MDO-002 rollback-only zero-cost planning execution',
       $7::jsonb, 'approved', clock_timestamp() + interval '20 minutes'
     )
     RETURNING authorization_request_id::text`,
    [
      profile.profileId,
      profile.actorId,
      profile.capabilityId,
      projectId,
      claim.taskId,
      planId,
      JSON.stringify(['github:issue-316', `mdo-plan:${planId}`, `mdo-task:${claim.taskId}`]),
    ]
  );
  const decision = await one(
    `INSERT INTO comind.cm_foundry_authorization_decision(
       authorization_request_id, decision, decided_by_actor_id,
       decision_basis, policy_refs, effective_until
     ) VALUES (
       $1::uuid, 'approved', $2::uuid,
       'Founder-authorized MDO-002 isolated zero-cost planning pilot.',
       $3::jsonb, clock_timestamp() + interval '20 minutes'
     )
     RETURNING authorization_decision_id::text`,
    [request.authorization_request_id, founderActorId, JSON.stringify(['MDO-002', 'Issue #316'])]
  );
  return decision.authorization_decision_id;
}

test('MDO-002 executes the complete ten-role phase chain through local Ollama with rollback-only state', async () => {
  const client = await pool.connect();
  transactionClient = client;
  await client.query('BEGIN');
  const suffix = randomUUID().replaceAll('-', '').slice(0, 16);
  try {
    const org = await one(
      `INSERT INTO comind.cm_org(name, slug)
       VALUES ($1::text, $2::text)
       RETURNING org_id::text`,
      [`MDO-002 pilot ${suffix}`, `mdo002-${suffix}`]
    );
    const founder = await one(
      `INSERT INTO comind.cm_actor(org_id, kind, handle, display_name)
       VALUES ($1::uuid, 'person', $2::text, 'MDO-002 synthetic founder')
       RETURNING actor_id::text`,
      [org.org_id, `mdo002-founder-${suffix}`]
    );
    const project = await one(
      `INSERT INTO comind.cm_project(org_id, title, slug, status, created_by)
       VALUES ($1::uuid, $2::text, $3::text, 'active', $4::uuid)
       RETURNING project_id::text`,
      [org.org_id, `MDO-002 isolated pilot ${suffix}`, `mdo002-project-${suffix}`, founder.actor_id]
    );
    const module = await one(
      `INSERT INTO comind.cm_module_registry(
         name, module_code, project_id, description, status,
         lifecycle_stage, source_system, source_ref
       ) VALUES (
         $1::text, $2::text, $3::uuid,
         'Rollback-only synthetic module for the MDO-002 full phase-chain pilot.',
         'enabled', 'conceived', 'mdo-002-pilot', '#316'
       )
       RETURNING module_id::text`,
      [`MDO-002 synthetic module ${suffix}`, `MDO2-${suffix}`, project.project_id]
    );

    const orchestrateCapability = await one(
      `SELECT capability_id::text
       FROM comind.cm_foundry_capability
       WHERE capability_code = 'mdo.plan.orchestrate'`
    );
    const orchestrationRequest = await one(
      `INSERT INTO comind.cm_foundry_authorization_request(
         requesting_actor_id, capability_id, project_id,
         authority_level, environment, target_kind, target_ref,
         reason, status, expires_at
       ) VALUES (
         $1::uuid, $2::uuid, $3::uuid,
         'C1', 'isolated', 'module', $4::text,
         'MDO-002 rollback-only full planning-chain pilot',
         'approved', clock_timestamp() + interval '20 minutes'
       )
       RETURNING authorization_request_id::text`,
      [founder.actor_id, orchestrateCapability.capability_id, project.project_id, module.module_id]
    );
    const orchestrationDecision = await one(
      `INSERT INTO comind.cm_foundry_authorization_decision(
         authorization_request_id, decision, decided_by_actor_id,
         decision_basis, effective_until
       ) VALUES (
         $1::uuid, 'approved', $2::uuid,
         'MDO-002 isolated synthetic module planning authorization.',
         clock_timestamp() + interval '20 minutes'
       )
       RETURNING authorization_decision_id::text`,
      [orchestrationRequest.authorization_request_id, founder.actor_id]
    );

    const mdo = new MdoOrchestrator(query);
    const enqueued = await mdo.enqueuePlan({
      moduleId: module.module_id,
      projectId: project.project_id,
      requestedByActorId: founder.actor_id,
      authorizationDecisionId: orchestrationDecision.authorization_decision_id,
      objective: 'Produce a concise governed implementation plan proving the MDO planning phase chain while preserving human authority and reusing existing CoMind substrate.',
      idempotencyKey: `mdo002-plan-${suffix}`,
    });
    assert.equal(enqueued.created, true);
    assert.equal(enqueued.taskCount, 10);

    const profiles = {
      analyze: await createProfile({
        orgId: org.org_id, founderActorId: founder.actor_id, projectId: project.project_id,
        planId: enqueued.planId, roleCode: 'mdo_analyzer', capabilityCode: 'mdo.plan.analyze', suffix,
      }),
      research: await createProfile({
        orgId: org.org_id, founderActorId: founder.actor_id, projectId: project.project_id,
        planId: enqueued.planId, roleCode: 'mdo_researcher', capabilityCode: 'mdo.plan.research', suffix,
      }),
      review: await createProfile({
        orgId: org.org_id, founderActorId: founder.actor_id, projectId: project.project_id,
        planId: enqueued.planId, roleCode: 'mdo_reviewer', capabilityCode: 'mdo.plan.review', suffix,
      }),
      synthesize: await createProfile({
        orgId: org.org_id, founderActorId: founder.actor_id, projectId: project.project_id,
        planId: enqueued.planId, roleCode: 'mdo_synthesizer', capabilityCode: 'mdo.plan.synthesize', suffix,
      }),
      portfolio: await createProfile({
        orgId: org.org_id, founderActorId: founder.actor_id, projectId: project.project_id,
        planId: enqueued.planId, roleCode: 'mdo_portfolio', capabilityCode: 'mdo.plan.portfolio', suffix,
      }),
    };

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
    const worker = new MdoPlanningWorker({ queryFn: query, foundryRuntime, mdo });

    const schedule = [
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
    ];
    const results = [];
    for (let index = 0; index < schedule.length; index += 1) {
      const [profileKey, expectedRole] = schedule[index];
      const profile = profiles[profileKey];
      const workerId = `mdo002-${profileKey}-${index + 1}`;
      console.log(`mdo-pilot-role-start|index=${index + 1}|role=${expectedRole}|capability=${profile.capabilityCode}`);
      const claim = await mdo.claimWork({
        profileId: profile.profileId,
        workerInstanceId: workerId,
        leaseSeconds: 300,
      });
      assert.ok(claim, `Expected ${expectedRole} task to be claimable`);
      const taskContext = await mdo.loadTaskContext(claim.taskId);
      assert.equal(taskContext.roleCode, expectedRole);
      assert.equal(taskContext.planId, enqueued.planId);
      const decisionId = await authorizeClaim(
        profile,
        claim,
        project.project_id,
        enqueued.planId,
        founder.actor_id
      );
      const result = await worker.executeClaim({
        profileId: profile.profileId,
        workerInstanceId: workerId,
        authorizationDecisionId: decisionId,
        claim,
        idempotencyKey: `mdo002-exec-${index + 1}-${suffix}`,
      });
      assert.equal(result.provider, 'ollama_local');
      assert.equal(result.model, model);
      assert.equal(result.execution.terminalStatus, 'succeeded');
      console.log(`mdo-pilot-role-complete|index=${index + 1}|role=${expectedRole}`);
      results.push({
        role: expectedRole,
        task_id: result.taskId,
        contribution_id: result.contributionId,
        evidence_id: result.evidenceId,
        execution_context_id: result.execution.executionContextId,
      });
    }

    const noMoreAnalyze = await mdo.claimWork({
      profileId: profiles.analyze.profileId,
      workerInstanceId: 'mdo002-no-more-work',
      leaseSeconds: 60,
    });
    assert.equal(noMoreAnalyze, null);

    const readback = await one(
      `SELECT
         (SELECT count(*)::int FROM comind.cm_mdo_contribution WHERE plan_id = $1::uuid) AS contribution_count,
         (SELECT count(*)::int FROM comind.cm_foundry_work_lease l
            JOIN comind.cm_mdo_plan_task pt ON pt.task_id = l.task_id
            WHERE pt.plan_id = $1::uuid AND l.state = 'completed') AS completed_lease_count,
         (SELECT count(*)::int FROM comind.cm_evidence e
            WHERE e.source_type = 'mdo_provider_output'
              AND e.metadata->>'plan_id' = $1::text) AS inference_evidence_count,
         (SELECT count(*)::int FROM comind.cm_task t
            JOIN comind.cm_mdo_plan_task pt ON pt.task_id = t.task_id
            WHERE pt.plan_id = $1::uuid AND t.status = 'done') AS done_task_count,
         (SELECT status FROM comind.cm_mdo_plan WHERE plan_id = $1::uuid) AS plan_status,
         (SELECT lifecycle_stage FROM comind.cm_module_registry WHERE module_id = $2::uuid) AS module_lifecycle_stage`,
      [enqueued.planId, module.module_id]
    );
    assert.equal(readback.contribution_count, 10);
    assert.equal(readback.completed_lease_count, 10);
    assert.equal(readback.inference_evidence_count, 10);
    assert.equal(readback.done_task_count, 10);
    assert.equal(readback.plan_status, 'in_review');
    assert.equal(readback.module_lifecycle_stage, 'conceived');

    const provenance = await query(
      `SELECT DISTINCT
         metadata->>'provider_adapter' AS provider_adapter,
         metadata->>'provider' AS provider,
         metadata->>'model' AS model,
         metadata ? 'prompt_checksum' AS has_prompt_checksum,
         metadata ? 'output_text' AS has_output_text,
         metadata ? 'prompt' AS stores_raw_prompt
       FROM comind.cm_evidence
       WHERE source_type = 'mdo_provider_output'
         AND metadata->>'plan_id' = $1::text`,
      [enqueued.planId]
    );
    assert.deepEqual(provenance.rows, [{
      provider_adapter: 'ollama_local',
      provider: 'ollama_local',
      model,
      has_prompt_checksum: true,
      has_output_text: true,
      stores_raw_prompt: false,
    }]);

    const evidence = {
      schema_version: 'comind.mdo-002.ollama-pilot-evidence.v1',
      issue: 316,
      environment: 'isolated',
      provider: 'ollama_local',
      model,
      plan_id: enqueued.planId,
      module_id: module.module_id,
      contribution_count: readback.contribution_count,
      completed_lease_count: readback.completed_lease_count,
      inference_evidence_count: readback.inference_evidence_count,
      done_task_count: readback.done_task_count,
      plan_status: readback.plan_status,
      module_lifecycle_stage: readback.module_lifecycle_stage,
      production_authorized: false,
      paid_provider_authorized: false,
      results,
    };
    writeEvidence(evidence);
  } finally {
    try {
      await client.query('ROLLBACK');
    } finally {
      transactionClient = null;
      client.release();
    }
  }
});

test.after(async () => {
  await pool.end();
});
