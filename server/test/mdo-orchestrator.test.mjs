import assert from 'node:assert/strict';
import test from 'node:test';

const {
  MdoOrchestrator,
  MdoOrchestratorError,
  MDO_ROLE_CAPABILITIES,
} = await import('../dist/mdo-orchestrator.js');

const MODULE_ID = '11111111-1111-4111-8111-111111111111';
const PROJECT_ID = '22222222-2222-4222-8222-222222222222';
const REQUESTER_ID = '33333333-3333-4333-8333-333333333333';
const DECISION_ID = '44444444-4444-4444-8444-444444444444';
const PLAN_ID = '55555555-5555-4555-8555-555555555555';
const TASK_ID = '66666666-6666-4666-8666-666666666666';
const PROFILE_ID = '77777777-7777-4777-8777-777777777777';
const LEASE_TOKEN = '88888888-8888-4888-8888-888888888888';
const EXECUTION_CONTEXT_ID = '99999999-9999-4999-8999-999999999999';
const CONTRIBUTION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const enqueueInput = Object.freeze({
  moduleId: MODULE_ID,
  projectId: PROJECT_ID,
  requestedByActorId: REQUESTER_ID,
  authorizationDecisionId: DECISION_ID,
  objective: 'Create a governed detailed implementation plan.',
  idempotencyKey: 'mdo-unit-plan-1',
});

test('MDO planning role map covers the ten canonical planning roles without implementation authority', () => {
  assert.equal(Object.keys(MDO_ROLE_CAPABILITIES).length, 10);
  assert.equal(MDO_ROLE_CAPABILITIES.module_planner, 'mdo.plan.analyze');
  assert.equal(MDO_ROLE_CAPABILITIES.architecture_analyst, 'mdo.plan.analyze');
  assert.equal(MDO_ROLE_CAPABILITIES.external_capability_scout, 'mdo.plan.research');
  assert.equal(MDO_ROLE_CAPABILITIES.lessons_learned_analyst, 'mdo.plan.research');
  assert.equal(MDO_ROLE_CAPABILITIES.dependency_analyst, 'mdo.plan.analyze');
  assert.equal(MDO_ROLE_CAPABILITIES.governance_reviewer, 'mdo.plan.review');
  assert.equal(MDO_ROLE_CAPABILITIES.assumption_validator, 'mdo.plan.review');
  assert.equal(MDO_ROLE_CAPABILITIES.integration_reviewer, 'mdo.plan.review');
  assert.equal(MDO_ROLE_CAPABILITIES.plan_synthesizer, 'mdo.plan.synthesize');
  assert.equal(MDO_ROLE_CAPABILITIES.portfolio_coordinator, 'mdo.plan.portfolio');
  for (const capability of Object.values(MDO_ROLE_CAPABILITIES)) {
    assert.match(capability, /^mdo\.plan\./);
    assert.ok(!capability.includes('deploy'));
    assert.ok(!capability.includes('merge'));
    assert.ok(!capability.includes('production'));
  }
});

test('enqueuePlan delegates to the exact governed database envelope and returns the durable plan', async () => {
  const calls = [];
  const queryFn = async (sql, params = []) => {
    calls.push({ sql, params });
    if (sql.includes('cm_mdo_enqueue_plan')) {
      return { rows: [{ plan_id: PLAN_ID, created: true, task_count: 10 }] };
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  };

  const orchestrator = new MdoOrchestrator(queryFn);
  const result = await orchestrator.enqueuePlan(enqueueInput);

  assert.deepEqual(result, { planId: PLAN_ID, created: true, taskCount: 10 });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].params, [
    MODULE_ID,
    PROJECT_ID,
    REQUESTER_ID,
    DECISION_ID,
    enqueueInput.objective,
    enqueueInput.idempotencyKey,
  ]);
  assert.match(calls[0].sql, /cm_mdo_enqueue_plan/);
});

test('enqueuePlan fails closed if the database does not return exactly one plan', async () => {
  const orchestrator = new MdoOrchestrator(async () => ({ rows: [] }));
  await assert.rejects(
    () => orchestrator.enqueuePlan(enqueueInput),
    (error) => error instanceof MdoOrchestratorError && error.code === 'enqueue_failed'
  );
});

test('claimWork returns null when no capability-eligible MDO task exists', async () => {
  const queryFn = async (sql) => {
    assert.match(sql, /cm_mdo_claim_work/);
    return { rows: [] };
  };
  const orchestrator = new MdoOrchestrator(queryFn);
  const result = await orchestrator.claimWork({
    profileId: PROFILE_ID,
    workerInstanceId: 'mdo-worker-unit',
  });
  assert.equal(result, null);
});

