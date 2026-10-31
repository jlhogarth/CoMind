export const LIFECYCLE = Object.freeze({
  CREATED: 'CREATED',
  QUEUED: 'QUEUED',
  RUNNING: 'RUNNING',
  VERIFYING: 'VERIFYING',
  BOUNDED_WAIT: 'BOUNDED_WAIT',
  BLOCKED_HUMAN: 'BLOCKED_HUMAN',
  OVERDUE: 'OVERDUE',
  STALLED: 'STALLED'
});

export const WAKE = Object.freeze({
  EVENT: 'event',
  TIMER: 'durable_timer',
  POLL: 'adaptive_poll',
  NONE: 'none'
});

export function percentile(values, p) {
  const xs = (values || []).filter(Number.isFinite).sort((a, b) => a - b);
  if (!xs.length) return null;
  const i = (xs.length - 1) * p;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  if (lo === hi) return xs[lo];
  return xs[lo] + (xs[hi] - xs[lo]) * (i - lo);
}

export function summarizeDurations(samples) {
  const values = (samples || []).filter(Number.isFinite).filter((v) => v >= 0);
  return {
    samples: values.length,
    p50: percentile(values, 0.50),
    p75: percentile(values, 0.75),
    p90: percentile(values, 0.90),
    p95: percentile(values, 0.95),
    p99: percentile(values, 0.99)
  };
}

export function chooseTimingModel(history = {}) {
  const levels = [
    ['job', history.job],
    ['family', history.family],
    ['lifecycle', history.lifecycle],
    ['system', history.system]
  ];
  for (const [source, samples] of levels) {
    const stats = summarizeDurations(samples);
    if (stats.samples >= 5) return { source, ...stats };
  }
  const fallbackMs = Number.isFinite(history.fallbackMs) && history.fallbackMs > 0
    ? history.fallbackMs
    : 300000;
  return {
    source: 'conservative_static',
    samples: 0,
    p50: fallbackMs * 0.5,
    p75: fallbackMs * 0.75,
    p90: fallbackMs * 0.9,
    p95: fallbackMs,
    p99: fallbackMs * 1.25
  };
}

export function adaptiveWakePlan(input) {
  const nowMs = Date.parse(input.now);
  const enteredMs = Date.parse(input.stateEnteredAt);
  if (!Number.isFinite(nowMs) || !Number.isFinite(enteredMs)) {
    throw new Error('valid now and stateEnteredAt are required');
  }
  const elapsedMs = Math.max(0, nowMs - enteredMs);
  const state = input.state;

  if (state === LIFECYCLE.BOUNDED_WAIT) {
    if (!input.wakeAt && !input.eventExpected) {
      throw new Error('BOUNDED_WAIT requires wakeAt or eventExpected');
    }
    return {
      state,
      wake: input.wakeAt ? WAKE.TIMER : WAKE.EVENT,
      wakeAt: input.wakeAt || null,
      reason: 'bounded wait uses explicit wake condition'
    };
  }
  if (state === LIFECYCLE.BLOCKED_HUMAN) {
    return {
      state,
      wake: WAKE.EVENT,
      wakeAt: null,
      reason: 'human block wakes on authority/state event'
    };
  }
  if (state === LIFECYCLE.STALLED || state === LIFECYCLE.OVERDUE) {
    return {
      state,
      wake: WAKE.TIMER,
      wakeAt: input.now,
      reason: 'abnormal state requires immediate AED diagnosis'
    };
  }

  const model = chooseTimingModel(input.history);
  const p50 = model.p50;
  const p90 = model.p90;
  const p95 = model.p95;
  let delayMs;
  let band;

  if (elapsedMs < p50) {
    delayMs = Math.max(1000, Math.min(p50 - elapsedMs, Math.max(5000, p50 * 0.35)));
    band = 'normal_early';
  } else if (elapsedMs < p90) {
    delayMs = Math.max(1000, Math.min(p90 - elapsedMs, Math.max(3000, (p90 - p50) * 0.35)));
    band = 'normal_late';
  } else if (elapsedMs < p95) {
    delayMs = Math.max(1000, Math.min(p95 - elapsedMs, 15000));
    band = 'tail_observation';
  } else {
    delayMs = 0;
    band = 'diagnose';
  }

  return {
    state,
    wake: input.eventExpected ? WAKE.EVENT : WAKE.TIMER,
    fallbackWakeAt: new Date(nowMs + delayMs).toISOString(),
    delayMs,
    elapsedMs,
    band,
    model,
    diagnosticTrigger: band === 'diagnose',
    reason: input.eventExpected
      ? 'event preferred with durable timer fallback'
      : 'durable timer derived from lifecycle timing evidence'
  };
}
