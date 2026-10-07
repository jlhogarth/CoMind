import assert from 'node:assert/strict';
import test from 'node:test';

const {
  MeteredQualityGateProvider,
  classifyAnswerRisk,
} = await import('../dist/assistant-quality-gate.js');

function meteredMetadata(provider, responseId, inputTokens, outputTokens, cost) {
  return {
    provider,
    model: 'gpt-6-luna',
    endpoint: 'responses.create',
    response_id: responseId,
    status: 'succeeded',
    duration_ms: 5,
    usage: {
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      total_tokens: inputTokens + outputTokens,
    },
    cost: {
      estimated_cost_usd: cost,
      currency: 'USD',
      rate_card_version: 'openai-2026-10-07',
    },
  };
}

function request(content = 'Tell me a short joke.') {
  return {
    conversationId: '44444444-4444-4444-8444-444444444449',
    messages: [{ role: 'user', content }],
  };
}

test('deterministic classifier keeps ordinary low-risk requests out of verifier path', () => {
  assert.deepEqual(classifyAnswerRisk(request()), { level: 'low', reasons: [] });
});

test('deterministic classifier elevates time-sensitive, high-stakes, verification, and calculation requests', () => {
  const assessment = classifyAnswerRisk(request(
    'Verify the latest tax guidance and calculate 20% of 500 with sources.'
  ));
  assert.equal(assessment.level, 'high');
  assert.deepEqual(new Set(assessment.reasons), new Set([
    'time_sensitive_claim',
    'high_stakes_domain',
    'explicit_verification_request',
    'calculation_or_numeric_reasoning',
  ]));
});

test('low-risk answers skip verifier and repairer while preserving draft metering', async () => {
  let verifierCalls = 0;
  let repairCalls = 0;
  const provider = new MeteredQualityGateProvider(
    {
      name: 'draft-provider',
      async generateResponse() {
        return {
          content: 'A concise joke.',
          metadata: meteredMetadata('draft-provider', 'resp_draft_1', 10, 4, 0.000003),
        };
      },
    },
    {
      name: 'verifier-provider',
      async verify() {
        verifierCalls++;
        throw new Error('Verifier should not run');
      },
    },
    {
      name: 'repair-provider',
      async repair() {
        repairCalls++;
        throw new Error('Repairer should not run');
      },
    }
  );

  const response = await provider.generateResponse(request());
  assert.equal(response.content, 'A concise joke.');
  assert.equal(verifierCalls, 0);
  assert.equal(repairCalls, 0);
  assert.equal(response.metadata.quality_gate.verdict, 'skipped');
  assert.equal(response.metadata.quality_gate.outcome, 'returned');
  assert.equal(response.metadata.quality_gate.passes.length, 2);
  assert.equal(response.metadata.quality_gate.passes[0].role, 'draft');
  assert.equal(response.metadata.quality_gate.passes[0].cost.estimated_cost_usd, 0.000003);
  assert.deepEqual(response.metadata.quality_gate.passes[1], {
    role: 'final',
    source_role: 'draft',
  });
});

test('high-risk approved answers meter verifier separately and return draft', async () => {
  const provider = new MeteredQualityGateProvider(
    {
      name: 'draft-provider',
      async generateResponse() {
        return {
          content: 'Current answer.',
          metadata: meteredMetadata('draft-provider', 'resp_draft_2', 30, 8, 0.000007),
        };
      },
    },
    {
      name: 'verifier-provider',
      async verify() {
        return {
          verdict: 'approve',
          metadata: meteredMetadata('verifier-provider', 'resp_verify_1', 20, 3, 0.0000035),
        };
      },
    },
    {
      name: 'repair-provider',
      async repair() {
        throw new Error('Repair should not run');
      },
    }
  );

  const response = await provider.generateResponse(request('What is the latest status?'));
  assert.equal(response.content, 'Current answer.');
  assert.equal(response.metadata.quality_gate.verdict, 'approve');
  assert.equal(response.metadata.quality_gate.outcome, 'returned');
  assert.deepEqual(response.metadata.quality_gate.passes.map((pass) => pass.role), [
    'draft', 'verifier', 'final',
  ]);
  assert.equal(response.metadata.quality_gate.passes[1].cost.estimated_cost_usd, 0.0000035);
});