test('claimWork returns one fenced capability-aware lease', async () => {
  const queryFn = async (sql, params) => {
    assert.match(sql, /cm_mdo_claim_work/);
    assert.deepEqual(params, [PROFILE_ID, 'mdo-worker-unit', 90]);
    return {
      rows: [{
        task_id: TASK_ID,
        lease_token: LEASE_TOKEN,
        fencing_epoch: '3',
        lease_expires_at: '2099-01-01T00:00:00.000Z',
        plan_id: PLAN_ID,
        capability_code: 'mdo.plan.analyze',
      }],
    };
  };
  const orchestrator = new MdoOrchestrator(queryFn);
  const result = await orchestrator.claimWork({
    profileId: PROFILE_ID,
    workerInstanceId: 'mdo-worker-unit',
    leaseSeconds: 90,
  });

  assert.deepEqual(result, {
    taskId: TASK_ID,
    leaseToken: LEASE_TOKEN,
    fencingEpoch: 3,
    leaseExpiresAt: '2099-01-01T00:00:00.000Z',
    planId: PLAN_ID,
    capabilityCode: 'mdo.plan.analyze',
  });
});

test('loadTaskContext exposes prior governed contributions without inventing missing evidence', async () => {
  const queryFn = async (sql, params) => {
    assert.match(sql, /prior_contributions/);
    assert.deepEqual(params, [TASK_ID]);
    return {
      rows: [{
        task_id: TASK_ID,
        plan_id: PLAN_ID,
        module_id: MODULE_ID,
        module_name: 'ThreadKeeper',
        module_code: 'TK',
        lifecycle_stage: 'operational',
        project_id: PROJECT_ID,
        objective: enqueueInput.objective,
        target_stage: 'specified',
        plan_status: 'in_review',
        role_code: 'governance_reviewer',
        deliverable_type: 'governance_review',
        sequence_no: '6',
        required_capability_code: 'mdo.plan.review',
        prior_contributions: [{
          role_code: 'module_planner',
          sequence_no: 1,
          payload: { requirements: ['reuse existing substrate'] },
          contribution_id: CONTRIBUTION_ID,
          evidence_ids: [],
        }],
      }],
    };
  };

  const orchestrator = new MdoOrchestrator(queryFn);
  const context = await orchestrator.loadTaskContext(TASK_ID);

  assert.equal(context.roleCode, 'governance_reviewer');
  assert.equal(context.sequenceNo, 6);
  assert.equal(context.requiredCapabilityCode, 'mdo.plan.review');
  assert.equal(context.priorContributions.length, 1);
  assert.deepEqual(context.priorContributions[0].evidence_ids, []);
});

test('submitContribution preserves execution-context and evidence lineage', async () => {
  const calls = [];
  const queryFn = async (sql, params = []) => {
    calls.push({ sql, params });
    assert.match(sql, /cm_mdo_submit_contribution/);
    return { rows: [{ contribution_id: CONTRIBUTION_ID }] };
  };
  const orchestrator = new MdoOrchestrator(queryFn);
  const result = await orchestrator.submitContribution({
    taskId: TASK_ID,
    profileId: PROFILE_ID,
    executionContextId: EXECUTION_CONTEXT_ID,
    payload: {
      purpose: 'Produce the planning contribution.',
      risks: ['unauthorized capability escalation'],
    },
    idempotencyKey: 'mdo-unit-contribution-1',
    evidenceIds: [MODULE_ID],
  });

  assert.equal(result, CONTRIBUTION_ID);
  assert.deepEqual(calls[0].params.slice(0, 3), [TASK_ID, PROFILE_ID, EXECUTION_CONTEXT_ID]);
  assert.equal(calls[0].params[4], 'mdo-unit-contribution-1');
  assert.deepEqual(calls[0].params[5], [MODULE_ID]);
  assert.deepEqual(JSON.parse(calls[0].params[3]), {
    purpose: 'Produce the planning contribution.',
    risks: ['unauthorized capability escalation'],
  });
});

test('input validation rejects empty identifiers, empty payloads, and invalid lease durations before database access', async () => {
  let calls = 0;
  const orchestrator = new MdoOrchestrator(async () => {
    calls += 1;
    return { rows: [] };
  });

  await assert.rejects(
    () => orchestrator.enqueuePlan({ ...enqueueInput, moduleId: ' ' }),
    (error) => error instanceof MdoOrchestratorError && error.code === 'invalid_request'
  );
  await assert.rejects(
    () => orchestrator.claimWork({ profileId: PROFILE_ID, workerInstanceId: 'worker', leaseSeconds: 301 }),
    (error) => error instanceof MdoOrchestratorError && error.code === 'invalid_request'
  );
  await assert.rejects(
    () => orchestrator.submitContribution({
      taskId: TASK_ID,
      profileId: PROFILE_ID,
      executionContextId: EXECUTION_CONTEXT_ID,
      payload: {},
      idempotencyKey: 'mdo-empty-payload',
    }),
    (error) => error instanceof MdoOrchestratorError && error.code === 'invalid_request'
  );
  assert.equal(calls, 0);
});
