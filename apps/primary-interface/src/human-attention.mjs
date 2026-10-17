// Presentation assessment only. This module never grants execution authority.
const text = value => typeof value === 'string' && value.trim().length > 0;
const instant = value => typeof value === 'string' &&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value) &&
  Number.isFinite(Date.parse(value)) &&
  new Date(value).toISOString().slice(0, 19) === value.slice(0, 19) ? Date.parse(value) : NaN;
const statuses = new Set(['open', 'approved', 'held', 'rejected', 'superseded']);

export function assessHumanAction(record, now) {
  const at = instant(now);
  if (!Number.isFinite(at)) throw new TypeError('now must be a UTC ISO instant');
  const issues = [];
  const add = (code, field) => issues.push({ code, field });
  const r = record && typeof record === 'object' && !Array.isArray(record) ? record : {};
  for (const field of ['id', 'laneId', 'stopReason', 'authorityBoundary', 'recommendation', 'consequences']) {
    if (!text(r[field])) add('missing', field);
  }
  if (!statuses.has(r.status)) add('invalid', 'status');
  if (!Number.isSafeInteger(r.revision) || r.revision < 1) add('invalid', 'revision');
  const checkWindow = (start, end, path) => {
    const from = instant(start), until = instant(end);
    if (!Number.isFinite(from)) add('invalid_time', `${path}.start`);
    else if (from > at) add('future', `${path}.start`);
    if (!Number.isFinite(until)) add('invalid_time', `${path}.expiresAt`);
    else {
      if (until <= at) add('expired', `${path}.expiresAt`);
      if (Number.isFinite(from) && until <= from) add('invalid_window', path);
    }
  };
  checkWindow(r.requestedAt, r.expiresAt, 'request');
  const evidence = Array.isArray(r.evidence) ? r.evidence : [];
  if (!evidence.length) add('missing', 'evidence');
  const seen = new Set();
  evidence.forEach((value, i) => {
    const e = value && typeof value === 'object' ? value : {};
    const path = `evidence[${i}]`;
    for (const field of ['id', 'sourceRef']) if (!text(e[field])) add('missing', `${path}.${field}`);
    if (text(e.id)) {
      if (seen.has(e.id)) add('duplicate', `${path}.id`);
      seen.add(e.id);
    }
    if (e.verification !== 'verified') add('unverified', path);
    if (e.conflict !== false) add(e.conflict === true ? 'conflict' : 'unknown_conflict', path);
    checkWindow(e.verifiedAt, e.expiresAt, path);
  });
  const refs = Array.isArray(r.runbookRefs) ? r.runbookRefs : [];
  if (!refs.length) add('missing', 'runbookRefs');
  refs.forEach((ref, i) => {
    if (!ref || !text(ref.id) || !text(ref.sourceRef)) add('missing', `runbookRefs[${i}]`);
  });
  const closed = statuses.has(r.status) && r.status !== 'open';
  const state = closed ? 'closed' : issues.length ? 'needs_refresh' : 'reviewable';
  return {
    state,
    issues,
    navigation: text(r.id) ? `/attention/${encodeURIComponent(r.id)}` : null,
    decisionOptions: state === 'reviewable' ? ['approve', 'hold', 'reject'] : [],
  };
}
