import { pathToFileURL } from 'node:url';

export const paidTestPolicy = Object.freeze({
  allowedModels: Object.freeze(['gpt-6-luna']),
  allowedReasoningEfforts: Object.freeze(['low']),
  maxOutputTokens: 128,
  maxTimeoutMs: 30000,
  maxRetries: 0,
  maxRequestsPerDispatch: 1,
  requiredQualityGate: 'disabled',
});

function requireInteger(value, name) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    throw new Error(`${name} must be an integer.`);
  }
  return parsed;
}

export function validatePaidTestRuntime(config) {
  const model = String(config.model || '');
  const reasoningEffort = String(config.reasoningEffort || '');
  const qualityGate = String(config.qualityGate || '');
  const maxOutputTokens = requireInteger(config.maxOutputTokens, 'OPENAI_MAX_OUTPUT_TOKENS');
  const timeoutMs = requireInteger(config.timeoutMs, 'OPENAI_TIMEOUT_MS');
  const maxRetries = requireInteger(config.maxRetries, 'OPENAI_MAX_RETRIES');
  const maxRequestsPerDispatch = requireInteger(
    config.maxRequestsPerDispatch,
    'OPENAI_PAID_TEST_MAX_REQUESTS_PER_DISPATCH'
  );

  if (!paidTestPolicy.allowedModels.includes(model)) {
    throw new Error(`Paid smoke model ${JSON.stringify(model)} is not allowlisted.`);
  }
  if (!paidTestPolicy.allowedReasoningEfforts.includes(reasoningEffort)) {
    throw new Error(
      `Paid smoke reasoning effort ${JSON.stringify(reasoningEffort)} is not allowlisted.`
    );
  }
  if (maxOutputTokens < 1 || maxOutputTokens > paidTestPolicy.maxOutputTokens) {
    throw new Error(
      `OPENAI_MAX_OUTPUT_TOKENS must be between 1 and ${paidTestPolicy.maxOutputTokens} for paid smoke verification.`
    );
  }
  if (timeoutMs < 1000 || timeoutMs > paidTestPolicy.maxTimeoutMs) {
    throw new Error(
      `OPENAI_TIMEOUT_MS must be between 1000 and ${paidTestPolicy.maxTimeoutMs} for paid smoke verification.`
    );
  }
  if (maxRetries !== paidTestPolicy.maxRetries) {
    throw new Error(`OPENAI_MAX_RETRIES must be ${paidTestPolicy.maxRetries} for paid smoke verification.`);
  }
  if (maxRequestsPerDispatch !== paidTestPolicy.maxRequestsPerDispatch) {
    throw new Error(
      `OPENAI_PAID_TEST_MAX_REQUESTS_PER_DISPATCH must be ${paidTestPolicy.maxRequestsPerDispatch}.`
    );
  }
  if (qualityGate !== paidTestPolicy.requiredQualityGate) {
    throw new Error(
      `ASSISTANT_QUALITY_GATE must be ${paidTestPolicy.requiredQualityGate} for paid smoke verification.`
    );
  }

  return {
    model,
    reasoningEffort,
    maxOutputTokens,
    timeoutMs,
    maxRetries,
    maxRequestsPerDispatch,
    qualityGate,
  };
}

export function interpretGuardrailPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Spending guardrail returned a malformed payload.');
  }

  const decision = payload.decision;
  if (!['allow', 'warn', 'pause'].includes(decision)) {
    throw new Error('Spending guardrail returned an unknown decision.');
  }
  if (typeof payload.pause_paid_tests !== 'boolean') {
    throw new Error('Spending guardrail omitted pause_paid_tests.');
  }
  if (!Array.isArray(payload.reasons) || payload.reasons.some((reason) => typeof reason !== 'string')) {
    throw new Error('Spending guardrail returned malformed audit reasons.');
  }

  const shouldPause = decision === 'pause';
  if (payload.pause_paid_tests !== shouldPause) {
    throw new Error('Spending guardrail decision and pause_paid_tests disagree.');
  }
  if (shouldPause) {
    throw new Error(`Paid OpenAI smoke paused by spending guardrail: ${payload.reasons.join(' ')}`);
  }

  return {
    decision,
    proceed: true,
    reasons: payload.reasons,
  };
}

export async function runPaidTestPreflight({ baseUrl, fetchImpl = fetch, config }) {
  const runtime = validatePaidTestRuntime(config);
  let response;
  try {
    response = await fetchImpl(`${baseUrl}/api/analytics/spending-guardrail`);
  } catch (error) {
    throw new Error(`Spending guardrail preflight is unavailable: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!response.ok) {
    throw new Error(`Spending guardrail preflight failed with HTTP ${response.status}.`);
  }

  let payload;
  try {
    payload = await response.json();
  } catch (error) {
    throw new Error(`Spending guardrail preflight returned invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }

  const guardrail = interpretGuardrailPayload(payload);
  return { runtime, guardrail };
}

async function main() {
  const baseUrl = process.env.BASE_URL;
  if (!baseUrl) {
    throw new Error('BASE_URL is required for paid smoke preflight.');
  }

  const result = await runPaidTestPreflight({
    baseUrl,
    config: {
      model: process.env.OPENAI_MODEL,
      reasoningEffort: process.env.OPENAI_REASONING_EFFORT,
      maxOutputTokens: process.env.OPENAI_MAX_OUTPUT_TOKENS,
      timeoutMs: process.env.OPENAI_TIMEOUT_MS,
      maxRetries: process.env.OPENAI_MAX_RETRIES,
      maxRequestsPerDispatch: process.env.OPENAI_PAID_TEST_MAX_REQUESTS_PER_DISPATCH,
      qualityGate: process.env.ASSISTANT_QUALITY_GATE,
    },
  });

  const reasons = result.guardrail.reasons.length > 0
    ? result.guardrail.reasons.join(' ')
    : 'No guardrail reasons were returned.';
  console.error(
    `Paid-test preflight ${result.guardrail.decision.toUpperCase()}. ` +
      `Model=${result.runtime.model}; max_output_tokens=${result.runtime.maxOutputTokens}; ` +
      `max_retries=${result.runtime.maxRetries}; max_requests_per_dispatch=${result.runtime.maxRequestsPerDispatch}. ` +
      reasons
  );
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
