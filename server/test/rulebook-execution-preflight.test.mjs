import assert from 'node:assert/strict';
import test from 'node:test';

const {
  RulebookExecutionPreflightError,
  createDatabaseRulebookExecutionPreflight,
  runRequiredRulebookExecutionPreflight,
} = await import('../dist/providers/rulebook-execution-preflight.js');
const {
  allowingRulebookEvaluator,
  rulebookProviderInput,
  testRulebookGovernance,
} = await import('./support/rulebook-execution-preflight.mjs');

test('RuleBook provider preflight evaluates C11, C17, then C13 with structured context only', async () => {
  const events = [];
  const input = rulebookProviderInput(events);
  const decisions = await runRequiredRulebookExecutionPreflight(input);

  assert.deepEqual(decisions.map((decision) => decision.control_key), [
    'DRULE-C11',
    'DRULE-C17',
    'DRULE-C13',
  ]);
  assert.deepEqual(events.map((event) => event.controlKey), [
    'DRULE-C11',
    'DRULE-C17',
    'DRULE-C13',
  ]);
  assert.equal(events.every((event) => event.record === true), true);
  assert.deepEqual(events[0].context, {
    untrusted_input: false,
    asks_for_secrets: false,
    authority_escalation: false,
    side_effect: true,
    human_approved: true,
  });
  assert.deepEqual(events[1].context, {
    source_tenant: 'comind-test',
    target_tenant: 'comind-test',
    source_project: 'COMIND',
    target_project: 'COMIND',
    action: 'responses.create',
  });
  assert.deepEqual(events[2].context, {
    asset_key: 'PROVIDER-EXECUTION-TEST-INTERNAL',
    destination_key: 'OPENAI-API',
    region: 'provider-managed',
    tenant_key: 'comind-test',
    purpose: 'provider-execution-test',
    human_approved: true,
  });
});

test('RuleBook provider preflight rejects unsupported raw-sensitive or undeclared governance keys', async () => {
  const governance = {
    ...testRulebookGovernance(),
    prompt: 'this must never enter governance evidence',
  };

  await assert.rejects(
    runRequiredRulebookExecutionPreflight({
      evaluator: allowingRulebookEvaluator(),
      governance,
      binding: rulebookProviderInput().binding,
    }),
    (error) => error instanceof RulebookExecutionPreflightError
      && error.code === 'rulebook_context_invalid'
      && /unsupported keys: prompt/.test(error.message)
  );
});

test('RuleBook provider preflight rejects inconsistent tenant identity before evaluation', async () => {
  const events = [];
  await assert.rejects(
    runRequiredRulebookExecutionPreflight({
      evaluator: allowingRulebookEvaluator(events),
      governance: testRulebookGovernance({ target_tenant: 'other-tenant' }),
      binding: rulebookProviderInput().binding,
    }),
    (error) => error instanceof RulebookExecutionPreflightError
      && error.code === 'rulebook_context_invalid'
      && /tenant_key must match target_tenant/.test(error.message)
  );
  assert.deepEqual(events, []);
});

test('database RuleBook evaluator calls the canonical governance_preflight function and validates identity', async () => {
  const calls = [];
  const evaluator = createDatabaseRulebookExecutionPreflight(async (sql, params) => {
    calls.push({ sql, params });
    return {
      rows: [{
        decision: {
          control_key: 'DRULE-C13',
          decision: 'allow',
          reason_code: 'ALLOW',
          reason: 'Synthetic canonical function proof.',
          evaluated_at: '2026-10-29T00:00:00.000Z',
        },
      }],
    };
  });

  const decision = await evaluator.evaluate('DRULE-C13', {
    asset_key: 'PROVIDER-EXECUTION-TEST-INTERNAL',
    destination_key: 'OPENAI-API',
    region: 'provider-managed',
    tenant_key: 'comind-test',
    purpose: 'provider-execution-test',
    human_approved: true,
  }, true);

  assert.equal(decision.control_key, 'DRULE-C13');
  assert.equal(decision.decision, 'allow');
  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /comind_pm\.governance_preflight/);
  assert.equal(calls[0].params[0], 'DRULE-C13');
  assert.equal(calls[0].params[2], true);
  assert.equal(JSON.parse(calls[0].params[1]).destination_key, 'OPENAI-API');
});

test('RuleBook preflight review is a hard automation stop, not an implicit allow', async () => {
  const input = rulebookProviderInput();
  await assert.rejects(
    runRequiredRulebookExecutionPreflight({
      ...input,
      evaluator: {
        async evaluate(controlKey) {
          return {
            control_key: controlKey,
            decision: controlKey === 'DRULE-C13' ? 'review' : 'allow',
            reason_code: controlKey === 'DRULE-C13' ? 'HUMAN_REVIEW_REQUIRED' : 'ALLOW',
            reason: 'Synthetic review boundary proof.',
          };
        },
      },
    }),
    (error) => error instanceof RulebookExecutionPreflightError
      && error.code === 'rulebook_preflight_blocked'
      && error.controlKey === 'DRULE-C13'
      && error.decision === 'review'
  );
});
