import test from 'node:test';
import assert from 'node:assert/strict';
import { routeCompute } from '../dist/compute-router.js';

const baseRoutes = () => ({
  LOCAL: { available: true, sufficient: true, qualityScore: 80, maxSensitivity: 'restricted', estimatedCostUsd: 0, costEvidence: 'not_required' },
  API_BATCH: { available: true, sufficient: true, qualityScore: 90, maxSensitivity: 'confidential', estimatedCostUsd: 0.05, costEvidence: 'fresh' },
  API_REALTIME: { available: true, sufficient: true, qualityScore: 95, maxSensitivity: 'confidential', estimatedCostUsd: 0.1, costEvidence: 'fresh' },
  CHAT_WORK: { available: true, sufficient: true, qualityScore: 98, maxSensitivity: 'confidential', estimatedCostUsd: 0.2, costEvidence: 'fresh' },
});

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
