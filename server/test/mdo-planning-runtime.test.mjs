import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';

const {
  MdoPlanningRuntimeError,
  MdoPlanningWorker,
  buildMdoPlanningPrompt,
  createMdoFoundryAdapter,
} = await import('../dist/mdo-planning-runtime.js');

const ids = {
  task: '11111111-1111-4111-8111-111111111111',
  plan: '22222222-2222-4222-8222-222222222222',
  module: '33333333-3333-4333-8333-333333333333',
  project: '44444444-4444-4444-8444-444444444444',
  profile: '55555555-5555-4555-8555-555555555555',
  evidence: '66666666-6666-4666-8666-666666666666',
  execution: '77777777-7777-4777-8777-777777777777',
  operation: '88888888-8888-4888-8888-888888888888',
  operationResult: '99999999-9999-4999-8999-999999999999',
  outcome: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  recovery: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  lease: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  decision: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
};

function context(overrides = {}) {
  return {
    taskId: ids.task,
    planId: ids.plan,
    moduleId: ids.module,
    moduleName: 'FocusForge',
    moduleCode: 'FOCUS',
    lifecycleStage: 'conceived',
    projectId: ids.project,
    objective: 'Produce a governed implementation plan.',
    targetStage: 'specified',
    planStatus: 'queued',
    roleCode: 'module_planner',
    deliverableType: 'module_specification',
    sequenceNo: 1,
    requiredCapabilityCode: 'mdo.plan.analyze',
    priorContributions: [],
    ...overrides,
  };
}

test('planning prompt is bounded, role-specific, and rejects sensitive prior context', () => {
  const prompt = buildMdoPlanningPrompt(context());
  assert.match(prompt, /FocusForge/);
  assert.match(prompt, /module_planner/);
  assert.match(prompt, /Do not invent evidence/);
  assert.ok(prompt.length < 5900);

  assert.throws(
    () => buildMdoPlanningPrompt(context({
      priorContributions: [{ payload: { api_key: 'never expose this' } }],
    })),
    (error) => error instanceof MdoPlanningRuntimeError && error.code === 'sensitive_context_rejected'
  );
});

