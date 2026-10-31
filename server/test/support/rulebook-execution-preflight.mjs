export function testRulebookGovernance(overrides = {}) {
  return Object.freeze({
    asset_key: 'PROVIDER-EXECUTION-TEST-INTERNAL',
    purpose: 'provider-execution-test',
    tenant_key: 'comind-test',
    source_tenant: 'comind-test',
    target_tenant: 'comind-test',
    source_project: 'COMIND',
    target_project: 'COMIND',
    untrusted_input: false,
    asks_for_secrets: false,
    authority_escalation: false,
    human_approved: true,
    ...overrides,
  });
}

export function allowingRulebookEvaluator(events = []) {
  return Object.freeze({
    async evaluate(controlKey, context, record) {
      events.push({ controlKey, context, record });
      return Object.freeze({
        control_key: controlKey,
        decision: 'allow',
        reason_code: 'TEST_ALLOW',
        reason: 'Deterministic unit-test RuleBook allow decision.',
        evaluated_at: '2026-10-29T00:00:00.000Z',
      });
    },
  });
}

export function rulebookProviderInput(events = [], overrides = {}) {
  return Object.freeze({
    evaluator: allowingRulebookEvaluator(events),
    governance: testRulebookGovernance(overrides),
    binding: Object.freeze({
      destination_key: 'OPENAI-API',
      region: 'provider-managed',
      action: 'responses.create',
    }),
  });
}

export function openAIRulebookInput(events = [], overrides = {}) {
  return Object.freeze({
    evaluator: allowingRulebookEvaluator(events),
    governance: testRulebookGovernance(overrides),
  });
}
