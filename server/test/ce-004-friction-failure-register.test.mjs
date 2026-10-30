import test from 'node:test';
import assert from 'node:assert/strict';

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';
const SIGNAL_ID = '22222222-2222-4222-8222-222222222222';
const EVENT_ID = '33333333-3333-4333-8333-333333333333';

const modulePromise = import('../dist/continuous-excellence/friction-failure.js');

function registerRow(overrides = {}) {
  return {
    signal_id: SIGNAL_ID,
    project_id: PROJECT_ID,
    task_id: null,
    actor_id: null,
    signal_type: 'failure',
    severity: 'high',
    requires_action: true,
    summary: 'Synthetic failure',
    details: { fixture: true },
    signal_source_system: 'github',
    signal_source_ref: 'run:1',
    idempotency_key: 'signal-1',
    observed_at: '2026-10-30T10:00:00.000Z',
    signal_created_at: '2026-10-30T10:00:00.000Z',
    current_state: 'triaged',
    latest_event_id: EVENT_ID,
    latest_event_summary: 'Triaged',
    latest_event_source_system: 'continuous_excellence',
    latest_event_source_ref: 'ce004://triage',
    latest_event_at: '2026-10-30T10:01:00.000Z',
    owner_actor_id: null,
    recurrence_risk: 'high',
    pattern_key: 'provider-timeout',
    pattern_occurrence_count: 2,
    linked_improvement_count: 0,
    open_action: true,
    improvement_review_recommended: true,
    ...overrides,
  };
}

test('read-only register load uses the CE-004 projection and performs no mutation', async () => {
  const { loadFrictionFailureRegister } = await modulePromise;
  const sql = [];
  const query = async (text, params = []) => {
    sql.push({ text, params });
    assert.match(text, /FROM comind\.v_ce_friction_failure_register/);
    assert.doesNotMatch(text, /record_ce_signal_event|INSERT|UPDATE|DELETE/i);
    return { rows: [registerRow()] };
  };

  const rows = await loadFrictionFailureRegister(query, { projectId: PROJECT_ID });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].signalId, SIGNAL_ID);
  assert.equal(rows[0].currentState, 'triaged');
  assert.equal(rows[0].improvementReviewRecommended, true);
  assert.equal(sql.length, 1);
  assert.deepEqual(sql[0].params, [PROJECT_ID]);
});

test('register assessment is deterministic and distinguishes active, terminal, untriaged, and improvement-review states', async () => {
  const { assessFrictionFailureRegister } = await modulePromise;
  const rows = [
    registerRow(),
    registerRow({
      signal_id: '44444444-4444-4444-8444-444444444444',
      current_state: 'untriaged',
      latest_event_id: null,
      pattern_key: null,
      pattern_occurrence_count: 0,
      recurrence_risk: null,
      improvement_review_recommended: false,
    }),
    registerRow({
      signal_id: '55555555-5555-4555-8555-555555555555',
      current_state: 'resolved',
      open_action: false,
      improvement_review_recommended: false,
    }),
  ];

  const result = assessFrictionFailureRegister(rows);
  assert.deepEqual(result, {
    total: 3,
    openActionCount: 2,
    untriagedCount: 1,
    terminalCount: 1,
    improvementReviewCount: 1,
    recommendedSignalIds: [SIGNAL_ID],
  });
});

test('lifecycle writer validates explicit inputs before any database call', async () => {
  const { recordFrictionFailureEvent } = await modulePromise;
  let calls = 0;
  const query = async () => { calls += 1; return { rows: [] }; };

  await assert.rejects(
    () => recordFrictionFailureEvent(query, {
      signalId: SIGNAL_ID,
      eventType: 'triaged',
      recurrenceRisk: null,
      patternKey: 'provider-timeout',
      summary: 'Invalid triage',
      details: {},
      sourceSystem: 'continuous_excellence',
      sourceRef: 'ce004://triage',
      idempotencyKey: 'triage-1',
    }),
    /triaged event requires recurrenceRisk/,
  );

  await assert.rejects(
    () => recordFrictionFailureEvent(query, {
      signalId: 'not-a-uuid',
      eventType: 'triaged',
      recurrenceRisk: 'moderate',
      patternKey: null,
      summary: 'Invalid signal identity',
      details: {},
      sourceSystem: 'continuous_excellence',
      sourceRef: 'ce004://triage',
      idempotencyKey: 'triage-2',
    }),
    /Invalid CE-004 signal id/,
  );

  await assert.rejects(
    () => recordFrictionFailureEvent(query, {
      signalId: SIGNAL_ID,
      eventType: 'closed_no_action',
      recurrenceRisk: 'low',
      patternKey: null,
      summary: 'Invalid closure',
      details: { disposition_reason: 'bounded' },
      sourceSystem: 'continuous_excellence',
      sourceRef: null,
      idempotencyKey: 'close-1',
    }),
    /terminal event requires sourceRef/,
  );

  assert.equal(calls, 0);
});

test('lifecycle writer uses the constrained database function then returns authoritative register readback', async () => {
  const { recordFrictionFailureEvent } = await modulePromise;
  const calls = [];
  const query = async (text, params = []) => {
    calls.push({ text, params });
    if (text.includes('record_ce_signal_event')) {
      return { rows: [{ event_id: EVENT_ID }] };
    }
    if (text.includes('v_ce_friction_failure_register')) {
      return { rows: [registerRow()] };
    }
    throw new Error(`Unexpected SQL: ${text}`);
  };

  const result = await recordFrictionFailureEvent(query, {
    signalId: SIGNAL_ID,
    actorId: null,
    ownerActorId: null,
    eventType: 'triaged',
    recurrenceRisk: 'high',
    patternKey: 'provider-timeout',
    summary: 'Triaged explicit provider-timeout pattern',
    details: { basis: 'exact failure evidence' },
    sourceSystem: 'continuous_excellence',
    sourceRef: 'ce004://triage',
    idempotencyKey: 'triage-provider-timeout',
  });

  assert.equal(result.eventId, EVENT_ID);
  assert.equal(result.register.signalId, SIGNAL_ID);
  assert.equal(calls.length, 2);
  assert.match(calls[0].text, /comind\.record_ce_signal_event/);
  assert.deepEqual(calls[0].params, [
    SIGNAL_ID,
    null,
    null,
    'triaged',
    'high',
    'provider-timeout',
    'Triaged explicit provider-timeout pattern',
    JSON.stringify({ basis: 'exact failure evidence' }),
    'continuous_excellence',
    'ce004://triage',
    'triage-provider-timeout',
  ]);
  assert.match(calls[1].text, /WHERE signal_id=\$1::uuid/);
});

test('register loader rejects unknown project identity rather than widening scope', async () => {
  const { loadFrictionFailureRegister } = await modulePromise;
  let calls = 0;
  const query = async () => { calls += 1; return { rows: [] }; };
  await assert.rejects(
    () => loadFrictionFailureRegister(query, { projectId: 'unknown' }),
    /Invalid CE-004 project id/,
  );
  assert.equal(calls, 0);
});
