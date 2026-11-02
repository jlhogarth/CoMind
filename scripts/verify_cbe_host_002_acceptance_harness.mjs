import fs from 'node:fs';

const runner = fs.readFileSync('server/scripts/cbe-railway-acceptance.mjs', 'utf8');
const tests = fs.readFileSync('server/test/cbe-railway-acceptance.test.mjs', 'utf8');
const schema = JSON.parse(fs.readFileSync('config/cbe_railway_acceptance_evidence_schema.json', 'utf8'));
const runbook = fs.readFileSync('docs/CBE-RAILWAY-ACCEPTANCE-RUNBOOK.md', 'utf8');
const pkg = JSON.parse(fs.readFileSync('server/package.json', 'utf8'));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(pkg.scripts?.['cbe:railway-acceptance'] === 'node scripts/cbe-railway-acceptance.mjs', 'acceptance package command mismatch');
assert(runner.includes("'stop_browser'"), 'runner must establish and restore stopped state');
assert(runner.includes("'start_browser'"), 'runner must start the governed browser');
assert(!runner.includes('wake_conversation'), 'acceptance runner must not invoke conversation wake');
assert(!runner.includes('retry_recovery'), 'acceptance runner must not invoke recovery');
assert(!runner.includes('open_auth'), 'acceptance runner must not invoke human authentication');
assert(runner.includes("environment: 'development-test'"), 'runner must be Development/Test only');
assert(runner.includes('production_change: false'), 'runner must explicitly set production_change=false');
assert(runner.includes("normalized.endsWith('.railway.internal')"), 'runner must explicitly recognize Railway private networking');
assert(runner.includes("endpoint.protocol !== 'https:'"), 'runner must require HTTPS outside approved private hosts');
assert(runner.includes('MAX_HOLD_MS = 60_000'), 'runner hold interval must be bounded to 60 seconds');
assert(runner.includes('MAX_REQUEST_TIMEOUT_MS = 60_000'), 'runner request timeout must be bounded to 60 seconds');
assert(!runner.includes('console.log(config)'), 'runner must not log configuration containing bearer capability');

assert(tests.includes('JSON.stringify(evidence).includes(TOKEN), false'), 'tests must prove evidence redacts bearer token');
assert(tests.includes('public plaintext HTTP endpoint is rejected'), 'tests must reject public plaintext HTTP');
assert(tests.includes('Railway private-network HTTP endpoint is permitted'), 'tests must cover Railway private networking');
assert(tests.includes("['stop_browser',\n      'start_browser',\n      'stop_browser']"), 'tests must verify stop-start-stop ordering');

assert(schema.$schema === 'https://json-schema.org/draft/2020-12/schema', 'evidence schema draft mismatch');
assert(schema.properties?.railway_metrics?.properties?.server_idle_memory_gb, 'schema missing server idle memory');
assert(schema.properties?.railway_metrics?.properties?.browser_start_peak_memory_gb, 'schema missing browser startup peak memory');
assert(schema.properties?.railway_metrics?.properties?.browser_steady_memory_gb, 'schema missing browser steady memory');
assert(schema.properties?.railway_metrics?.properties?.peak_cpu_vcpu, 'schema missing peak CPU');
assert(schema.properties?.runtime?.properties?.container_start_to_health_seconds, 'schema missing health latency');
assert(schema.properties?.profile_persistence, 'schema missing profile persistence evidence');
assert(schema.properties?.serverless, 'schema missing Serverless evidence');
assert(schema.properties?.cost?.properties?.bounded_test_cost_usd, 'schema missing bounded cost evidence');
assert(schema.properties?.decision?.properties?.recommended_plan, 'schema missing plan decision');

assert(runbook.includes('does not authorize deployment, paid usage, Production activation, or secret disclosure'), 'runbook must preserve authority boundary');
assert(runbook.includes('Railway private networking'), 'runbook must prefer private control transport');
assert(runbook.includes('Free vs Hobby decision gate'), 'runbook must contain plan decision gate');
assert(runbook.includes('CBE process residency is never AED liveness authority'), 'runbook must preserve AED liveness independence');
assert(runbook.includes('A hosting acceptance result does not prove conversation wake'), 'runbook must preserve conversation-wake dependency');

console.log('CBE-HOST-002 acceptance harness contract verified');
