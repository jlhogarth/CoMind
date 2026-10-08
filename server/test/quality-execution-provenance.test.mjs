import assert from 'node:assert/strict';
import test from 'node:test';

const { MeteredQualityGateProvider } = await import('../dist/assistant-quality-gate.js');

function executionMetadata(role, fingerprint) {
  return {
    provider: 'openai',
    model: 'gpt-6-luna-2026-09-22',
    endpoint: 'responses.create',
    response_id: `resp_${role}`,
    status: 'succeeded',
    duration_ms: 5,
    requested_model: 'gpt-6-luna',
    canonical_model: 'gpt-6-luna',
    processing_mode: 'standard',
    execution_role: role,
    request_fingerprint: fingerprint,
    timeout_ms: 30000,
    max_retries: 0,
    usage: { input_tokens: 10, output_tokens: 2, total_tokens: 12 },
    cost: {
      estimated_cost_usd: 0.000002,
      currency: 'USD',
      rate_card_version: 'openai-2026-10-07',
      pricing_source: 'https://developers.openai.com/api/docs/pricing',
    },
  };
}

test('quality pass telemetry preserves immutable provider execution provenance per paid role', async () => {
  const fingerprints = {
    draft: `sha256:${'1'.repeat(64)}`,
    verifier: `sha256:${'2'.repeat(64)}`,
    repair: `sha256:${'3'.repeat(64)}`,
  };
  const provider = new MeteredQualityGateProvider(
    {
      name: 'openai',
      async generateResponse() {
        return {
          content: 'Incorrect draft.',
          metadata: executionMetadata('draft', fingerprints.draft),
        };
      },
    },
    {
      name: 'openai',
      async verify() {
        return {
          verdict: 'revise',
          critique: 'Repair the answer.',
          issueCategories: ['unsupported_claim'],
          metadata: executionMetadata('verifier', fingerprints.verifier),
        };
      },
    },
    {
      name: 'openai',
      async repair() {
        return {
          content: 'Corrected answer.',
          metadata: executionMetadata('repair', fingerprints.repair),
        };
      },
    }
  );

  const response = await provider.generateResponse({
    conversationId: '44444444-4444-4444-8444-444444444449',
    messages: [{ role: 'user', content: 'Verify the latest claim.' }],
  });

  const paidPasses = response.metadata.quality_gate.passes.slice(0, 3);
  assert.deepEqual(paidPasses.map((pass) => pass.role), ['draft', 'verifier', 'repair']);
  assert.deepEqual(
    paidPasses.map((pass) => pass.execution_role),
    ['draft', 'verifier', 'repair']
  );
  assert.deepEqual(
    paidPasses.map((pass) => pass.request_fingerprint),
    [fingerprints.draft, fingerprints.verifier, fingerprints.repair]
  );
  for (const pass of paidPasses) {
    assert.equal(pass.requested_model, 'gpt-6-luna');
    assert.equal(pass.canonical_model, 'gpt-6-luna');
    assert.equal(pass.processing_mode, 'standard');
    assert.equal(pass.timeout_ms, 30000);
    assert.equal(pass.max_retries, 0);
  }
});
