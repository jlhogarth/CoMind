import assert from 'node:assert/strict';
import test from 'node:test';

const { MdoModuleMaturityService, MdoModuleMaturityError } = await import('../dist/mdo-module-maturity.js');

const ids = Object.freeze({
  module: '00000000-0000-4000-8000-000000000001',
  plan: '00000000-0000-4000-8000-000000000002',
  actor: '00000000-0000-4000-8000-000000000003',
  authorization: '00000000-0000-4000-8000-000000000004',
  evidenceA: '00000000-0000-4000-8000-000000000005',
  evidenceB: '00000000-0000-4000-8000-000000000006',
});

function validInput(overrides = {}) {
  return {
    moduleId: ids.module,
    planId: ids.plan,
    actorId: ids.actor,
    authorizationDecisionId: ids.authorization,
    targetStage: 'specified',
    rationale: 'Human accepted the evidence-backed specification maturity transition.',
    sourceRef: 'github:issue:407',
    idempotencyKey: 'mdo005:test:specified:1',
    evidenceIds: [ids.evidenceB, ids.evidenceA, ids.evidenceA],
    ...overrides,
  };
}

test('transition delegates one bounded maturity change to the database authority kernel', async () => {
  const calls = [];
  const service = new MdoModuleMaturityService(async (sql, params) => {
    calls.push({ sql, params });
    return {
      rows: [{
        lifecycle_event_id: '00000000-0000-4000-8000-000000000099',
        created: true,
        from_stage: 'conceived',
        to_stage: 'specified',
      }],
    };
  });

  const result = await service.transition(validInput());
  assert.equal(result.created, true);
  assert.equal(result.fromStage, 'conceived');
  assert.equal(result.toStage, 'specified');
  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /comind\.cm_mdo_transition_module_maturity/);
  assert.deepEqual(calls[0].params[8], [ids.evidenceA, ids.evidenceB]);
  assert.equal(calls[0].params[0], ids.module);
  assert.equal(calls[0].params[1], ids.plan);
});

test('unsupported maturity stages fail before database access', async () => {
  let called = false;
  const service = new MdoModuleMaturityService(async () => {
    called = true;
    return { rows: [] };
  });

  await assert.rejects(
    () => service.transition(validInput({ targetStage: 'implemented' })),
    (error) => error instanceof MdoModuleMaturityError && error.code === 'invalid_request'
  );
  assert.equal(called, false);
});

test('canonical evidence is mandatory before database access', async () => {
  let called = false;
  const service = new MdoModuleMaturityService(async () => {
    called = true;
    return { rows: [] };
  });

  await assert.rejects(
    () => service.transition(validInput({ evidenceIds: [] })),
    (error) => error instanceof MdoModuleMaturityError && error.code === 'invalid_request'
  );
  assert.equal(called, false);
});

test('required identifiers and rationale fail closed', async () => {
  const service = new MdoModuleMaturityService(async () => ({ rows: [] }));

  for (const [field, value] of [
    ['moduleId', ''],
    ['planId', '   '],
    ['actorId', ''],
    ['authorizationDecisionId', ''],
    ['rationale', ''],
    ['sourceRef', ''],
    ['idempotencyKey', ''],
  ]) {
    await assert.rejects(
      () => service.transition(validInput({ [field]: value })),
      (error) => error instanceof MdoModuleMaturityError && error.code === 'invalid_request'
    );
  }
});

test('database cardinality anomalies fail closed', async () => {
  const service = new MdoModuleMaturityService(async () => ({ rows: [] }));
  await assert.rejects(
    () => service.transition(validInput()),
    (error) => error instanceof MdoModuleMaturityError && error.code === 'transition_failed'
  );
});
