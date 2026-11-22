import test from 'node:test';
import assert from 'node:assert/strict';
import { routeCompute } from '../dist/compute-router.js';

const baseRoutes = () => ({
  LOCAL: { available: true, sufficient: true, qualityScore: 80, maxSensitivity: 'restricted', estimatedCostUsd: 0, costEvidence: 'not_required' },
  API_BATCH: { available: true, sufficient: true, qualityScore: 90, maxSensitivity: 'confidential', estimatedCostUsd: 0.05, costEvidence: 'fresh', creditBenefit: covered(1) },
  API_REALTIME: { available: true, sufficient: true, qualityScore: 95, maxSensitivity: 'confidential', estimatedCostUsd: 0.1, costEvidence: 'fresh', creditBenefit: covered(1) },
  CHAT_WORK: { available: true, sufficient: true, qualityScore: 98, maxSensitivity: 'confidential', estimatedCostUsd: 0.2, costEvidence: 'fresh' },
});

function covered(remainingUsd) {
  return { state: 'verified_available', sourceReference: 'private-grant-readback', observedAt: '2026-11-22T09:00:00Z',
    expiresAt: '2026-11-23T09:00:00Z', remainingUsd, scopeVerified: true, paidFallbackBlocked: true };
}

function request(overrides = {}) {
  return {
    taskClass: 'test',
    requiresBrowser: false,
    requiresAuthenticatedUi: false,
    requiresHumanInteraction: false,
    deferredAllowed: false,
    maxLatencySeconds: 60,
    bulkWork: false,
    requiredQualityScore: 70,
    riskTier: 'low',
    dataSensitivity: 'internal',
    userImportance: 50,
    humanApprovalRequired: false,
    humanApprovalGranted: false,
    additionalCashApproved: false,
    decisionAt: '2026-11-22T09:01:00Z',
    routes: baseRoutes(),
    ...overrides,
  };
}

test('selects LOCAL when local capability is sufficient', () => {
  const decision = routeCompute(request());
  assert.equal(decision.status, 'ROUTED');
  assert.equal(decision.selectedRoute, 'LOCAL');
});

test('selects API_BATCH for deferred bulk work when local quality is insufficient', () => {
  const routes = baseRoutes();
  routes.LOCAL.qualityScore = 60;
  const decision = routeCompute(request({ deferredAllowed: true, bulkWork: true, maxLatencySeconds: 86400, requiredQualityScore: 85, routes }));
  assert.equal(decision.selectedRoute, 'API_BATCH');
});

test('selects API_REALTIME for synchronous hosted reasoning', () => {
  const routes = baseRoutes();
  routes.LOCAL.sufficient = false;
  const decision = routeCompute(request({ requiredQualityScore: 90, routes }));
  assert.equal(decision.selectedRoute, 'API_REALTIME');
});

test('selects CHAT_WORK only when interactive UI capability is required', () => {
  const decision = routeCompute(request({ requiresBrowser: true, requiresAuthenticatedUi: true }));
  assert.equal(decision.selectedRoute, 'CHAT_WORK');
});

test('fails closed when browser interaction is required but CHAT_WORK is unavailable', () => {
  const routes = baseRoutes();
  routes.CHAT_WORK.available = false;
  const decision = routeCompute(request({ requiresBrowser: true, routes }));
  assert.equal(decision.status, 'BLOCKED');
  assert.equal(decision.escalationReason, 'NO_GOVERNED_ROUTE_AVAILABLE');
});

test('rejects stale cost evidence for metered routes', () => {
  const routes = baseRoutes();
  routes.LOCAL.sufficient = false;
  routes.API_BATCH.costEvidence = 'stale';
  const decision = routeCompute(request({ deferredAllowed: true, bulkWork: true, maxLatencySeconds: 86400, requiredQualityScore: 85, routes }));
  assert.equal(decision.selectedRoute, 'API_REALTIME');
  assert.ok(decision.rejectedRoutes.find((x) => x.route === 'API_BATCH')?.reasons.includes('fresh_cost_evidence_required'));
});

test('fails closed when sensitivity exceeds every eligible route', () => {
  const routes = baseRoutes();
  routes.LOCAL.available = false;
  const decision = routeCompute(request({ dataSensitivity: 'restricted', requiredQualityScore: 90, routes }));
  assert.equal(decision.status, 'BLOCKED');
});

