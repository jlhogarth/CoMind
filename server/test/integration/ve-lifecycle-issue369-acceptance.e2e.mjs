import assert from 'node:assert/strict';
import { createLiveLifecycleHarness } from '../support/ve-lifecycle-live-harness.mjs';

const PROFILE_ID = '57a3f546-2e01-4499-b677-fc59b9ad5412';
const REQUESTER_ID = '78c69f2f-0d0d-4551-8c37-3007263e3ce9';
const EXPIRED_DECISION_ID = '9867a158-5bcf-4485-813d-ed9ca9682891';
const FRESH_DECISION_ID = '97205bf1-20b6-4da6-adc6-aeb2bba14819';
const POSITIVE_IDEMPOTENCY_KEY = 've-life-002-issue369-synthetic-activate-v1';
const ARTIFACT_PATH = 'artifacts/ve-lifecycle-issue369-acceptance.json';

const harness = createLiveLifecycleHarness({
  connectionString: process.env.SUPABASE_SESSION_DATABASE_URL,
  applicationName: 'comind-ve-life-002-issue369',
  artifactPath: ARTIFACT_PATH,
});

try {
  await harness.verifyDatabaseIdentity();
  const initial = await harness.snapshot(PROFILE_ID, POSITIVE_IDEMPOTENCY_KEY);
  assert.equal(initial.external_resources, 0, 'Synthetic acceptance profile unexpectedly has provider resources');

  if (initial.status === 'active') {
    const terminal = await harness.terminalAudit(PROFILE_ID, POSITIVE_IDEMPOTENCY_KEY);
    assert.equal(terminal.length, 1, 'Active replay state lacks the unique accepted VE-LIFE-002 terminal audit');
    harness.writeEvidence({
      evidence_version: 've-life-002-issue369-v1',
      issue: 369,
      outcome: 'replay_verified',
      environment: 'test',
      synthetic: true,
      profile_id: PROFILE_ID,
      idempotency_key: POSITIVE_IDEMPOTENCY_KEY,
      final_state: initial,
      terminal_audit: terminal[0],
      production_touched: false,
      provider_adapters_registered: false,
      paid_api_used: false,
    }, ARTIFACT_PATH);
  } else {
    assert.equal(initial.status, 'draft', 'Issue #369 acceptance requires draft or previously accepted active state');

    const negative = await harness.execute({
      action: 'activate',
      profileId: PROFILE_ID,
      requestedByActorId: REQUESTER_ID,
      authorizationDecisionId: EXPIRED_DECISION_ID,
      reason: 'VE-LIFE-002 negative proof using the deliberately expired authorization.',
      idempotencyKey: 've-life-002-issue369-expired-negative-v1',
      expectedFromState: 'draft',
      expectedErrorCode: 'authorization_expired',
      requireNoExternalResources: true,
    });

    const positive = await harness.execute({
      action: 'activate',
      profileId: PROFILE_ID,
      requestedByActorId: REQUESTER_ID,
      authorizationDecisionId: FRESH_DECISION_ID,
      reason: 'VE-LIFE-002 positive proof through the real lifecycle coordinator.',
      idempotencyKey: POSITIVE_IDEMPOTENCY_KEY,
      expectedFromState: 'draft',
      expectedToState: 'active',
      requireNoExternalResources: true,
    });

    assert.equal(positive.after.lifecycle_audits, initial.lifecycle_audits + 2,
      'Successful activation must add exactly started and completed lifecycle audit events');

    harness.writeEvidence({
      evidence_version: 've-life-002-issue369-v1',
      issue: 369,
      outcome: 'negative_and_positive_proofs_passed',
      environment: 'test',
      synthetic: true,
      profile_id: PROFILE_ID,
      expired_authorization_decision_id: EXPIRED_DECISION_ID,
      fresh_authorization_decision_id: FRESH_DECISION_ID,
      negative_proof: negative,
      positive_proof: positive,
      production_touched: false,
      provider_adapters_registered: false,
      paid_api_used: false,
    }, ARTIFACT_PATH);
  }
} finally {
  await harness.close();
}
