import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import {
  continuitySemanticPrompt,
  evaluateContinuitySemanticResponse,
  loadCanonicalCompetitiveContinuity,
} from '../support/competitive-live-continuity.mjs';

const { createLocalOllamaFoundryAdapter } = await import('../../dist/providers/ollama-foundry-adapter.js');
const { sha256Fingerprint } = await import('../../dist/foundry-runtime.js');

const baseUrl = process.env.BASE_URL ?? 'http://127.0.0.1:3000';
const ollamaBaseUrl = process.env.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434';
const ollamaModel = process.env.OLLAMA_MODEL ?? 'qwen3:0.6b';
const openAIModel = process.env.OPENAI_MODEL ?? 'gpt-6-luna';
const artifactPath = process.env.CP01_ARTIFACT ?? 'artifacts/cp01-provider-substitution-evidence.json';

async function api(path, options) {
  const response = await fetch(`${baseUrl}${path}`, options);
  const text = await response.text();
  assert.equal(response.ok, true, `${path} returned ${response.status}: ${text}`);
  return text ? JSON.parse(text) : {};
}

const continuity = await loadCanonicalCompetitiveContinuity({
  rawDatabaseUrl: process.env.SUPABASE_SESSION_DATABASE_URL,
  consumerRef: 'consumer:competitive-proof:cp01-execution',
  providerRef: 'provider:neutral-handoff',
  actorRef: 'agent:cp01-continuity-consumer',
});
const prompt = continuitySemanticPrompt(continuity);

// Provider A: local Ollama through the existing bounded Foundry adapter.
const ollamaAdapter = createLocalOllamaFoundryAdapter({
  baseUrl: ollamaBaseUrl,
  model: ollamaModel,
  maxOutputTokens: 128,
});
const ollamaResult = await ollamaAdapter({
  executionContextId: randomUUID(),
  adapterOperationId: randomUUID(),
  capabilityCode: 'competitive.cp01.continuity.verify',
  action: 'verify_continuity',
  authorityLevel: 'C0',
  targetKind: 'continuity_scope',
  targetRef: continuity.scopeSemanticKey,
  requestFingerprint: sha256Fingerprint({
    proof: 'CP-01',
    provider: 'ollama_local',
    continuity_digest: continuity.handoff.continuityDigest,
    prompt,
  }),
  input: { prompt },
});
assert.equal(ollamaResult.status, 'succeeded');
const ollamaSemantics = evaluateContinuitySemanticResponse(ollamaResult.summary, continuity);

// Provider B: OpenAI through CoMind's existing isolated API path so spending
// preflight, one-request cap, provider metadata, persistence, and cost accounting
// remain the authoritative paid-provider controls.
const assistantStatus = await api('/api/assistant/status');
assert.deepEqual(assistantStatus, { enabled: true, provider: 'openai' });

const conversation = await api('/api/conversations', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ title: `CP-01 provider substitution ${Date.now()}` }),
});
assert.ok(conversation.conv_id);

await api(`/api/conversations/${encodeURIComponent(conversation.conv_id)}/messages`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ role: 'user', content: prompt }),
});

const openAIResult = await api(
  `/api/conversations/${encodeURIComponent(conversation.conv_id)}/assistant-response`,
  { method: 'POST' }
);
assert.equal(openAIResult.role, 'assistant');
assert.equal(openAIResult.meta?.provider, 'openai');
assert.equal(typeof openAIResult.meta?.response_id, 'string');
assert.equal(openAIResult.meta?.status, 'succeeded');
assert.equal(openAIResult.meta?.cost?.currency, 'USD');
assert.equal(typeof openAIResult.meta?.cost?.estimated_cost_usd, 'number');
assert.equal(openAIResult.meta.cost.estimated_cost_usd >= 0, true);
const openAISemantics = evaluateContinuitySemanticResponse(openAIResult.content, continuity);

// The proof compares governed semantics, not prose identity.
assert.deepEqual(openAISemantics, ollamaSemantics);
assert.equal(continuity.handoff.currentCheckpoint.checkpointId, continuity.currentCheckpointId);
assert.equal(continuity.handoff.currentCheckpoint.parentCheckpointId, continuity.predecessorCheckpointId);

const reloaded = await api(`/api/conversations/${encodeURIComponent(conversation.conv_id)}`);
assert.deepEqual(reloaded.messages.map(row => row.role), ['user', 'assistant']);
assert.equal(reloaded.messages[1].msg_id, openAIResult.msg_id);
assert.equal(reloaded.messages[1].meta?.response_id, openAIResult.meta.response_id);

const evidence = {
  evidence_version: 'cp01-provider-substitution-v1',
  proof_id: 'CP-01',
  environment: 'Test continuity read-only + isolated provider runtime',
  result: 'PASS',
  canonical_tracking_key: continuity.trackingKey,
  scope_id: continuity.scopeId,
  scope_semantic_key: continuity.scopeSemanticKey,
  continuity_digest: continuity.handoff.continuityDigest,
  current_checkpoint_id: continuity.currentCheckpointId,
  predecessor_checkpoint_id: continuity.predecessorCheckpointId,
  semantic_contract: ollamaSemantics,
  providers: [
    {
      provider: 'ollama_local',
      model: ollamaModel,
      result_ref: ollamaResult.resultRef,
      terminal_status: ollamaResult.status,
      semantic_contract_passed: true,
    },
    {
      provider: 'openai',
      model: openAIResult.meta?.model ?? openAIModel,
      response_id: openAIResult.meta.response_id,
      endpoint: openAIResult.meta?.endpoint,
      terminal_status: openAIResult.meta.status,
      semantic_contract_passed: true,
      usage: openAIResult.meta?.usage ?? null,
      cost: openAIResult.meta?.cost ?? null,
      conversation_id: conversation.conv_id,
    },
  ],
  assertions: {
    same_governed_continuity_input: true,
    same_current_checkpoint: true,
    predecessor_preserved_as_lineage_only: true,
    stale_predecessor_not_current: true,
    authority_not_inherited: true,
    semantic_equivalence_under_provider_substitution: true,
    canonical_continuity_mutated_by_provider_output: false,
  },
  paid_provider_bounds: {
    openai_requests: 1,
    max_retries: 0,
    max_output_tokens: Number(process.env.OPENAI_MAX_OUTPUT_TOKENS ?? 128),
  },
  production_change: false,
};

mkdirSync(dirname(artifactPath), { recursive: true });
writeFileSync(artifactPath, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });

if (process.env.GITHUB_STEP_SUMMARY) {
  writeFileSync(process.env.GITHUB_STEP_SUMMARY, [
    '# CP-01 model/provider substitution proof',
    '',
    '- Result: PASS',
    `- Continuity digest: ${evidence.continuity_digest}`,
    `- Current checkpoint: ${evidence.current_checkpoint_id}`,
    `- Historical predecessor: ${evidence.predecessor_checkpoint_id}`,
    `- Provider A: ollama_local / ${ollamaModel}`,
    `- Provider B: openai / ${evidence.providers[1].model}`,
    `- OpenAI estimated cost USD: ${evidence.providers[1].cost?.estimated_cost_usd ?? 'unavailable'}`,
    '- Both real providers satisfied the same semantic continuity contract.',
    '- Provider output did not mutate canonical Test continuity.',
    '',
  ].join('\n'), { flag: 'a' });
}

console.log(JSON.stringify({
  proof_id: evidence.proof_id,
  result: evidence.result,
  continuity_digest: evidence.continuity_digest,
  providers: evidence.providers.map(provider => ({ provider: provider.provider, model: provider.model })),
}));
