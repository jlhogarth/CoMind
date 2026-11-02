import fs from 'node:fs';

const manifest = JSON.parse(fs.readFileSync('config/cbe_railway_acceptance_manifest.json', 'utf8'));
const provenance = fs.readFileSync('docs/provenance/2026-11-01-cbe-host-001-railway-acceptance-contract.md', 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(manifest.schemaVersion === 1, 'schemaVersion must be 1');
assert(manifest.workKey === 'CBE-HOST-001', 'work key mismatch');
assert(manifest.productionChange === false, 'Production change must remain false');
assert(manifest.hostingActivated === false, 'Hosting must not be activated by this contract');
assert(manifest.paidCommitmentAuthorized === false, 'Paid commitment must remain unauthorized');

const railway = manifest.railway;
assert(railway.project.name === 'CoMind OC-002 Acceptance', 'unexpected Railway project');
assert(railway.environment.name === 'acceptance', 'unexpected Railway environment');
assert(railway.existingOperatorConsole.name === 'operator-console-oc002', 'operator console identity mismatch');
assert(railway.existingOperatorConsole.repurposeAsCbe === false, 'Operator Console must not be repurposed as CBE');

const cbe = railway.proposedCbeService;
assert(cbe.name === 'cbe-execution-acceptance', 'CBE service name mismatch');
assert(cbe.source.repo === 'jlhogarth/CoMind', 'CBE source repository mismatch');
assert(cbe.source.branch === 'main', 'CBE acceptance source must track main');
assert(cbe.source.rootDirectory === '/server', 'CBE root directory must be /server');
assert(cbe.source.dockerfilePath === 'Dockerfile.cbe', 'CBE Dockerfile path mismatch');
assert(cbe.healthcheckPath === '/health', 'CBE health path must be /health');
assert(cbe.profileMountPath === '/var/lib/comind/cbe-profile', 'CBE profile mount mismatch');
assert(cbe.routineNetworking === 'private', 'Routine control traffic must prefer private networking');
assert(cbe.publicExecutionDomainRequired === false, 'Routine CBE execution must not require a public domain');
assert(cbe.livenessAuthority === false, 'CBE process residency must not become AED liveness authority');

const volume = railway.proposedPersistentVolume;
assert(volume.mountPath === cbe.profileMountPath, 'volume and CBE profile mount must match');
assert(volume.initialTargetSizeGB === 0.5, 'initial acceptance volume target must fit the Railway Free limit');
assert(volume.containsAuthenticatedBrowserState === true, 'volume must be classified as authenticated browser state');
assert(volume.mustNotBePublic === true, 'browser profile volume must remain private');

const config = manifest.configuration;
const secretNames = new Set(config.secretNames);
assert(secretNames.has('CBE_CONTROL_TOKEN'), 'CBE_CONTROL_TOKEN secret name is required');
assert(secretNames.has('DATABASE_URL'), 'DATABASE_URL secret name is required');
assert(config.humanAuthUrlVariable === 'CBE_HUMAN_AUTH_URL', 'human auth variable mismatch');
assert(config.secretValuesPermittedInRepository === false, 'secret values must never be stored in repository contract');
for (const [key, value] of Object.entries(config.nonSecretVariables)) {
  assert(typeof value === 'string' && value.length > 0, `non-secret variable ${key} must be non-empty`);
  assert(!/token|password|secret|apikey|api_key/i.test(value), `non-secret variable ${key} appears credential-shaped`);
}

const cost = manifest.costGate;
assert(cost.free.baseMonthlyUsd === 0, 'Railway Free base price mismatch');
assert(cost.free.maxMemoryGbPerService === 0.5, 'Railway Free memory limit mismatch');
assert(cost.free.maxVolumeGb === 0.5, 'Railway Free volume limit mismatch');
assert(cost.hobby.minimumMonthlyUsd === 5, 'Railway Hobby minimum mismatch');
assert(cost.resourceRates.volumeUsdPerGbMonth === 0.15, 'Railway volume rate mismatch');
assert(cost.paidCommitmentRequiresExplicitHumanAuthorization === true, 'paid commitment must require human authorization');
assert(cost.planSelection === 'after_empirical_acceptance_measurement', 'plan selection must remain measurement-driven');

const requiredMeasurements = new Set(manifest.acceptanceMeasurements);
for (const measurement of [
  'server_idle_memory_gb',
  'browser_start_peak_memory_gb',
  'browser_steady_memory_gb',
  'profile_persistence_across_restart',
  'serverless_wake_latency_seconds',
  'bounded_test_cost_usd'
]) {
  assert(requiredMeasurements.has(measurement), `missing acceptance measurement ${measurement}`);
}

const governance = manifest.governance;
assert(governance.deploymentRequiresSeparateAuthorization === true, 'deployment must retain separate authorization');
assert(governance.paidPlanRequiresSeparateAuthorization === true, 'paid plan must retain separate authorization');
assert(governance.productionActivationAuthorized === false, 'Production must remain unauthorized');
assert(governance.routineMobileControlMustNotExposeBearerToken === true, 'mobile control must not expose bearer capability');
assert(governance.aedLivenessMustNotDependOnCbeProcessResidency === true, 'AED liveness must remain independent of CBE residency');
assert(governance.conversationWakeRemainsFailClosedUntilExactRecoveryResolverIsBound === true, 'conversation wake must remain fail-closed');

assert(provenance.includes('No Railway mutation was performed'), 'provenance must state the no-mutation boundary');
assert(provenance.includes('operator-console-oc002'), 'provenance must preserve Operator Console separation');
assert(provenance.includes('0.5 GB'), 'provenance must document the Free memory/volume constraint');
assert(provenance.includes('$5'), 'provenance must document the Hobby cost boundary');

console.log('CBE-HOST-001 Railway acceptance contract verified');
