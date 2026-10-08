import assert from 'node:assert/strict';
import test from 'node:test';

const { MeteredQualityGateProvider } = await import('../dist/assistant-quality-gate.js');

function governedMetadata(role, reservationId) {
  const fingerprint = `sha256:${role.padEnd(64, role[0]).slice(0, 64)}`;
  return {
    provider: 'openai',
    model: 'gpt-6-luna',
    endpoint: 'responses.create',
    response_id: `resp-${role}`,
    status: 'succeeded',
    execution_role: role,
    attempt_number: 1,
    request_fingerprint: fingerprint,
    max_retries: 0,
    governed_execution: {
      schema_version: 1,
      provider: 'openai',
      operation_name: 'responses.create',
      execution_role: role,
      envelope_fingerprint: fingerprint,
      reservation: {
        reservation_id: reservationId,
        idempotency_key: `provider-execution:${fingerprint}`,
        reservation_status: 'reserved',
        idempotent: false,
      },
    },
  };
}

test('quality gate preserves independently governed draft verifier and repair receipts', async () => {
  const draftMetadata = governedMetadata('draft', '101');
  const verifierMetadata = governedMetadata('verifier', '102');
  const repairMetadata = governedMetadata('repair', '103');

  const provider = new MeteredQualityGateProvider(
    {
      name: 'openai',
      async generateResponse() {
        return { content: 'Draft', metadata: draftMetadata };
      },
    },
    {
      name: 'openai',
      async verify() {
        return {
          verdict: 'revise',
          critique: 'Revise the current claim.',
          issueCategories: ['stale_fact'],
          metadata: verifierMetadata,
        };
      },
    },
    {
      name: 'openai',
      async repair() {
        return { content: 'Repaired', metadata: repairMetadata };
      },
    }
  );

  const response = await provider.generateResponse({
    conversationId: '44444444-4444-4444-8444-444444444449',
    messages: [{ role: 'user', content: 'What is the current status?' }],
  });

  assert.equal(response.content, 'Repaired');
  const passes = response.metadata.quality_gate.passes;
  for (const [role, metadata] of [
    ['draft', draftMetadata],
    ['verifier', verifierMetadata],
    ['repair', repairMetadata],
  ]) {
    const pass = passes.find((candidate) => candidate.role === role);
    assert.ok(pass);
    assert.equal(pass.attempt_number, 1);
    assert.equal(pass.request_fingerprint, metadata.request_fingerprint);
    assert.deepEqual(pass.governed_execution, metadata.governed_execution);
  }
});
