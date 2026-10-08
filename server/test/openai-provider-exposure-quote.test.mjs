import assert from 'node:assert/strict';
import test from 'node:test';

const {
  estimateOpenAICost,
  OPENAI_LONG_CONTEXT_THRESHOLD_TOKENS,
  OPENAI_RATE_CARD_SOURCE,
  OPENAI_RATE_CARD_VERSION,
  quoteOpenAIProviderExposure,
} = await import('../dist/providers/openai-rate-card.js');

function assertMoney(actual, expected) {
  assert.equal(Math.abs(actual - expected) < 1e-12, true, `expected ${expected}, got ${actual}`);
}

function standardQuote(overrides = {}) {
  return quoteOpenAIProviderExposure({
    model: 'gpt-6-luna',
    processing_mode: 'standard',
    max_input_tokens: 100_000,
    max_output_tokens: 10_000,
    ...overrides,
  });
}

test('quotes bounded short-context exposure below and exactly at the 272K threshold', () => {
  const below = standardQuote({
    max_input_tokens: 100_000,
    max_output_tokens: 10_000,
  });
  const threshold = standardQuote({
    max_input_tokens: OPENAI_LONG_CONTEXT_THRESHOLD_TOKENS,
    max_output_tokens: 1_000,
  });

  assert.equal(below.quotable, true);
  assert.equal(below.context_band, 'short');
  assertMoney(below.maximum_exposure_usd, 0.0175);

  assert.equal(threshold.quotable, true);
  assert.equal(threshold.context_band, 'short');
  assertMoney(threshold.maximum_exposure_usd, 0.0345);
});

test('quotes the entire bounded request at long-context rates immediately above 272K input tokens', () => {
  const quote = standardQuote({
    max_input_tokens: OPENAI_LONG_CONTEXT_THRESHOLD_TOKENS + 1,
    max_output_tokens: 1_000,
  });

  assert.equal(quote.quotable, true);
  assert.equal(quote.context_band, 'long');
  assert.equal(quote.rate_basis.input_category, 'cache_write');
  assertMoney(quote.rate_basis.input_per_million_usd, 0.25);
  assertMoney(quote.rate_basis.output_per_million_usd, 0.75);
  assertMoney(quote.maximum_exposure_usd, 0.06875025);
});

test('does not assume a cached-input discount before provider execution', () => {
  const quote = standardQuote();
  const observedAllCached = estimateOpenAICost('gpt-6-luna', 'standard', {
    input_tokens: 100_000,
    cached_input_tokens: 100_000,
    output_tokens: 10_000,
  });

  assert.equal(quote.quotable, true);
  assert.equal(quote.rate_basis.input_category, 'cache_write');
  assertMoney(quote.rate_basis.input_per_million_usd, 0.125);
  assertMoney(quote.maximum_exposure_usd, 0.0175);
  assertMoney(observedAllCached.estimated_cost_usd, 0.006);
  assert.equal(quote.maximum_exposure_usd > observedAllCached.estimated_cost_usd, true);
  assert.match(quote.pricing_assumption, /no discounted cached-input outcome/i);
});

test('fully includes the bounded maximum output-token exposure', () => {
  const quote = standardQuote({
    max_input_tokens: 0,
    max_output_tokens: 8_192,
  });

  assert.equal(quote.quotable, true);
  assert.equal(quote.max_output_tokens, 8_192);
  assertMoney(quote.maximum_exposure_usd, 0.004096);
});

test('reuses reviewed processing-mode multipliers without a second pricing catalog', () => {
  const standard = standardQuote();
  const batch = standardQuote({ processing_mode: 'batch' });
  const flex = standardQuote({ processing_mode: 'flex' });
  const fast = standardQuote({ processing_mode: 'fast' });

  assertMoney(batch.maximum_exposure_usd, standard.maximum_exposure_usd * 0.5);
  assertMoney(flex.maximum_exposure_usd, standard.maximum_exposure_usd * 0.5);
  assertMoney(fast.maximum_exposure_usd, standard.maximum_exposure_usd * 2);
});

test('returns reviewed pricing provenance and normalized 12-decimal monetary output', () => {
  const quote = standardQuote({
    max_input_tokens: 1,
    max_output_tokens: 1,
  });

  assert.equal(quote.quotable, true);
  assert.equal(quote.provider, 'openai');
  assert.equal(quote.currency, 'USD');
  assert.equal(quote.rate_card_version, OPENAI_RATE_CARD_VERSION);
  assert.equal(quote.pricing_source, OPENAI_RATE_CARD_SOURCE);
  assertMoney(quote.maximum_exposure_usd, 0.000000625);
  assert.equal(Number(quote.maximum_exposure_usd.toFixed(12)), quote.maximum_exposure_usd);
});

test('reuses the canonical reviewed rate card for known snapshot model ids', () => {
  const quote = standardQuote({ model: 'gpt-6-luna-2026-09-22' });

  assert.equal(quote.quotable, true);
  assert.equal(quote.canonical_model, 'gpt-6-luna');
  assertMoney(quote.maximum_exposure_usd, 0.0175);
});

test('fails closed for an unknown model', () => {
  const quote = standardQuote({ model: 'gpt-future-unknown' });

  assert.equal(quote.quotable, false);
  assert.equal(quote.maximum_exposure_usd, null);
  assert.equal(quote.failure_reason, 'unknown_model');
  assert.equal(quote.rate_basis, null);
});

test('fails closed for an unsupported processing mode', () => {
  const quote = standardQuote({ processing_mode: 'regional' });

  assert.equal(quote.quotable, false);
  assert.equal(quote.maximum_exposure_usd, null);
  assert.equal(quote.failure_reason, 'unsupported_processing_mode');
});

test('fails closed when a required input or output bound is missing', () => {
  const missingInput = quoteOpenAIProviderExposure({
    model: 'gpt-6-luna',
    processing_mode: 'standard',
    max_output_tokens: 128,
  });
  const missingOutput = quoteOpenAIProviderExposure({
    model: 'gpt-6-luna',
    processing_mode: 'standard',
    max_input_tokens: 128,
  });

  assert.equal(missingInput.quotable, false);
  assert.equal(missingInput.failure_reason, 'invalid_max_input_tokens');
  assert.equal(missingOutput.quotable, false);
  assert.equal(missingOutput.failure_reason, 'invalid_max_output_tokens');
});

test('fails closed for malformed maximum input-token bounds', () => {
  for (const value of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1]) {
    const quote = standardQuote({ max_input_tokens: value });
    assert.equal(quote.quotable, false, `expected ${String(value)} to fail closed`);
    assert.equal(quote.maximum_exposure_usd, null);
    assert.equal(quote.failure_reason, 'invalid_max_input_tokens');
  }
});

test('fails closed for malformed maximum output-token bounds', () => {
  for (const value of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1]) {
    const quote = standardQuote({ max_output_tokens: value });
    assert.equal(quote.quotable, false, `expected ${String(value)} to fail closed`);
    assert.equal(quote.maximum_exposure_usd, null);
    assert.equal(quote.failure_reason, 'invalid_max_output_tokens');
  }
});

test('leaves observed-usage estimator semantics unchanged', () => {
  const estimate = estimateOpenAICost('gpt-6-luna', 'standard', {
    input_tokens: 100_000,
    cached_input_tokens: 20_000,
    cache_write_tokens: 30_000,
    output_tokens: 10_000,
  });

  assertMoney(estimate.estimated_cost_usd, 0.01395);
  assert.deepEqual(estimate.billable_tokens, {
    uncached_input: 50_000,
    cached_input: 20_000,
    cache_write: 30_000,
    output: 10_000,
  });
});
