import { createLiveLifecycleHarness } from '../support/ve-lifecycle-live-harness.mjs';

function env(name, fallback = null) {
  const value = process.env[name]?.trim();
  return value && value.length > 0 ? value : fallback;
}

const artifactPath = env('VE_LIFECYCLE_ARTIFACT', 'artifacts/ve-lifecycle-test-evidence.json');
const harness = createLiveLifecycleHarness({
  connectionString: process.env.SUPABASE_SESSION_DATABASE_URL,
  applicationName: 'comind-ve-lifecycle-manual-test',
  artifactPath,
});

try {
  const evidence = await harness.execute({
    action: env('VE_LIFECYCLE_ACTION'),
    profileId: env('VE_LIFECYCLE_PROFILE_ID'),
    requestedByActorId: env('VE_LIFECYCLE_REQUESTED_BY_ACTOR_ID'),
    authorizationDecisionId: env('VE_LIFECYCLE_AUTHORIZATION_DECISION_ID'),
    reason: env('VE_LIFECYCLE_REASON'),
    idempotencyKey: env('VE_LIFECYCLE_IDEMPOTENCY_KEY'),
    expectedFromState: env('VE_LIFECYCLE_EXPECTED_FROM_STATE'),
    expectedToState: env('VE_LIFECYCLE_EXPECTED_TO_STATE'),
    expectedErrorCode: env('VE_LIFECYCLE_EXPECTED_ERROR_CODE'),
    requireNoExternalResources: env('VE_LIFECYCLE_REQUIRE_NO_EXTERNAL_RESOURCES', 'true') !== 'false',
  });
  harness.writeEvidence(evidence, artifactPath);
} finally {
  await harness.close();
}
