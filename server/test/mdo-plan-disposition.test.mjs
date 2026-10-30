import assert from 'node:assert/strict';
import test from 'node:test';

const { MdoPlanDispositionService, MdoPlanDispositionError } = await import('../dist/mdo-plan-disposition.js');

const ids = Object.freeze({
  plan: '00000000-0000-4000-8000-000000000001',
  actor: '00000000-0000-4000-8000-000000000002',
  authorization: '00000000-0000-4000-8000-000000000003',
  evidenceA: '00000000-0000-4000-8000-000000000004',
  evidenceB: '00000000-0000-4000-8000-000000000005',
  successor: '00000000-0000-4000-8000-000000000006',
});

function validInput(overrides = {}) {
  return {
    planId: ids.plan,
    disposition: 'accept',
    actorId: ids.actor,
    authorizationDecisionId: ids.authorization,
    rationale: 'Human reviewed the complete evidence-bearing plan.',
    sourceRef: 'github:issue:377',
    idempotencyKey: 'mdo004:test:accept:1',
    evidenceIds: [ids.evidenceB, ids.evidenceA, ids.evidenceA],
    ...overrides,
  };
}

test('dispose delegates one bounded acceptance to the database authority kernel', async () => {
  const calls = [];
  const service = new MdoPlanDispositionService(async (sql, params) => {
    calls.push({ sql, params });
    return {
      rows: [{
        disposition_event_id: '00000000-0000-4000-8000-000000000099',
        created: true,
        from_status: 'in_review',
        to_status: 'accepted',
      }],
    };
  });

  const result = await service.dispose(validInput());
  assert.equal(result.created, true);
  assert.equal(result.fromStatus, 'in_review');
  assert.equal(result.toStatus, 'accepted');
  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /comind\.cm_mdo_dispose_plan/);
  assert.deepEqual(calls[0].params[8], [ids.evidenceA, ids.evidenceB]);
  assert.equal(calls[0].params[6], null);
});

test('supersede requires and forwards an explicit successor plan', async () => {
  const calls = [];
  const service = new MdoPlanDispositionService(async (sql, params) => {
    calls.push({ sql, params });
    return {
      rows: [{
        disposition_event_id: '00000000-0000-4000-8000-000000000098',
        created: true,
        from_status: 'accepted',
        to_status: 'superseded',
      }],
    };
  });

  const result = await service.dispose(validInput({
    disposition: 'supersede',
    successorPlanId: ids.successor,
    idempotencyKey: 'mdo004:test:supersede:1',
  }));
  assert.equal(result.toStatus, 'superseded');
  assert.equal(calls[0].params[6], ids.successor);
});

test('non-supersede dispositions reject successor authority ambiguity', async () => {
  const service = new MdoPlanDispositionService(async () => ({ rows: [] }));
  await assert.rejects(
    () => service.dispose(validInput({ successorPlanId: ids.successor })),
    (error) => error instanceof MdoPlanDispositionError && error.code === 'invalid_request'
  );
});

test('supersede rejects a missing successor before database access', async () => {
  let called = false;
  const service = new MdoPlanDispositionService(async () => {
    called = true;
    return { rows: [] };
  });
  await assert.rejects(
    () => service.dispose(validInput({ disposition: 'supersede' })),
    (error) => error instanceof MdoPlanDispositionError && error.code === 'invalid_request'
  );
  assert.equal(called, false);
});

test('all dispositions require canonical evidence before database access', async () => {
  let called = false;
  const service = new MdoPlanDispositionService(async () => {
    called = true;
    return { rows: [] };
  });
  await assert.rejects(
    () => service.dispose(validInput({ evidenceIds: [] })),
    (error) => error instanceof MdoPlanDispositionError && error.code === 'invalid_request'
  );
  assert.equal(called, false);
});

test('database cardinality anomalies fail closed', async () => {
  const service = new MdoPlanDispositionService(async () => ({ rows: [] }));
  await assert.rejects(
    () => service.dispose(validInput()),
    (error) => error instanceof MdoPlanDispositionError && error.code === 'disposition_failed'
  );
});
