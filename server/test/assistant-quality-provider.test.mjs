import assert from 'node:assert/strict';
import test from 'node:test';

const {
  ProviderBackedQualityRepairer,
  ProviderBackedQualityVerifier,
} = await import('../dist/assistant-quality-provider.js');

function providerReturning(content, calls, metadata = { provider: 'openai' }) {
  return {
    name: 'openai',
    async generateResponse(request) {
      calls.push(request);
      return { content, metadata };
    },
  };
}

test('provider-backed verifier requests strict structured verdict and preserves metering metadata', async () => {
  const calls = [];
  const metadata = {
    provider: 'openai',
    model: 'gpt-6-luna',
    usage: { input_tokens: 20, output_tokens: 5, total_tokens: 25 },
    cost: { estimated_cost_usd: 0.0000045, currency: 'USD' },
  };
  const verifier = new ProviderBackedQualityVerifier(providerReturning(
    JSON.stringify({
      verdict: 'revise',
      critique: 'Arithmetic mismatch.',
      issue_categories: ['arithmetic_logical_error'],
    }),
    calls,
    metadata
  ));

  const result = await verifier.verify({
    conversationId: '44444444-4444-4444-8444-444444444449',
    messages: [{ role: 'user', content: 'Calculate 6 * 7.' }],
    draft: { content: '41' },
  });

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].messages.map((message) => message.role), ['system', 'user']);
  assert.match(calls[0].messages[0].content, /Return exactly one JSON object/);
  assert.match(calls[0].messages[1].content, /Calculate 6 \* 7/);
  assert.equal(result.verdict, 'revise');
  assert.equal(result.critique, 'Arithmetic mismatch.');
  assert.deepEqual(result.issueCategories, ['arithmetic_logical_error']);
  assert.deepEqual(result.metadata, metadata);
});

test('provider-backed verifier rejects malformed or unsupported structured results', async () => {
  for (const content of [
    'not json',
    JSON.stringify([]),
    JSON.stringify({ verdict: 'maybe', issue_categories: [] }),
    JSON.stringify({ verdict: 'approve', issue_categories: ['invented_category'] }),
  ]) {
    const verifier = new ProviderBackedQualityVerifier(providerReturning(content, []));
    await assert.rejects(
      verifier.verify({
        conversationId: '44444444-4444-4444-8444-444444444449',
        messages: [{ role: 'user', content: 'Verify this.' }],
        draft: { content: 'Draft' },
      })
    );
  }
});

test('provider-backed repairer sends critique and returns metered repaired response', async () => {
  const calls = [];
  const repaired = {
    provider: 'openai',
    model: 'gpt-6-luna',
    usage: { input_tokens: 30, output_tokens: 6, total_tokens: 36 },
    cost: { estimated_cost_usd: 0.000006, currency: 'USD' },
  };
  const repairer = new ProviderBackedQualityRepairer(
    providerReturning('The answer is 42.', calls, repaired)
  );

  const response = await repairer.repair({
    conversationId: '44444444-4444-4444-8444-444444444449',
    messages: [{ role: 'user', content: 'Calculate 6 * 7.' }],
    draft: { content: 'The answer is 41.' },
    critique: 'Arithmetic mismatch.',
    issueCategories: ['arithmetic_logical_error'],
  });

  assert.equal(response.content, 'The answer is 42.');
  assert.deepEqual(response.metadata, repaired);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].messages.map((message) => message.role), ['system', 'user']);
  assert.match(calls[0].messages[1].content, /Arithmetic mismatch/);
  assert.match(calls[0].messages[1].content, /arithmetic_logical_error/);
});