test('critical work blocks before routing without human approval', () => {
  const decision = routeCompute(request({ riskTier: 'critical' }));
  assert.equal(decision.status, 'BLOCKED');
  assert.equal(decision.escalationReason, 'HUMAN_APPROVAL_REQUIRED');
});

test('batch is rejected when latency budget is below the governed completion window', () => {
  const routes = baseRoutes();
  routes.LOCAL.sufficient = false;
  const decision = routeCompute(request({ deferredAllowed: true, bulkWork: true, maxLatencySeconds: 3600, requiredQualityScore: 85, routes }));
  assert.equal(decision.selectedRoute, 'API_REALTIME');
  assert.ok(decision.rejectedRoutes.find((x) => x.route === 'API_BATCH')?.reasons.includes('latency_too_low_for_batch_window'));
});

test('throws on invalid importance instead of silently normalizing it', () => {
  assert.throws(() => routeCompute(request({ userImportance: 101 })), /invalid_userImportance/);
});

test('unknown benefit balance blocks API, without inventing a zero-cost route', () => {
  const routes = baseRoutes();
  routes.LOCAL.sufficient = false;
  delete routes.API_REALTIME.creditBenefit;
  const d = routeCompute(request({ requiredQualityScore: 90, routes }));
  assert.equal(d.status, 'BLOCKED');
  assert.ok(d.rejectedRoutes.find(x => x.route === 'API_REALTIME').reasons.includes('verified_credit_evidence_required'));
});

test('available grant without a paid-fallback stop blocks dispatch recommendation', () => {
  const routes = baseRoutes();
  routes.LOCAL.sufficient = false;
  routes.API_REALTIME.creditBenefit.paidFallbackBlocked = false;
  const d = routeCompute(request({ requiredQualityScore: 90, routes }));
  assert.equal(d.status, 'BLOCKED');
  assert.ok(d.rejectedRoutes.find(x => x.route === 'API_REALTIME').reasons.includes('paid_fallback_not_blocked'));
});

test('partial or expired grant blocks before purchased-credit spillover', () => {
  for (const mutation of [b => { b.remainingUsd = 0.01; }, b => { b.expiresAt = '2026-11-22T09:00:00Z'; }]) {
    const routes = baseRoutes();
    routes.LOCAL.sufficient = false;
    mutation(routes.API_REALTIME.creditBenefit);
    const d = routeCompute(request({ requiredQualityScore: 90, routes }));
    assert.equal(d.status, 'BLOCKED');
    assert.ok(d.rejectedRoutes.find(x => x.route === 'API_REALTIME').reasons.includes('benefit_insufficient_or_expired'));
  }
});

test('stale or wrong-scope evidence cannot authorize benefit usage', () => {
  for (const mutation of [b => { b.observedAt = '2026-11-21T09:00:00Z'; }, b => { b.scopeVerified = false; }]) {
    const routes = baseRoutes();
    routes.LOCAL.sufficient = false;
    mutation(routes.API_REALTIME.creditBenefit);
    const d = routeCompute(request({ requiredQualityScore: 90, routes }));
    assert.equal(d.status, 'BLOCKED');
  }
});

test('documented inapplicability requires separate cash authority', () => {
  const routes = baseRoutes();
  routes.LOCAL.sufficient = false;
  routes.API_REALTIME.creditBenefit = { ...covered(null), state: 'not_applicable', remainingUsd: null };
  assert.equal(routeCompute(request({ requiredQualityScore: 90, routes })).status, 'BLOCKED');
  const approved = routeCompute(request({ requiredQualityScore: 90, routes, additionalCashApproved: true }));
  assert.equal(approved.selectedRoute, 'API_REALTIME');
});

test('covered credit is selected before an authorized cash route if both qualify', () => {
  const routes = baseRoutes();
  routes.LOCAL.sufficient = false;
  routes.API_BATCH.creditBenefit = { ...covered(null), state: 'not_applicable', remainingUsd: null };
  const d = routeCompute(request({ requiredQualityScore: 85, deferredAllowed: true, bulkWork: true,
    maxLatencySeconds: 86400, additionalCashApproved: true, routes }));
  assert.equal(d.selectedRoute, 'API_REALTIME');
});
