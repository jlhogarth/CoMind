import assert from 'node:assert/strict';
import test from 'node:test';

const {
  estimateOpenAICost,
  OPENAI_LONG_CONTEXT_THRESHOLD_TOKENS,
  OPENAI_RATE_CARD_VERSION,
} = await import('../dist/providers/openai-rate-card.js');

function assertMoney(actual, expected) {
  assert.equal(Math.abs(actual - expected) < 1e-12, true, `expected ${expected}, got ${actual}`);
}

test('prices uncached GPT-6 Luna Standard usage', () => {
  const estimate = estimateOpenAICost('gpt-6-luna', 'standard', {
    input_tokens: 100_000,
    output_tokens: 100_000,
  });

  assertMoney(estimate.estimated_cost_usd, 0.06);
  assert.equal(estimate.rate_card_version, OPENAI_RATE_CARD_VERSION);
  assert.equal(estimate.canonical_model, 'gpt-6-luna');
  assert.equal(estimate.context_band, 'short');
  assert.deepEqual(estimate.billable_tokens, {
    uncached_input: 100_000,
    cached_input: 0,
    cache_write: 0,
    output: 100_000,
  });
});

test('prices cached input as a partition instead of charging it again at full input rate', () => {
  const estimate = estimateOpenAICost('gpt-6-luna', 'standard', {
    input_tokens: 100_000,
    cached_input_tokens: 60_000,
    output_tokens: 10_000,
  });

  assertMoney(estimate.estimated_cost_usd, 0.0096);
  assert.equal(estimate.context_band, 'short');
  assert.deepEqual(estimate.billable_tokens, {
    uncached_input: 40_000,
    cached_input: 60_000,
    cache_write: 0,
    output: 10_000,
  });
});

test('prices cache-write tokens separately from uncached and cached input', () => {
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

test('prices output-only usage without inventing input tokens', () => {
  const estimate = estimateOpenAICost('gpt-6-luna', 'standard', {
    output_tokens: 50_000,
  });

  assertMoney(estimate.estimated_cost_usd, 0.025);
  assert.deepEqual(estimate.billable_tokens, {
    uncached_input: 0,
    cached_input: 0,
    cache_write: 0,
    output: 50_000,
  });
});

test('uses long-context pricing only when input exceeds 272K tokens', () => {
  const shortEstimate = estimateOpenAICost('gpt-6-luna', 'standard', {
    input_tokens: OPENAI_LONG_CONTEXT_THRESHOLD_TOKENS,
    output_tokens: 1_000,
  });
  const longEstimate = estimateOpenAICost('gpt-6-luna', 'standard', {
    input_tokens: OPENAI_LONG_CONTEXT_THRESHOLD_TOKENS + 1,
    output_tokens: 1_000,
  });

  assert.equal(shortEstimate.context_band, 'short');
  assert.equal(longEstimate.context_band, 'long');
});

test('prices known snapshot model ids through the reviewed canonical model card', () => {
  const estimate = estimateOpenAICost('gpt-6-luna-2026-09-22', 'standard', {
    input_tokens: 10_000,
    output_tokens: 1_000,
  });

  assert.equal(estimate.canonical_model, 'gpt-6-luna');
  assertMoney(estimate.estimated_cost_usd, 0.0015);
});

test('applies reviewed processing-mode multipliers', () => {
  const standard = estimateOpenAICost('gpt-6-luna', 'standard', {
    input_tokens: 10_000,
    output_tokens: 1_000,
  });
  const batch = estimateOpenAICost('gpt-6-luna', 'batch', {
    input_tokens: 10_000,
    output_tokens: 1_000,
  });
  const fast = estimateOpenAICost('gpt-6-luna', 'fast', {
    input_tokens: 10_000,
    output_tokens: 1_000,
  });

  assertMoney(batch.estimated_cost_usd, standard.estimated_cost_usd * 0.5);
  assertMoney(fast.estimated_cost_usd, standard.estimated_cost_usd * 2);
});

test('leaves unknown models unpriced instead of guessing', () => {
  const estimate = estimateOpenAICost('gpt-future-unknown', 'standard', {
    input_tokens: 10_000,
    output_tokens: 1_000,
  });

  assert.equal(estimate.estimated_cost_usd, null);
  assert.equal(estimate.canonical_model, null);
  assert.equal(estimate.context_band, null);
  assert.equal(estimate.billable_tokens, null);
});

test('rejects inconsistent cache accounting instead of producing a false estimate', () => {
  const estimate = estimateOpenAICost('gpt-6-luna', 'standard', {
    input_tokens: 100,
    cached_input_tokens: 80,
    cache_write_tokens: 30,
    output_tokens: 10,
  });

  assert.equal(estimate.estimated_cost_usd, null);
  assert.match(estimate.pricing_assumption, /exceed total input tokens/);
});
