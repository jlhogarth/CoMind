import assert from 'node:assert/strict';
import test from 'node:test';

process.env.DATABASE_URL = 'postgres://test:test@localhost:5432/comind_test';

const { MeteredQualityGateProvider } = await import('../dist/assistant-quality-gate.js');

test('quality gate observes draft and repair stages without forwarding verifier output', async () => {
  const observed = [];
  let verifierCalls = 0;

  const provider = new MeteredQualityGateProvider(
    {
      name: 'draft-provider',
      async generateResponse(_request, observer) {
        assert.equal(observer.stage, 'draft');
        await observer.onTextDelta({
          delta: 'Draft text',
          stage: observer.stage,
          providerEventType: 'synthetic.delta',
          providerSequenceNumber: 1,
          providerResponseId: 'draft-response',
        });
        return { content: 'Draft text', metadata: { provider: 'draft-provider' } };
      },
    },
    {
      name: 'verifier-provider',
      async verify() {
        verifierCalls += 1;
        return {
          verdict: 'revise',
          critique: 'Use repaired text.',
          issueCategories: ['unsupported_claim'],
          metadata: { provider: 'verifier-provider' },
        };
      },
    },
    {
      name: 'repair-provider',
      async repair(_input, observer) {
        assert.equal(observer.stage, 'repair');
        await observer.onTextDelta({
          delta: 'Repaired text',
          stage: observer.stage,
          providerEventType: 'synthetic.delta',
          providerSequenceNumber: 1,
          providerResponseId: 'repair-response',
        });
        return { content: 'Repaired text', metadata: { provider: 'repair-provider' } };
      },
    },
    { verifierFailureFallback: 'block' }
  );

  const response = await provider.generateResponse(
    {
      conversationId: '44444444-4444-4444-8444-444444444449',
      messages: [{ role: 'user', content: 'Verify the current claim with evidence.' }],
    },
    {
      stage: 'direct',
      onTextDelta(event) {
        observed.push(event);
      },
    }
  );

  assert.equal(verifierCalls, 1);
  assert.equal(response.content, 'Repaired text');
  assert.deepEqual(
    observed.map((event) => [event.stage, event.delta, event.providerResponseId]),
    [
      ['draft', 'Draft text', 'draft-response'],
      ['repair', 'Repaired text', 'repair-response'],
    ]
  );
  assert.equal(observed.some((event) => event.stage === 'direct'), false);
});
