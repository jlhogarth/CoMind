import test from 'node:test';
import assert from 'node:assert/strict';
import { assessTwinPromotion, TWIN_PROMOTION_POLICY_VERSION } from '../dist/epistemic/twin-promotion.js';

const candidate = {
  subjectRef: 'synthetic:test-subject-a', purpose: 'synthetic:assistant-use',
  sourceClass: 'explicit_user', sourceRefs: ['synthetic:source-01'],
  evidenceRefs: ['synthetic:evidence-01'], status: 'candidate', sensitive: false,
};
const context = {
  identity: { verified: true, subjectRef: candidate.subjectRef, actorRef: 'synthetic:actor-a', evidenceRef: 'synthetic:identity-receipt' },
  consent: { decision: 'allow', liveVerified: true, subjectRef: candidate.subjectRef, purpose: candidate.purpose,
    evidenceRef: 'synthetic:consent-receipt' },
  access: { decision: 'allow', liveVerified: true, subjectRef: candidate.subjectRef, evidenceRef: 'synthetic:access-receipt' },
  approval: { approved: false, actorRef: '', authorityRef: '' },
};
const assess = (c = candidate, x = context) => assessTwinPromotion(c, x);

test('versioned gate requires independent live identity, consent and access inputs', () => {
  assert.equal(TWIN_PROMOTION_POLICY_VERSION, 'ger-005-v1');
  assert.equal(assess().readyForDurablePromotion, true); // Input-contract unit case, no live decision made.
  for (const change of [
    { consent: { ...context.consent, liveVerified: false } },
    { consent: { ...context.consent, decision: 'deny' } },
    { access: { ...context.access, decision: 'deny' } },
    { identity: { ...context.identity, subjectRef: 'synthetic:test-subject-b' } },
  ]) assert.equal(assess(candidate, { ...context, ...change }).readyForDurablePromotion, false);
});

test('simulation, stale, contradicted and restricted assertions fail closed', () => {
  for (const change of [
    { sourceClass: 'simulated' }, { status: 'superseded' },
    { status: 'contradicted' }, { status: 'restricted' },
  ]) assert.equal(assess({ ...candidate, ...change }).readyForDurablePromotion, false);
});

test('inference needs source lineage, method, uncertainty, reopening and bound human approval', () => {
  const inferred = { ...candidate, sourceClass: 'inferred', inferenceMethodVersion: 'synthetic:method-v1',
    uncertaintyBasis: 'Synthetic example, not calibrated', reopeningCondition: 'User correction' };
  assert.equal(assess(inferred).readyForDurablePromotion, false);
  assert.equal(assess({ ...inferred, inferenceMethodVersion: '' }, { ...context,
    approval: { approved: true, actorRef: context.identity.actorRef, authorityRef: 'synthetic:approval' } }).readyForDurablePromotion, false);
  assert.equal(assess(inferred, { ...context,
    approval: { approved: true, actorRef: context.identity.actorRef, authorityRef: 'synthetic:approval' } }).readyForDurablePromotion, true);
});

test('sensitive claims require human approval even when explicitly sourced', () => {
  assert.equal(assess({ ...candidate, sensitive: true }).readyForDurablePromotion, false);
});

test('missing data and unknown provenance cannot be normalized to permission', () => {
  assert.equal(assess({ ...candidate, evidenceRefs: [] }).readyForDurablePromotion, false);
  assert.equal(assess({ ...candidate, sourceClass: 'inferred', sourceRefs: ['synthetic:source-01', 'synthetic:source-01'] }).readyForDurablePromotion, false);
  assert.equal(assess({ ...candidate, sourceClass: 'novel' }).readyForDurablePromotion, false);
  assert.equal(assess(candidate, null).readyForDurablePromotion, false);
});
