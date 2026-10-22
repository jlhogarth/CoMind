import type { FoundryAdapter, FoundryAdapterRequest } from '../foundry-runtime.js';

export interface LocalOllamaFoundryAdapterOptions {
  baseUrl?: string;
  model?: string;
  timeoutMs?: number;
  maxOutputTokens?: number;
  fetchImpl?: typeof fetch;
}

const DEFAULT_MODEL = 'qwen3:0.6b';
const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_MAX_OUTPUT_TOKENS = 128;
const MAX_PROMPT_CHARS = 6_000;
const MAX_RESULT_CHARS = 2_048;

function validatedLocalBaseUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('Ollama base URL must be a valid local HTTP URL');
  }

  if (
    url.protocol !== 'http:'
    || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    || url.username !== ''
    || url.password !== ''
    || url.search !== ''
    || url.hash !== ''
  ) {
    throw new Error('Foundry Ollama adapter only permits a local HTTP Ollama server');
  }

  return url.origin;
}

function boundedInteger(value: number, field: string, min: number, max: number): number {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${field} must be an integer between ${min} and ${max}`);
  }
  return value;
}

function requirePrompt(request: FoundryAdapterRequest): string {
  const prompt = request.input.prompt;
  if (typeof prompt !== 'string' || prompt.trim().length === 0 || prompt.length > MAX_PROMPT_CHARS) {
    throw new Error(`Foundry Ollama prompt must be non-empty and at most ${MAX_PROMPT_CHARS} characters`);
  }
  return prompt;
}

export function createLocalOllamaFoundryAdapter(
  options: LocalOllamaFoundryAdapterOptions = {}
): FoundryAdapter {
  const baseUrl = validatedLocalBaseUrl(options.baseUrl ?? 'http://127.0.0.1:11434');
  const model = options.model ?? DEFAULT_MODEL;
  if (!/^[a-zA-Z0-9._:-]{1,128}$/.test(model)) {
    throw new Error('Ollama model name is invalid');
  }
  const timeoutMs = boundedInteger(options.timeoutMs ?? DEFAULT_TIMEOUT_MS, 'timeoutMs', 1_000, 180_000);
  const maxOutputTokens = boundedInteger(
    options.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
    'maxOutputTokens',
    1,
    256
  );
  const fetchImpl = options.fetchImpl ?? fetch;

  return async (request) => {
    const prompt = requirePrompt(request);
    const response = await fetchImpl(`${baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt,
        stream: false,
        think: false,
        keep_alive: 0,
        options: {
          temperature: 0.2,
          num_predict: maxOutputTokens,
          seed: 161,
        },
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!response.ok) {
      throw new Error(`Local Ollama request failed with HTTP ${response.status}`);
    }

    const payload = await response.json() as { model?: unknown; response?: unknown; done?: unknown };
    const output = typeof payload.response === 'string' ? payload.response.trim() : '';
    if (payload.done !== true || output.length === 0 || output.length > MAX_RESULT_CHARS) {
      throw new Error('Local Ollama returned an empty, incomplete, or oversized response');
    }

    return {
      status: 'succeeded',
      resultRef: `ollama-local://${model}/${request.requestFingerprint}`,
      summary: output,
    };
  };
}

export const localOllamaFoundryDefaults = Object.freeze({
  model: DEFAULT_MODEL,
  maxOutputTokens: DEFAULT_MAX_OUTPUT_TOKENS,
  timeoutMs: DEFAULT_TIMEOUT_MS,
  maxPromptChars: MAX_PROMPT_CHARS,
});
