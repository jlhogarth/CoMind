export const OPENAI_RATE_CARD_VERSION = 'openai-2026-10-07';
export const OPENAI_RATE_CARD_SOURCE = 'https://developers.openai.com/api/docs/pricing';
export const OPENAI_LONG_CONTEXT_THRESHOLD_TOKENS = 272_000;

export type OpenAIProcessingMode = 'standard' | 'batch' | 'flex' | 'fast';

export interface OpenAIUsageForPricing {
  input_tokens?: number;
  cached_input_tokens?: number;
  cache_write_tokens?: number;
  output_tokens?: number;
}

interface TokenRatesPerMillion {
  input: number;
  cachedInput: number;
  cacheWrite: number;
  output: number;
}

interface ContextRateCard {
  short: TokenRatesPerMillion;
  long: TokenRatesPerMillion;
}

interface ModelRateCard {
  aliases: readonly string[];
  modes: Partial<Record<OpenAIProcessingMode, ContextRateCard>>;
  sourceNote: string;
}

export interface OpenAICostEstimate {
  estimated_cost_usd: number | null;
  currency: 'USD';
  rate_card_version: string;
  pricing_source: string;
  pricing_assumption: string;
  model: string;
  canonical_model: string | null;
  processing_mode: OpenAIProcessingMode;
  context_band: 'short' | 'long' | null;
  billable_tokens: {
    uncached_input: number;
    cached_input: number;
    cache_write: number;
    output: number;
  } | null;
}

const GPT_6_LUNA_STANDARD: ContextRateCard = {
  short: {
    input: 0.1,
    cachedInput: 0.01,
    cacheWrite: 0.125,
    output: 0.5,
  },
  long: {
    input: 0.2,
    cachedInput: 0.02,
    cacheWrite: 0.25,
    output: 0.75,
  },
};

function scaleRates(card: ContextRateCard, factor: number): ContextRateCard {
  const scale = (rates: TokenRatesPerMillion): TokenRatesPerMillion => ({
    input: rates.input * factor,
    cachedInput: rates.cachedInput * factor,
    cacheWrite: rates.cacheWrite * factor,
    output: rates.output * factor,
  });

  return {
    short: scale(card.short),
    long: scale(card.long),
  };
}

const RATE_CARDS: Record<string, ModelRateCard> = {
  'gpt-6-luna': {
    aliases: ['gpt-6-luna'],
    modes: {
      standard: GPT_6_LUNA_STANDARD,
      batch: scaleRates(GPT_6_LUNA_STANDARD, 0.5),
      flex: scaleRates(GPT_6_LUNA_STANDARD, 0.5),
      fast: scaleRates(GPT_6_LUNA_STANDARD, 2),
    },
    sourceNote:
      'OpenAI pricing published 2026-10-07: cached input is 10% of uncached input, cache writes are 1.25x input, Batch/Flex are 50% of Standard, Fast is 2x Standard, and requests above 272K input tokens use long-context rates.',
  },
};

function canonicalModel(model: string) {
  for (const [canonical, card] of Object.entries(RATE_CARDS)) {
    if (card.aliases.includes(model) || model.startsWith(`${canonical}-`)) return canonical;
  }
  return undefined;
}

function finiteNonNegativeInteger(value: number | undefined) {
  return value === undefined || (Number.isInteger(value) && value >= 0);
}

function unsupportedEstimate(
  model: string,
  processingMode: OpenAIProcessingMode,
  assumption: string,
  canonical: string | null = null
): OpenAICostEstimate {
  return {
    estimated_cost_usd: null,
    currency: 'USD',
    rate_card_version: OPENAI_RATE_CARD_VERSION,
    pricing_source: OPENAI_RATE_CARD_SOURCE,
    pricing_assumption: assumption,
    model,
    canonical_model: canonical,
    processing_mode: processingMode,
    context_band: null,
    billable_tokens: null,
  };
}

export function estimateOpenAICost(
  model: string,
  processingMode: OpenAIProcessingMode,
  usage: OpenAIUsageForPricing
): OpenAICostEstimate {
  const canonical = canonicalModel(model);
  if (!canonical) {
    return unsupportedEstimate(
      model,
      processingMode,
      'No reviewed rate card exists for this model; cost estimation is disabled rather than guessed.'
    );
  }

  const card = RATE_CARDS[canonical];
  const contextRates = card.modes[processingMode];
  if (!contextRates) {
    return unsupportedEstimate(
      model,
      processingMode,
      'No reviewed rate card exists for this processing mode; cost estimation is disabled rather than guessed.',
      canonical
    );
  }

  const input = usage.input_tokens ?? 0;
  const cachedInput = usage.cached_input_tokens ?? 0;
  const cacheWrite = usage.cache_write_tokens ?? 0;
  const output = usage.output_tokens ?? 0;

  if (
    !finiteNonNegativeInteger(usage.input_tokens) ||
    !finiteNonNegativeInteger(usage.cached_input_tokens) ||
    !finiteNonNegativeInteger(usage.cache_write_tokens) ||
    !finiteNonNegativeInteger(usage.output_tokens)
  ) {
    return unsupportedEstimate(
      model,
      processingMode,
      'Usage contained an invalid token count; cost estimation is disabled.',
      canonical
    );
  }

  if (cachedInput + cacheWrite > input) {
    return unsupportedEstimate(
      model,
      processingMode,
      'Cached-input and cache-write tokens exceed total input tokens; cost estimation is disabled.',
      canonical
    );
  }

  const uncachedInput = input - cachedInput - cacheWrite;
  const contextBand = input > OPENAI_LONG_CONTEXT_THRESHOLD_TOKENS ? 'long' : 'short';
  const rates = contextRates[contextBand];
  const cost =
    (uncachedInput * rates.input +
      cachedInput * rates.cachedInput +
      cacheWrite * rates.cacheWrite +
      output * rates.output) /
    1_000_000;

  return {
    estimated_cost_usd: cost,
    currency: 'USD',
    rate_card_version: OPENAI_RATE_CARD_VERSION,
    pricing_source: OPENAI_RATE_CARD_SOURCE,
    pricing_assumption: card.sourceNote,
    model,
    canonical_model: canonical,
    processing_mode: processingMode,
    context_band: contextBand,
    billable_tokens: {
      uncached_input: uncachedInput,
      cached_input: cachedInput,
      cache_write: cacheWrite,
      output,
    },
  };
}
