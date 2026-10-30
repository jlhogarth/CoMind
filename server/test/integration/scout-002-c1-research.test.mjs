import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';

const {
  FoundryAdapterRegistry,
  FoundryRuntimeError,
  FoundryRuntimeOrchestrator,
} = await import('../../dist/foundry-runtime.js');

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is required');
}
const parsed = new URL(databaseUrl);
if (!['localhost', '127.0.0.1', 'db'].includes(parsed.hostname) || parsed.pathname !== '/comind_ci') {
  throw new Error('Refusing SCOUT-002 acceptance outside isolated comind_ci');
}

const pool = new Pool({ connectionString: databaseUrl });
const query = async (text, params = []) => {
  const result = await pool.query(text, params);
  return { rows: result.rows };
};
const one = async (text, params = []) => {
  const result = await query(text, params);
  assert.equal(result.rows.length, 1);
  return result.rows[0];
};
const expectCode = async (promise, code) => {
  await assert.rejects(
    promise,
    (error) => error instanceof FoundryRuntimeError && error.code === code
  );
};

const targetRef = 'scout-r001:ve-standards-operational-readiness';
const capabilityCode = 'research.evidence.synthesize';
const suffix = randomUUID().replaceAll('-', '');

try {
  const scout = await one(
    `SELECT p.profile_id::text, p.status, p.authority_floor, p.authority_ceiling,
            p.activated_at::text,
            (SELECT count(*)::int
               FROM comind.cm_foundry_capability_grant g
              WHERE g.profile_id=p.profile_id
                AND g.revoked_at IS NULL
                AND (g.expires_at IS NULL OR g.expires_at > clock_timestamp())) AS active_grants
       FROM comind.cm_actor a
       JOIN comind.cm_foundry_agent_profile p ON p.actor_id=a.actor_id
      WHERE a.handle::text='agent.scout'`
  );
  assert.equal(scout.status, 'draft');
  assert.equal(scout.authority_floor, 'C0');
  assert.equal(scout.authority_ceiling, 'C1');
  assert.equal(scout.activated_at, null);
  assert.equal(scout.active_grants, 0);

  const capability = await one(
    `SELECT capability_id::text, capability_code, action, target_kind,
            max_authority, risk_class, cost_bearing, adapter
       FROM comind.cm_foundry_capability
      WHERE capability_code=$1::text`,
    [capabilityCode]
  );
  assert.equal(capability.action, 'synthesize_evidence');
  assert.equal(capability.target_kind, 'research_assignment');
  assert.equal(capability.max_authority, 'C1');
  assert.equal(capability.risk_class, 'low');
  assert.equal(capability.cost_bearing, false);
  assert.equal(capability.adapter, 'ollama_local');

  const org = await one(
    `SELECT org_id::text FROM comind.cm_org WHERE slug::text='comind'`
  );
  const approver = await one(
    `SELECT actor_id::text FROM comind.cm_actor
      WHERE org_id=$1::uuid AND handle::text='joseph.hogarth' AND kind='person'`,
    [org.org_id]
  );
  const project = await one(
    `SELECT project_id::text FROM comind.cm_project
      WHERE org_id=$1::uuid AND slug::text='comind' AND status='active'`,
    [org.org_id]
  );
  const task = await one(
    `INSERT INTO comind.cm_task(project_id,title,status)
     VALUES($1::uuid,'SCOUT-002 isolated C1 research acceptance','in_progress')
     RETURNING task_id::text`,
    [project.project_id]
  );
  const actor = await one(
    `INSERT INTO comind.cm_actor(org_id,kind,handle,display_name)
     VALUES($1::uuid,'agent',$2::text,'SCOUT-002 Acceptance Probe')
     RETURNING actor_id::text`,
    [org.org_id, `agent.scout002.acceptance.${suffix}`]
  );
  const agent = await one(
    `INSERT INTO comind.cm_agent(org_id,name,description,config)
     VALUES($1::uuid,$2::text,'Disposable isolated acceptance probe for SCOUT-002',
            jsonb_build_object('control_id','SCOUT-002','test_fixture',true,'paid_provider_authorized',false,'production_mutation_authorized',false))
     RETURNING agent_id::text`,
    [org.org_id, `SCOUT-002 Acceptance Probe ${suffix}`]
  );
  const profile = await one(
    `INSERT INTO comind.cm_foundry_agent_profile(
       agent_id,actor_id,org_id,role_code,display_name,
       authority_floor,authority_ceiling,instruction_version,
       runtime_defaults,competencies,status,activated_at
     ) VALUES(
       $1::uuid,$2::uuid,$3::uuid,'scout002_acceptance_probe','SCOUT-002 Acceptance Probe',
       'C0','C1','scout-002.acceptance.v0.1',
       jsonb_build_object('execution_mode','isolated','provider','ollama_local','model','qwen3:0.6b','paid_provider_allowed',false,'production_target_allowed',false),
       jsonb_build_array('evidence_synthesis'),'active',clock_timestamp()
     ) RETURNING profile_id::text`,
    [agent.agent_id, actor.actor_id, org.org_id]
  );
  const grant = await one(
    `INSERT INTO comind.cm_foundry_capability_grant(
       profile_id,capability_id,org_id,project_id,environment,
       authority_ceiling,scope,granted_by_actor_id,grant_reason,expires_at
     ) VALUES(
       $1::uuid,$2::uuid,$3::uuid,$4::uuid,'isolated',
       'C1',$5::jsonb,$6::uuid,
       'SCOUT-002 isolated exact-target one-task acceptance proof',
       clock_timestamp()+interval '1 hour'
     ) RETURNING grant_id::text`,
    [
      profile.profile_id,
      capability.capability_id,
      org.org_id,
      project.project_id,
      JSON.stringify({ target_refs: [targetRef], max_tasks: 1 }),
      approver.actor_id,
    ]
  );

  const createAuthorization = async ({ target = targetRef, authority = 'C1' } = {}) => {
    const request = await one(
      `INSERT INTO comind.cm_foundry_authorization_request(
         requesting_profile_id,requesting_actor_id,capability_id,
         project_id,task_id,authority_level,environment,target_kind,target_ref,
         reason,expires_at
       ) VALUES(
         $1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6::text,
         'isolated','research_assignment',$7::text,
         'SCOUT-002 isolated execution authorization',clock_timestamp()+interval '30 minutes'
       ) RETURNING authorization_request_id::text`,
      [profile.profile_id, actor.actor_id, capability.capability_id, project.project_id, task.task_id, authority, target]
    );
    const decision = await one(
      `INSERT INTO comind.cm_foundry_authorization_decision(
         authorization_request_id,decision,decided_by_actor_id,decision_basis,effective_until
       ) VALUES(
         $1::uuid,'approved',$2::uuid,'SCOUT-002 isolated acceptance decision',clock_timestamp()+interval '30 minutes'
       ) RETURNING authorization_decision_id::text`,
      [request.authorization_request_id, approver.actor_id]
    );
    return decision.authorization_decision_id;
  };

  let adapterCalls = 0;
  const registry = new FoundryAdapterRegistry();
  registry.register('ollama_local', async (request) => {
    adapterCalls += 1;
    assert.equal(request.capabilityCode, capabilityCode);
    assert.equal(request.action, 'synthesize_evidence');
    assert.equal(request.authorityLevel, 'C1');
    assert.equal(request.targetKind, 'research_assignment');
    assert.equal(request.targetRef, targetRef);
    assert.equal(request.input.assignment_id, 'SCOUT-R001');
    assert.equal(request.input.evidence_contract, 'SCOUT-002-EVIDENCE');
    assert.equal(request.input.provider, 'ollama_local');
    assert.equal(request.input.model, 'qwen3:0.6b');
    assert.equal(request.input.cost_usd_max, 0);
    return {
      status: 'succeeded',
      resultRef: `ollama-local://qwen3:0.6b/${request.requestFingerprint}`,
      summary: 'SCOUT-002 isolated supplied-evidence synthesis completed for governed human review.',
    };
  });
  const orchestrator = new FoundryRuntimeOrchestrator(query, registry);

  const successDecision = await createAuthorization();
  const successRequest = {
    profileId: profile.profile_id,
    capabilityCode,
    authorizationDecisionId: successDecision,
    authorityLevel: 'C1',
    environment: 'isolated',
    targetKind: 'research_assignment',
    targetRef,
    projectId: project.project_id,
    taskId: task.task_id,
    budgetBindingId: null,
    idempotencyKey: `scout-002-success-${randomUUID()}`,
    input: {
      assignment_id: 'SCOUT-R001',
      evidence_contract: 'SCOUT-002-EVIDENCE',
      provider: 'ollama_local',
      model: 'qwen3:0.6b',
      supplied_evidence_only: true,
      cost_usd_max: 0,
    },
  };

  const success = await orchestrator.execute(successRequest);
  assert.equal(success.terminalStatus, 'succeeded');
  assert.equal(adapterCalls, 1);
  assert.match(success.resultRef, /^ollama-local:\/\/qwen3:0\.6b\/[0-9a-f]{64}$/);

  const persisted = await one(
    `SELECT ec.budget_binding_id::text,
            c.cost_bearing,
            ao.target_ref,
            ar.terminal_status AS adapter_status,
            eo.terminal_status AS execution_status
       FROM comind.cm_foundry_execution_context ec
       JOIN comind.cm_foundry_capability c ON c.capability_id=ec.capability_id
       JOIN comind.cm_foundry_adapter_operation ao ON ao.execution_context_id=ec.execution_context_id
       JOIN comind.cm_foundry_adapter_operation_result ar ON ar.adapter_operation_id=ao.adapter_operation_id
       JOIN comind.cm_foundry_execution_outcome eo ON eo.execution_context_id=ec.execution_context_id
      WHERE ec.execution_context_id=$1::uuid`,
    [success.executionContextId]
  );
  assert.equal(persisted.budget_binding_id, null);
  assert.equal(persisted.cost_bearing, false);
  assert.equal(persisted.target_ref, targetRef);
  assert.equal(persisted.adapter_status, 'succeeded');
  assert.equal(persisted.execution_status, 'succeeded');

  const secondDecision = await createAuthorization();
  await expectCode(orchestrator.execute({
    ...successRequest,
    authorizationDecisionId: secondDecision,
    idempotencyKey: `scout-002-task-limit-${randomUUID()}`,
  }), 'grant_task_limit_exceeded');

  const wrongTargetDecision = await createAuthorization({ target: 'scout-r999:not-authorized' });
  await expectCode(orchestrator.execute({
    ...successRequest,
    authorizationDecisionId: wrongTargetDecision,
    targetRef: 'scout-r999:not-authorized',
    idempotencyKey: `scout-002-wrong-target-${randomUUID()}`,
  }), 'grant_not_valid');

  const c2Decision = await createAuthorization({ authority: 'C2' });
  await expectCode(orchestrator.execute({
    ...successRequest,
    authorizationDecisionId: c2Decision,
    authorityLevel: 'C2',
    idempotencyKey: `scout-002-c2-${randomUUID()}`,
  }), 'profile_authority_exceeded');

  await pool.query(
    `UPDATE comind.cm_foundry_capability_grant
        SET granted_at=clock_timestamp()-interval '2 minutes',
            expires_at=clock_timestamp()-interval '1 minute'
      WHERE grant_id=$1::uuid`,
    [grant.grant_id]
  );
  const expiredDecision = await createAuthorization();
  await expectCode(orchestrator.execute({
    ...successRequest,
    authorizationDecisionId: expiredDecision,
    idempotencyKey: `scout-002-expired-${randomUUID()}`,
  }), 'grant_not_valid');

  await pool.query(
    `UPDATE comind.cm_foundry_capability_grant
        SET expires_at=clock_timestamp()+interval '1 hour', revoked_at=clock_timestamp()
      WHERE grant_id=$1::uuid`,
    [grant.grant_id]
  );
  const revokedDecision = await createAuthorization();
  await expectCode(orchestrator.execute({
    ...successRequest,
    authorizationDecisionId: revokedDecision,
    idempotencyKey: `scout-002-revoked-${randomUUID()}`,
  }), 'grant_not_valid');

  const scoutAfter = await one(
    `SELECT p.status,p.activated_at::text,
            (SELECT count(*)::int FROM comind.cm_foundry_capability_grant g
              WHERE g.profile_id=p.profile_id
                AND g.revoked_at IS NULL
                AND (g.expires_at IS NULL OR g.expires_at > clock_timestamp())) AS active_grants
       FROM comind.cm_actor a
       JOIN comind.cm_foundry_agent_profile p ON p.actor_id=a.actor_id
      WHERE a.handle::text='agent.scout'`
  );
  assert.equal(scoutAfter.status, 'draft');
  assert.equal(scoutAfter.activated_at, null);
  assert.equal(scoutAfter.active_grants, 0);
  assert.equal(adapterCalls, 1, 'Rejected cases must fail before adapter dispatch');

  console.log(
    'pass|scout-002-runtime|assignment=SCOUT-R001|authority=C1|exact_target=true|max_tasks=1|wrong_target_blocked=true|c2_blocked=true|expired_blocked=true|revoked_blocked=true|cost_usd=0|live_scout=draft_zero_grants'
  );
} finally {
  await pool.end();
}