test('high-risk revise verdict repairs before return and meters all provider passes', async () => {
  const provider = new MeteredQualityGateProvider(
    {
      name: 'draft-provider',
      async generateResponse() {
        return {
          content: 'The answer is 41.',
          metadata: meteredMetadata('draft-provider', 'resp_draft_3', 20, 5, 0.0000045),
        };
      },
    },
    {
      name: 'verifier-provider',
      async verify() {
        return {
          verdict: 'revise',
          critique: 'Arithmetic is incorrect.',
          issueCategories: ['arithmetic_logical_error'],
          metadata: meteredMetadata('verifier-provider', 'resp_verify_2', 15, 5, 0.000004),
        };
      },
    },
    {
      name: 'repair-provider',
      async repair(input) {
        assert.equal(input.critique, 'Arithmetic is incorrect.');
        return {
          content: 'The answer is 42.',
          metadata: meteredMetadata('repair-provider', 'resp_repair_1', 25, 5, 0.000005),
        };
      },
    }
  );

  const response = await provider.generateResponse(request('Calculate 6 * 7.'));
  assert.equal(response.content, 'The answer is 42.');
  assert.equal(response.metadata.quality_gate.verdict, 'revise');
  assert.equal(response.metadata.quality_gate.outcome, 'repaired');
  assert.deepEqual(response.metadata.quality_gate.issue_categories, ['arithmetic_logical_error']);
  assert.deepEqual(response.metadata.quality_gate.passes.map((pass) => pass.role), [
    'draft', 'verifier', 'repair', 'final',
  ]);
  assert.equal(response.metadata.quality_gate.passes[2].cost.estimated_cost_usd, 0.000005);
});

test('reject and abstain verdicts return persisted blocked outcomes with compact telemetry', async () => {
  for (const verdict of ['reject', 'abstain']) {
    const provider = new MeteredQualityGateProvider(
      {
        name: 'draft-provider',
        async generateResponse() {
          return {
            content: 'Unverified legal claim.',
            metadata: meteredMetadata('draft-provider', `resp_${verdict}`, 20, 5, 0.0000045),
          };
        },
      },
      {
        name: 'verifier-provider',
        async verify() {
          return {
            verdict,
            critique: 'Evidence is insufficient.',
            issueCategories: ['unsupported_claim'],
            metadata: meteredMetadata('verifier-provider', `verify_${verdict}`, 15, 4, 0.0000035),
          };
        },
      },
      {
        name: 'repair-provider',
        async repair() {
          throw new Error('Repair should not run');
        },
      }
    );

    const response = await provider.generateResponse(request('Verify this legal claim.'));
    assert.match(response.content, /did not pass CoMind answer-quality verification/);
    assert.equal(response.metadata.quality_gate.verdict, verdict);
    assert.equal(response.metadata.quality_gate.outcome, 'blocked');
    assert.equal(response.metadata.quality_gate.critique, 'Evidence is insufficient.');
    assert.deepEqual(response.metadata.quality_gate.passes.at(-1), {
      role: 'final',
      source_role: 'blocked',
    });
  }
});

test('verifier failure can fail closed or explicitly return draft as unverified fallback', async () => {
  const draftProvider = {
    name: 'draft-provider',
    async generateResponse() {
      return {
        content: 'Draft during verifier outage.',
        metadata: meteredMetadata('draft-provider', 'resp_draft_4', 20, 4, 0.000004),
      };
    },
  };
  const verifier = {
    name: 'verifier-provider',
    async verify() {
      const error = new Error('Synthetic verifier outage');
      error.providerMetadata = meteredMetadata(
        'verifier-provider', 'resp_verify_failed', 12, 0, 0.0000012
      );
      throw error;
    },
  };
  const repairer = {
    name: 'repair-provider',
    async repair() {
      throw new Error('Repair should not run');
    },
  };

  const failClosed = new MeteredQualityGateProvider(draftProvider, verifier, repairer);
  const blocked = await failClosed.generateResponse(request('What is the latest status?'));
  assert.match(blocked.content, /could not complete the required answer-quality verification/);
  assert.equal(blocked.metadata.quality_gate.verdict, 'verifier_failed');
  assert.equal(blocked.metadata.quality_gate.outcome, 'blocked');
  assert.deepEqual(blocked.metadata.quality_gate.issue_categories, ['verifier_failure']);
  assert.equal(blocked.metadata.quality_gate.passes[1].role, 'verifier');
  assert.equal(blocked.metadata.quality_gate.passes[1].cost.estimated_cost_usd, 0.0000012);
  assert.equal(blocked.metadata.quality_gate.passes.at(-1).source_role, 'blocked');

  const failOpen = new MeteredQualityGateProvider(
    draftProvider,
    verifier,
    repairer,
    { verifierFailureFallback: 'return_draft' }
  );
  const response = await failOpen.generateResponse(request('What is the latest status?'));
  assert.equal(response.content, 'Draft during verifier outage.');
  assert.equal(response.metadata.quality_gate.verdict, 'verifier_failed');
  assert.equal(response.metadata.quality_gate.outcome, 'returned_unverified');
  assert.equal(response.metadata.quality_gate.passes[1].cost.estimated_cost_usd, 0.0000012);
});

test('verifier critique is trimmed and bounded before telemetry persistence', async () => {
  const provider = new MeteredQualityGateProvider(
    {
      name: 'draft-provider',
      async generateResponse() {
        return { content: 'Draft', metadata: {} };
      },
    },
    {
      name: 'verifier-provider',
      async verify() {
        return { verdict: 'approve', critique: `  ${'x'.repeat(1200)}  ` };
      },
    },
    {
      name: 'repair-provider',
      async repair() {
        throw new Error('Repair should not run');
      },
    }
  );

  const response = await provider.generateResponse(request('Verify this source.'));
  assert.equal(response.metadata.quality_gate.critique.length, 1000);
});
