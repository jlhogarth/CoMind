#!/usr/bin/env node

function numberFrom(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(`${name} must be numeric`);
  return value;
}

const warningPercent = numberFrom('SDN_DISK_WARNING_PERCENT', 20);
const criticalPercent = numberFrom('SDN_DISK_CRITICAL_PERCENT', 10);
const freePercent = numberFrom('SDN_DISK_FREE_PERCENT', NaN);

if (!Number.isFinite(freePercent)) throw new Error('SDN_DISK_FREE_PERCENT is required');
if (!(warningPercent > criticalPercent && criticalPercent >= 0 && warningPercent <= 100)) {
  throw new Error('capacity thresholds must satisfy 100 >= warning > critical >= 0');
}
if (freePercent < 0 || freePercent > 100) throw new Error('SDN_DISK_FREE_PERCENT must be between 0 and 100');

let state = 'healthy';
if (freePercent <= criticalPercent) state = 'critical';
else if (freePercent <= warningPercent) state = 'warning';

const result = {
  state,
  freePercent,
  warningPercent,
  criticalPercent,
  allowNewIngestion: state !== 'critical',
  ingestionDisposition: state === 'critical' ? 'backpressure_retry_required' : 'allowed',
  allowLifecycleEvaluation: true,
  destructiveLifecycleAuthorized: false,
  destructiveDisposition: 'requires_existing_guarded_authority_and_policy',
  operatorAttentionRequired: state !== 'healthy',
  reason: state === 'critical'
    ? 'critical storage pressure requires backpressure and operator recovery; storage pressure never authorizes deletion'
    : state === 'warning'
      ? 'storage warning requires capacity attention; normal guarded lifecycle authority is unchanged'
      : 'capacity is above the provisional warning threshold'
};

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
