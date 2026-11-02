import { setTimeout as sleep } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';

const DEFAULT_HOLD_MS = 10_000;
const MAX_HOLD_MS = 60_000;
const DEFAULT_REQUEST_TIMEOUT_MS = 20_000;
const MAX_REQUEST_TIMEOUT_MS = 60_000;

function boundedInteger(value, fallback, minimum, maximum, name) {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}.`);
  }
  return parsed;
}

function isPrivatePlaintextHost(hostname) {
  const normalized = hostname.toLowerCase();
  return normalized === 'localhost'
    || normalized === '127.0.0.1'
    || normalized === '[::1]'
    || normalized === '::1'
    || normalized.endsWith('.railway.internal');
}

export function validateAcceptanceEndpoint(raw) {
  if (!raw?.trim()) throw new Error('CBE_ACCEPTANCE_ENDPOINT is required.');
  let endpoint;
  try {
    endpoint = new URL(raw.trim());
  } catch {
    throw new Error('CBE_ACCEPTANCE_ENDPOINT must be a valid URL.');
  }

  if (endpoint.username || endpoint.password || endpoint.search || endpoint.hash) {
    throw new Error('CBE_ACCEPTANCE_ENDPOINT must not contain credentials, query parameters, or fragments.');
  }
  if (endpoint.pathname !== '/api/cbe-control') {
    throw new Error('CBE_ACCEPTANCE_ENDPOINT must target /api/cbe-control exactly.');
  }
  if (endpoint.protocol !== 'https:' && !(endpoint.protocol === 'http:' && isPrivatePlaintextHost(endpoint.hostname))) {
    throw new Error('Plaintext HTTP is permitted only for localhost or Railway private-network hosts.');
  }
  return endpoint;
}

export function readAcceptanceConfig(env = process.env) {
  const endpoint = validateAcceptanceEndpoint(env.CBE_ACCEPTANCE_ENDPOINT);
  const token = env.CBE_CONTROL_TOKEN?.trim();
  if (!token || token.length < 32) {
    throw new Error('CBE_CONTROL_TOKEN must be configured and at least 32 characters.');
  }

  return {
    endpoint,
    token,
    holdMs: boundedInteger(env.CBE_ACCEPTANCE_HOLD_MS, DEFAULT_HOLD_MS, 0, MAX_HOLD_MS, 'CBE_ACCEPTANCE_HOLD_MS'),
    requestTimeoutMs: boundedInteger(
      env.CBE_ACCEPTANCE_REQUEST_TIMEOUT_MS,
      DEFAULT_REQUEST_TIMEOUT_MS,
      1_000,
      MAX_REQUEST_TIMEOUT_MS,
      'CBE_ACCEPTANCE_REQUEST_TIMEOUT_MS'
    ),
  };
}

function requestBody(action) {
  return {
    action,
    work_key: null,
    recovery_id: null,
    environment: 'development-test',
    production_change: false,
    requested_at: new Date().toISOString(),
  };
}

function safeActionEvidence(action, response, durationMs) {
  return {
    action,
    status: response.status,
    correlation_id: response.correlation_id,
    human_action_required: response.human_action_required === true,
    duration_ms: durationMs,
  };
}

async function invokeAction(config, action, fetchImpl) {
  const started = performance.now();
  const response = await fetchImpl(config.endpoint, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${config.token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(requestBody(action)),
    signal: AbortSignal.timeout(config.requestTimeoutMs),
  });

  const durationMs = Math.round(performance.now() - started);
  if (!response.ok) {
    throw new Error(`CBE action ${action} returned HTTP ${response.status}.`);
  }

  const payload = await response.json();
  if (!payload || typeof payload !== 'object'
      || typeof payload.status !== 'string'
      || typeof payload.correlation_id !== 'string') {
    throw new Error(`CBE action ${action} returned an invalid response contract.`);
  }
  return safeActionEvidence(action, payload, durationMs);
}

export async function runAcceptance(config, options = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleepImpl = options.sleepImpl ?? sleep;
  const startedAt = new Date().toISOString();
  const totalStarted = performance.now();
  const actions = [];
  let browserStarted = false;

  try {
    const baseline = await invokeAction(config, 'stop_browser', fetchImpl);
    if (!['stopped', 'already_stopped'].includes(baseline.status)) {
      throw new Error(`Baseline stop returned unexpected status ${baseline.status}.`);
    }
    actions.push(baseline);

    const start = await invokeAction(config, 'start_browser', fetchImpl);
    if (start.status !== 'started') {
      throw new Error(`Browser start returned unexpected status ${start.status}.`);
    }
    browserStarted = true;
    actions.push(start);

    await sleepImpl(config.holdMs);

    const stop = await invokeAction(config, 'stop_browser', fetchImpl);
    if (stop.status !== 'stopped') {
      throw new Error(`Browser stop returned unexpected status ${stop.status}.`);
    }
    browserStarted = false;
    actions.push(stop);
  } finally {
    if (browserStarted) {
      await invokeAction(config, 'stop_browser', fetchImpl).catch(() => undefined);
    }
  }

  return {
    schema_version: 1,
    work_key: 'CBE-HOST-002',
    environment: 'development-test',
    production_change: false,
    endpoint_origin: config.endpoint.origin,
    started_at: startedAt,
    completed_at: new Date().toISOString(),
    browser_hold_ms: config.holdMs,
    request_timeout_ms: config.requestTimeoutMs,
    total_duration_ms: Math.round(performance.now() - totalStarted),
    actions,
  };
}

async function main() {
  const config = readAcceptanceConfig();
  const evidence = await runAcceptance(config);
  process.stdout.write(`${JSON.stringify(evidence)}\n`);
}

const entry = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (entry === import.meta.url) {
  main().catch((error) => {
    const message = error instanceof Error ? error.message : 'Unknown CBE acceptance failure.';
    process.stderr.write(`CBE Railway acceptance failed: ${message}\n`);
    process.exitCode = 1;
  });
}
