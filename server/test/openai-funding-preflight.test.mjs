import assert from 'node:assert/strict';
import test from 'node:test';

const {
  buildOpenAIProviderExecutionEnvelope,
  executeGovernedOpenAIProviderExecutionEnvelope,
  executeGovernedOpenAIProviderStreamingEnvelope,
} = await import('../dist/providers/openai-execution.js');
const { openAIRulebookInput } = await import('./support/rulebook-execution-preflight.mjs');

for (const [name, dispatch] of [
  ['response', executeGovernedOpenAIProviderExecutionEnvelope],
  ['stream', executeGovernedOpenAIProviderStreamingEnvelope],
]) {
  for (const role of ['root', 'draft', 'verifier', 'repair']) {
    test(`${name} ${role} funding without bound authority fails before count, reserve or dispatch`, async () => {
      const reached = [];
      const envelope = buildOpenAIProviderExecutionEnvelope({
        conversationId: '11111111-1111-4111-8111-111111111111',
        messages: [{ role: 'user', content: 'Synthetic funding denial.' }],
      }, {
        model: 'gpt-6-luna', processingMode: 'standard', executionRole: role,
        reasoningEffort: 'low', maxOutputTokens: 64, timeoutMs: 1000, maxRetries: 0,
      });

      await assert.rejects(dispatch(
        { async create() { reached.push('provider'); throw new Error('must not dispatch'); } },
        envelope,
        { name: 'synthetic-counter', async countInputTokens() { reached.push('count'); return 10; } },
        { async reserveProviderExecution() { reached.push('reserve'); throw new Error('must not reserve'); } },
        undefined,
        openAIRulebookInput()
      ), /CREDIT_FUNDING_AUTHORITY_UNBOUND/);
      assert.deepEqual(reached, []);
    });
  }
}
