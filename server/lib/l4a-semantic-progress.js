import { LIVENESS, AED_LEVEL, classifyLane, clearForShock, latestProgressAt } from './aed-liveness.js';

const TERMINAL = new Set(['done', 'closed', 'cancelled', 'completed']);

function normalizeWorkItem(item) {
  const status = String(item.status || '').toLowerCase();
  const events = Array.isArray(item.events) ? item.events : [];
  return {
    key: item.workKey || item.work_key,
    terminal: TERMINAL.has(status),
    actionable: item.actionable === true,
    owner: item.claim && item.claim.active === true ? item.claim.controller : null,
    events,
    expectedProgressBy: item.expectedProgressBy || item.expected_progress_by || null,
    waiting: item.waiting === true,
    wakeCondition: item.wakeCondition || item.wake_condition || null,
    blocked: item.blocked === true,
    blocker: item.blocker || null,
    blockerOwner: item.blockerOwner || item.blocker_owner || null,
    mandatoryStop: item.mandatoryStop === true,
    stopReason: item.stopReason || null
  };
}

function projectLiveness(item, now = new Date()) {
  const lane = normalizeWorkItem(item);
  const classification = classifyLane(lane, now);
  return {
    workKey: lane.key,
    liveness: classification.state,
    aedLevel: classification.level,
    reason: classification.reason,
    lastProgressAt: latestProgressAt(lane.events),
    lastObservedAt: item.lastObservedAt || item.last_observed_at || null,
    nextAction: item.nextAction || item.next_action || null,
    controller: lane.owner,
    josephActionRequired: item.josephActionRequired === true,
    productionChange: item.productionChange === true
  };
}

function eligibleForDispatch(item, now = new Date()) {
  const projection = projectLiveness(item, now);
  if (!projection.workKey || normalizeWorkItem(item).terminal) return { eligible: false, projection, reason: 'terminal or unidentified work item' };
  if (item.dependenciesValid !== true) return { eligible: false, projection, reason: 'dependencies are not verified valid' };
  if (item.claim && item.claim.active === true) return { eligible: false, projection, reason: 'active claim exists' };
  if (![LIVENESS.STALLED, LIVENESS.ABANDONED].includes(projection.liveness)) return { eligible: false, projection, reason: 'lane is not stalled or abandoned' };
  return { eligible: true, projection, reason: 'dependency-valid unclaimed lane requires recovery dispatch' };
}

function claimLane(item, controller, now = new Date(), leaseMs = 30 * 60 * 1000) {
  const eligibility = eligibleForDispatch(item, now);
  if (!eligibility.eligible) return { claimed: false, ...eligibility };
  if (!controller) return { claimed: false, projection: eligibility.projection, reason: 'controller identity required' };
  const at = now instanceof Date ? now : new Date(now);
  return {
    claimed: true,
    projection: eligibility.projection,
    claim: {
      controller,
      active: true,
      claimedAt: at.toISOString(),
      expiresAt: new Date(at.getTime() + leaseMs).toISOString(),
      workKey: eligibility.projection.workKey
    }
  };
}

function planRecovery(item, safety, controller, now = new Date()) {
  const claim = claimLane(item, controller, now);
  if (!claim.claimed) return { action: 'NO_DISPATCH', reason: claim.reason, projection: claim.projection };
  const clear = clearForShock(safety || {});
  if (!clear.clear) return { action: 'ESCALATE_OR_HOLD', claim: claim.claim, failedSafety: clear.failed, projection: claim.projection };
  return {
    action: claim.projection.aedLevel === AED_LEVEL.RECOVER ? 'RECOVER' : 'NUDGE',
    claim: claim.claim,
    nextAction: item.nextAction || item.next_action || null,
    projection: claim.projection
  };
}

function verifySemanticProgress(before, after) {
  const beforeAt = latestProgressAt((before && before.events) || []);
  const afterAt = latestProgressAt((after && after.events) || []);
  if (!afterAt) return { advanced: false, beforeAt, afterAt };
  return { advanced: !beforeAt || Date.parse(afterAt) > Date.parse(beforeAt), beforeAt, afterAt };
}

export {
  normalizeWorkItem,
  projectLiveness,
  eligibleForDispatch,
  claimLane,
  planRecovery,
  verifySemanticProgress,
};
