import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const manifest = JSON.parse(readFileSync(new URL('../../docs/ve/scout/SCOUT-003-ACTIVATION-AND-FIRST-DAY.v0.1.json', import.meta.url), 'utf8'));
const packet = JSON.parse(readFileSync(new URL('../../docs/ve/scout/SCOUT-R001-EVIDENCE-PACKET.v0.1.json', import.meta.url), 'utf8'));

assert.equal(manifest.control_id, 'SCOUT-003');
assert.equal(manifest.issue, 427);
assert.equal(manifest.identity.actor_handle, 'agent.scout');
assert.equal(manifest.identity.authority_ceiling, 'C1');
assert.equal(manifest.learning_gate.automatic_activation_allowed, false);
assert.equal(manifest.learning_gate.accountable_human_attestation_required, true);
assert.equal(manifest.assignment.capability_code, 'research.evidence.synthesize');
assert.equal(manifest.assignment.target_kind, 'research_assignment');
assert.equal(manifest.assignment.max_tasks, 1);
assert.equal(manifest.assignment.cost_usd_max, 0);
assert.equal(manifest.runtime.adapter, 'ollama_local');
assert.equal(manifest.runtime.model, 'qwen3:0.6b');
assert.equal(manifest.runtime.paid_provider_allowed, false);
assert.equal(manifest.runtime.production_allowed, false);
assert.equal(manifest.grant.revoke_after_first_day, true);
const required = packet.sources.filter((source) => source.required);
assert.equal(required.length, 3);
assert.ok(required.every((source) => source.authority_level === 'primary_authoritative'));
assert.ok(required.every((source) => source.lifecycle_status === 'current'));
assert.ok(packet.sources.some((source) => source.lifecycle_status === 'withdrawn' && source.superseded_by_ref_id));
console.log('pass|scout-003-contract|human_attestation=required|authority=C1|provider=ollama_local|max_tasks=1');