test('MDO adapter delegates through configured provider adapter and stores output in canonical evidence', async () => {
  const calls = [];
  let providerRequest;
  const queryFn = async (sql, params = []) => {
    calls.push({ sql, params });
    if (sql.includes('FROM comind.cm_foundry_execution_context ec')) {
      return { rows: [{
        profile_id: ids.profile,
        task_id: ids.task,
        project_id: ids.project,
        runtime_defaults: {
          mdo_inference: { adapter: 'fake_inference', provider: 'fake-provider', model: 'fake-model-1' },
        },
      }] };
    }
    if (sql.includes("source_type = 'mdo_provider_output'") && sql.includes('source_ref =')) {
      return { rows: [] };
    }
    if (sql.includes('INSERT INTO comind.cm_evidence')) {
      return { rows: [{ evidence_id: ids.evidence }] };
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  };
  const inferenceRegistry = {
    resolve(code) {
      assert.equal(code, 'fake_inference');
      return async (request) => {
        providerRequest = request;
        return {
          status: 'succeeded',
          resultRef: 'fake-provider://fake-model-1/result-1',
          summary: 'Requirements: reuse Foundry and MDO evidence. Risk: uncontrolled authority expansion.',
        };
      };
    },
  };
  const adapter = createMdoFoundryAdapter({
    queryFn,
    inferenceRegistry,
    mdo: { loadTaskContext: async () => context() },
  });
  const result = await adapter({
    executionContextId: ids.execution,
    adapterOperationId: ids.operation,
    capabilityCode: 'mdo.plan.analyze',
    action: 'analyze_module',
    authorityLevel: 'C1',
    targetKind: 'module_plan',
    targetRef: ids.plan,
    requestFingerprint: 'outer-fingerprint',
    input: {},
  });

  assert.equal(result.status, 'succeeded');
  assert.equal(result.resultRef, `comind-evidence://${ids.evidence}`);
  assert.match(providerRequest.input.prompt, /FocusForge/);
  assert.equal(providerRequest.action, 'infer');
  const insert = calls.find((call) => call.sql.includes('INSERT INTO comind.cm_evidence'));
  assert.ok(insert);
  const metadata = JSON.parse(insert.params[3]);
  assert.equal(metadata.provider, 'fake-provider');
  assert.equal(metadata.model, 'fake-model-1');
  assert.equal(metadata.task_id, ids.task);
  assert.equal(metadata.plan_id, ids.plan);
  assert.equal(metadata.output_text.includes('Foundry'), true);
  assert.equal(Object.prototype.hasOwnProperty.call(metadata, 'prompt'), false);
  assert.match(metadata.prompt_checksum, /^[0-9a-f]{64}$/);
});

test('MDO adapter rejects runtime provider overrides and recursive routing', async () => {
  const base = {
    executionContextId: ids.execution,
    adapterOperationId: ids.operation,
    capabilityCode: 'mdo.plan.analyze',
    action: 'analyze_module',
    authorityLevel: 'C1',
    targetKind: 'module_plan',
    targetRef: ids.plan,
    requestFingerprint: 'outer-fingerprint',
    input: {},
  };
  const queryFn = async () => ({ rows: [{
    profile_id: ids.profile,
    task_id: ids.task,
    project_id: ids.project,
    runtime_defaults: { mdo_inference: { adapter: 'mdo', provider: 'self', model: 'self' } },
  }] });
  const adapter = createMdoFoundryAdapter({
    queryFn,
    inferenceRegistry: { resolve() { throw new Error('must not resolve'); } },
    mdo: { loadTaskContext: async () => context() },
  });
  await assert.rejects(
    () => adapter({ ...base, input: { prompt: 'override' } }),
    (error) => error instanceof MdoPlanningRuntimeError && error.code === 'runtime_override_rejected'
  );
  await assert.rejects(
    () => adapter(base),
    (error) => error instanceof MdoPlanningRuntimeError && error.code === 'recursive_provider_configuration'
  );
});

test('planning worker submits evidence-backed contribution before completing and reading back the fenced lease', async () => {
  const sequence = [];
  const outputText = 'Architecture: reuse Foundry lease and evidence substrate.';
  const checksum = createHash('sha256').update(outputText).digest('hex');
  let leaseState = 'leased';
  const queryFn = async (sql, params = []) => {
    if (sql.includes('FROM comind.cm_evidence')) {
      sequence.push('evidence-read');
      return { rows: [{
        evidence_id: ids.evidence,
        checksum,
        metadata: {
          schema_version: 'comind.mdo-002.inference-evidence.v1',
          task_id: ids.task,
          plan_id: ids.plan,
          role_code: 'module_planner',
          deliverable_type: 'module_specification',
          provider_adapter: 'fake_inference',
          provider: 'fake-provider',
          model: 'fake-model-1',
          upstream_result_ref: 'fake://result',
          prompt_checksum: 'f'.repeat(64),
          output_text: outputText,
        },
      }] };
    }
    if (sql.includes('cm_foundry_finish_work')) {
      sequence.push(`finish:${params[4]}`);
      leaseState = params[4] ? 'completed' : 'ready';
      return { rows: [{ ok: true }] };
    }
    if (sql.includes('SELECT state AS lease_state')) {
      sequence.push('lease-readback');
      return { rows: [{ lease_state: leaseState }] };
    }
    if (sql.includes("UPDATE comind.cm_task SET status = 'done'")) {
      sequence.push('task-done');
      return { rows: [] };
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  };
  const mdo = {
    loadTaskContext: async () => context(),
    submitContribution: async (input) => {
      sequence.push('contribution');
      assert.deepEqual(input.evidenceIds, [ids.evidence]);
      assert.equal(input.payload.provider_provenance.model, 'fake-model-1');
      return 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
    },
  };
  const foundryRuntime = {
    execute: async (request) => {
      sequence.push('execute');
      assert.equal(request.taskId, ids.task);
      assert.equal(request.targetRef, ids.plan);
      return {
        executionContextId: ids.execution,
        recoveryCheckpointId: ids.recovery,
        adapterOperationId: ids.operation,
        adapterOperationResultId: ids.operationResult,
        executionOutcomeId: ids.outcome,
        requestFingerprint: 'runtime-fingerprint',
        terminalStatus: 'succeeded',
        resultRef: `comind-evidence://${ids.evidence}`,
        errorCode: null,
      };
    },
  };
  const worker = new MdoPlanningWorker({ queryFn, foundryRuntime, mdo });
  const result = await worker.executeClaim({
    profileId: ids.profile,
    workerInstanceId: 'mdo-unit-worker',
    authorizationDecisionId: ids.decision,
    idempotencyKey: 'mdo-unit-execution-1',
    claim: {
      taskId: ids.task,
      leaseToken: ids.lease,
      fencingEpoch: 1,
      leaseExpiresAt: '2099-01-01T00:00:00Z',
      planId: ids.plan,
      capabilityCode: 'mdo.plan.analyze',
    },
  });
  assert.equal(result.evidenceId, ids.evidence);
  assert.deepEqual(sequence, [
    'execute',
    'evidence-read',
    'contribution',
    'finish:true',
    'lease-readback',
    'task-done',
  ]);
});

test('planning worker releases a failed execution for bounded retry, verifies readback, and submits no contribution', async () => {
  let submitted = false;
  let leaseState = 'leased';
  const queryFn = async (sql, params = []) => {
    if (sql.includes('cm_foundry_finish_work')) {
      assert.equal(params[4], false);
      leaseState = 'ready';
      return { rows: [{ ok: true }] };
    }
    if (sql.includes('SELECT state AS lease_state')) {
      return { rows: [{ lease_state: leaseState }] };
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  };
  const worker = new MdoPlanningWorker({
    queryFn,
    foundryRuntime: { execute: async () => { throw new Error('synthetic provider failure'); } },
    mdo: {
      loadTaskContext: async () => context(),
      submitContribution: async () => { submitted = true; return 'never'; },
    },
  });
  await assert.rejects(
    () => worker.executeClaim({
      profileId: ids.profile,
      workerInstanceId: 'mdo-unit-worker',
      authorizationDecisionId: ids.decision,
      idempotencyKey: 'mdo-unit-execution-failure',
      claim: {
        taskId: ids.task,
        leaseToken: ids.lease,
        fencingEpoch: 1,
        leaseExpiresAt: '2099-01-01T00:00:00Z',
        planId: ids.plan,
        capabilityCode: 'mdo.plan.analyze',
      },
    }),
    /synthetic provider failure/
  );
  assert.equal(submitted, false);
  assert.equal(leaseState, 'ready');
});


test('planning worker preserves original failure identity when retry release fencing is rejected', async () => {
  let diagnosticRead = false;
  const queryFn = async (sql, params = []) => {
    if (sql.includes('cm_foundry_finish_work')) {
      assert.equal(params[4], false);
      return { rows: [{ ok: false }] };
    }
    if (sql.includes('worker_instance_id = $2::text AS worker_matches')) {
      diagnosticRead = true;
      return { rows: [{
        state: 'ready',
        worker_matches: false,
        token_matches: false,
        fencing_epoch: 2,
        epoch_matches: false,
        lease_expires_at: null,
        expired: null,
        attempt_count: 1,
        max_attempts: 3,
      }] };
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  };
  const providerError = Object.assign(new Error('provider payload must not leak'), {
    code: 'ollama_inference_failed',
  });
  const worker = new MdoPlanningWorker({
    queryFn,
    foundryRuntime: { execute: async () => { throw providerError; } },
    mdo: {
      loadTaskContext: async () => context(),
      submitContribution: async () => 'never',
    },
  });
  await assert.rejects(
    () => worker.executeClaim({
      profileId: ids.profile,
      workerInstanceId: 'mdo-unit-worker',
      authorizationDecisionId: ids.decision,
      idempotencyKey: 'mdo-unit-execution-release-failure',
      claim: {
        taskId: ids.task,
        leaseToken: ids.lease,
        fencingEpoch: 1,
        leaseExpiresAt: '2099-01-01T00:00:00Z',
        planId: ids.plan,
        capabilityCode: 'mdo.plan.analyze',
      },
    }),
    (error) => {
      assert.equal(error instanceof MdoPlanningRuntimeError, true);
      assert.equal(error.code, 'execution_release_failed');
      assert.match(error.message, /ollama_inference_failed/);
      assert.match(error.message, /state=ready/);
      assert.match(error.message, /worker_match=false/);
      assert.match(error.message, /epoch_match=false/);
      assert.equal(error.message.includes(ids.lease), false);
      assert.equal(error.message.includes('provider payload must not leak'), false);
      return true;
    }
  );
  assert.equal(diagnosticRead, true);
});
