const OPENAI_MODELS_URL = 'https://api.openai.com/v1/models';

export class OpenAIReadinessError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'OpenAIReadinessError';
    this.code = code;
  }
}

export async function verifyOpenAIApiKeyReadiness({
  apiKey,
  requiredModel = 'gpt-6-luna',
  fetchImpl = globalThis.fetch,
  timeoutMs = 15_000,
} = {}) {
  if (typeof apiKey !== 'string' || apiKey.trim().length === 0) {
    throw new OpenAIReadinessError('api_key_missing', 'OPENAI_API_KEY is not configured');
  }
  if (typeof requiredModel !== 'string' || requiredModel.trim().length === 0) {
    throw new OpenAIReadinessError('required_model_missing', 'Required model must be specified');
  }
  if (typeof fetchImpl !== 'function') {
    throw new OpenAIReadinessError('fetch_unavailable', 'Fetch implementation is unavailable');
  }

  let response;
  try {
    response = await fetchImpl(OPENAI_MODELS_URL, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey.trim()}`,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    throw new OpenAIReadinessError('openai_unreachable', 'OpenAI credential readiness endpoint was unreachable');
  }

  if (response.status === 401 || response.status === 403) {
    throw new OpenAIReadinessError('api_key_rejected', 'OpenAI rejected the configured credential');
  }
  if (!response.ok) {
    throw new OpenAIReadinessError('openai_readiness_http_failure', `OpenAI readiness request failed with HTTP ${response.status}`);
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new OpenAIReadinessError('openai_readiness_invalid_json', 'OpenAI readiness response was not valid JSON');
  }

  if (!payload || !Array.isArray(payload.data)) {
    throw new OpenAIReadinessError('openai_readiness_invalid_shape', 'OpenAI readiness response did not contain a model list');
  }

  const requiredModelAvailable = payload.data.some(
    (entry) => entry && typeof entry.id === 'string' && entry.id === requiredModel.trim(),
  );
  if (!requiredModelAvailable) {
    throw new OpenAIReadinessError('required_model_unavailable', 'Configured OpenAI credential cannot access the required model');
  }

  return Object.freeze({
    status: 'authenticated',
    host: 'api.openai.com',
    requiredModel: requiredModel.trim(),
    requiredModelAvailable: true,
    billableModelRequest: false,
    promptDataSent: false,
  });
}
