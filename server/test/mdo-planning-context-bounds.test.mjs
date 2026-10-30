import assert from 'node:assert/strict';
import test from 'node:test';

const { buildMdoPlanningPrompt, MdoPlanningRuntimeError } = await import('../dist/mdo-planning-runtime.js');

function fullChainContext() {
  const priorContributions = Array.from({ length: 9 }, (_, index) => ({
    role_code: `role_${index + 1}`,
    sequence_no: index + 1,
    contribution_id: `${String(index + 1).padStart(8, '0')}-1111-4111-8111-111111111111`,
    evidence_ids: [`${String(index + 1).padStart(8, '0')}-2222-4222-8222-222222222222`],
    payload: {
      schema_version: 'comind.mdo-002.plan-contribution.v1',
      role_code: `role_${index + 1}`,
      deliverable_type: 'bounded_regression_fixture',
      narrative: `Contribution ${index + 1}: ${'evidence-backed planning content '.repeat(80)}`,
      provider_provenance: {
        adapter: 'ollama_local',
        provider: 'ollama_local',
        model: 'qwen3:0.6b',
        upstream_result_ref: `ollama-local://qwen3:0.6b/${'a'.repeat(64)}`,
        prompt_checksum: 'b'.repeat(64),
      },
    },
  }));

  return {
    taskId: '11111111-1111-4111-8111-111111111111',
    planId: '22222222-2222-4222-8222-222222222222',
    moduleId: '33333333-3333-4333-8333-333333333333',
    moduleName: 'Bounded Context Regression Module',
    moduleCode: 'MDO2-BOUNDED',
    lifecycleStage: 'conceived',
    projectId: '44444444-4444-4444-8444-444444444444',
    objective: 'Long governed objective. '.repeat(600),
    targetStage: 'specified',
    planStatus: 'in_review',
    roleCode: 'portfolio_coordinator',
    deliverableType: 'portfolio_coordination',
    sequenceNo: 10,
    requiredCapabilityCode: 'mdo.plan.portfolio',
    priorContributions,
  };
}

test('full ten-role context remains inside the default prompt bound through model-visible projection', () => {
  const prompt = buildMdoPlanningPrompt(fullChainContext());
  assert.ok(prompt.length <= 5900, `prompt length ${prompt.length} exceeded 5900`);
  assert.match(prompt, /objective_truncated/);
  assert.match(prompt, /content_truncated/);
  assert.match(prompt, /evidence_refs/);
  assert.match(prompt, /bounded excerpt/);
  assert.doesNotMatch(prompt, /provider_provenance/);
  assert.doesNotMatch(prompt, /prompt_checksum/);
  assert.doesNotMatch(prompt, /upstream_result_ref/);
});

test('bounded projection still rejects sensitive keys before omission', () => {
  const context = fullChainContext();
  context.priorContributions[0].payload = {
    narrative: 'safe visible narrative',
    credential: 'must-never-enter-model-context',
  };
  assert.throws(
    () => buildMdoPlanningPrompt(context),
    (error) => error instanceof MdoPlanningRuntimeError && error.code === 'sensitive_context_rejected'
  );
});
