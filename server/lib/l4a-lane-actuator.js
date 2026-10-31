import { createHash } from 'node:crypto';
import { clearForShock } from './aed-liveness.js';
import { normalizeWorkItem, projectLiveness } from './l4a-semantic-progress.js';

const CONTINUATION = Object.freeze({
  EXECUTE: 'EXECUTE',
  WAIT: 'WAIT',
  BLOCK: 'BLOCK',
  ESCALATE: 'ESCALATE',
  UNAVAILABLE: 'UNAVAILABLE',
  COMPLETE: 'COMPLETE',
});

const REPOSITORY_ACTUATOR = Object.freeze({
  id: 'repository',
  surfaces: Object.freeze(['repository', 'github', 'git']),
  transport: 'governed_connector_or_workflow',
  paidService: false,
  productionCapable: false,
});

const DEFAULT_ACTUATORS = Object.freeze([REPOSITORY_ACTUATOR]);

function parseNow(now) {
  const value = now instanceof Date ? now : new Date(now);
  if (!Number.isFinite(value.getTime())) throw new Error('valid scheduler time required');
  return value;
}

function activeClaim(claim, now) {
  if (!claim || claim.active !== true) return false;
  if (!claim.expiresAt && !claim.expires_at) return true;
  const expiresAt = Date.parse(claim.expiresAt || claim.expires_at);
  if (!Number.isFinite(expiresAt)) return true;
  return expiresAt > now.getTime();
}

function normalizeSurface(item) {
  return String(item.executionSurface || item.execution_surface || '').trim().toLowerCase();
}

function findActuator(surface, actuators = DEFAULT_ACTUATORS) {
  return (actuators || []).find((actuator) =>
    actuator && Array.isArray(actuator.surfaces) && actuator.surfaces.includes(surface)
  ) || null;
}

function stableIdempotencyKey(item, projection, actuator) {
  const material = JSON.stringify({
    workKey: projection.workKey,
    nextAction: projection.nextAction,
    authorityRef: item.authorityRef || item.authority_ref || null,
    executionSurface: actuator.id,
    lastProgressAt: projection.lastProgressAt,
    dispatchGeneration: item.dispatchGeneration || item.dispatch_generation || null,
  });
  return `l4a:${createHash('sha256').update(material).digest('hex')}`;
}

function buildEnvelope(item, projection, actuator, now) {
  const claim = item.claim || null;
  const expiredClaim = claim && claim.active === true && !activeClaim(claim, now);
  return {
    schemaVersion: 'l4a.dispatch.v1',
    workKey: projection.workKey,
    issueNumber: item.issueNumber || item.issue_number || item.issue || null,
    branch: item.branch || null,
    pullRequest: item.pullRequest || item.pull_request || item.github_pr || null,
    nextAction: projection.nextAction,
    authorityRef: item.authorityRef || item.authority_ref || null,
    executionSurface: actuator.id,
    transport: actuator.transport,
    requestedCapabilities: Array.isArray(item.requestedCapabilities)
      ? [...item.requestedCapabilities]
      : Array.isArray(item.requested_capabilities)
        ? [...item.requested_capabilities]
        : [],
    evidenceExpected: Array.isArray(item.evidenceExpected)
      ? [...item.evidenceExpected]
      : Array.isArray(item.evidence_expected)
        ? [...item.evidence_expected]
        : ['semantic_progress', 'execution_result'],
    lease: {
      source: 'canonical_foundry_work_lease',
      required: true,
      mode: expiredClaim ? 'reacquire' : 'acquire',
    },
    idempotencyKey: stableIdempotencyKey(item, projection, actuator),
    productionChange: false,
    paidService: actuator.paidService === true,
  };
}

function safetyDisposition(safety = {}) {
  const clear = clearForShock(safety);
  if (clear.clear) return { decision: null, failedSafety: [] };
  const humanBoundary = clear.failed.some((key) => ['l4aAuthorized', 'productionAuthorized'].includes(key));
  return {
    decision: humanBoundary ? CONTINUATION.ESCALATE : CONTINUATION.BLOCK,
    failedSafety: clear.failed,
  };
}

function decideLaneContinuation(item, safety, options = {}) {
  const now = parseNow(options.now || new Date());
  const projection = projectLiveness(item || {}, now);
  const lane = normalizeWorkItem(item || {});

  if (!projection.workKey || lane.terminal) {
    return { decision: CONTINUATION.COMPLETE, reason: 'terminal or unidentified work item', projection };
  }
  if (lane.mandatoryStop || item.josephActionRequired === true) {
    return {
      decision: CONTINUATION.ESCALATE,
      reason: lane.stopReason || item.stopReason || 'mandatory human or platform stop',
      projection,
    };
  }
  if (lane.waiting) {
    if (!lane.wakeCondition) {
      return { decision: CONTINUATION.BLOCK, reason: 'waiting state lacks a concrete wake condition', projection };
    }
    return { decision: CONTINUATION.WAIT, reason: 'bounded wait', wakeCondition: lane.wakeCondition, projection };
  }
  if (lane.blocked) {
    return {
      decision: CONTINUATION.BLOCK,
      reason: lane.blocker || 'explicit dependency block',
      blockerOwner: lane.blockerOwner,
      projection,
    };
  }
  if (item.dependenciesValid !== true) {
    return { decision: CONTINUATION.BLOCK, reason: 'dependencies are not verified valid', projection };
  }
  if (activeClaim(item.claim, now)) {
    return { decision: CONTINUATION.BLOCK, reason: 'active canonical claim or lease prevents duplicate dispatch', projection };
  }
  if (!projection.nextAction) {
    return { decision: CONTINUATION.BLOCK, reason: 'no durable next action is available', projection };
  }

  const safetyResult = safetyDisposition(safety || {});
  if (safetyResult.decision) {
    return {
      decision: safetyResult.decision,
      reason: 'CLEAR did not authorize continuation',
      failedSafety: safetyResult.failedSafety,
      projection,
    };
  }

  const surface = normalizeSurface(item);
  const actuator = findActuator(surface, options.actuators || DEFAULT_ACTUATORS);
  if (!actuator) {
    return {
      decision: CONTINUATION.UNAVAILABLE,
      reason: surface
        ? `no autonomous actuator registered for execution surface: ${surface}`
        : 'no execution surface is durably selected',
      missingActuator: surface || null,
      projection,
    };
  }
  if (item.productionChange === true || safety.productionChange === true) {
    return {
      decision: CONTINUATION.ESCALATE,
      reason: 'Production mutation is outside this actuator milestone',
      projection,
    };
  }
  if (actuator.paidService === true && safety.costGuardrailClear !== true) {
    return { decision: CONTINUATION.ESCALATE, reason: 'paid actuator lacks cost authority', projection };
  }

  return {
    decision: CONTINUATION.EXECUTE,
    reason: 'decision-complete continuation requires execution, not recommendation',
    projection,
    envelope: buildEnvelope(item, projection, actuator, now),
  };
}

export {
  CONTINUATION,
  REPOSITORY_ACTUATOR,
  DEFAULT_ACTUATORS,
  activeClaim,
  findActuator,
  stableIdempotencyKey,
  decideLaneContinuation,
};
