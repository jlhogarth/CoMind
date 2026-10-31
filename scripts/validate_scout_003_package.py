import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
manifest = json.loads((ROOT / 'docs/ve/scout/SCOUT-003-ACTIVATION-AND-FIRST-DAY.v0.1.json').read_text())
packet = json.loads((ROOT / 'docs/ve/scout/SCOUT-R001-EVIDENCE-PACKET.v0.1.json').read_text())
assert manifest['control_id'] == 'SCOUT-003'
assert manifest['issue'] == 427
assert manifest['identity']['actor_handle'] == 'agent.scout'
assert manifest['identity']['authority_ceiling'] == 'C1'
assert manifest['learning_gate']['automatic_activation_allowed'] is False
assert manifest['learning_gate']['accountable_human_attestation_required'] is True
assert manifest['learning_gate']['attestation_actor_handle'] == 'joseph.hogarth'
assert manifest['assignment']['capability_code'] == 'research.evidence.synthesize'
assert manifest['assignment']['target_ref'] == 'scout-r001:ve-standards-operational-readiness'
assert manifest['assignment']['max_tasks'] == 1
assert manifest['assignment']['cost_usd_max'] == 0
assert manifest['runtime']['paid_provider_allowed'] is False
assert manifest['runtime']['production_allowed'] is False
assert manifest['grant']['revoke_after_first_day'] is True
required = [s for s in packet['sources'] if s['required']]
assert len(required) == 3
assert all(s['authority_level'] == 'primary_authoritative' for s in required)
assert all(s['lifecycle_status'] == 'current' for s in required)
assert all(len(s['content_sha256']) == 64 for s in required)
withdrawn = [s for s in packet['sources'] if s['lifecycle_status'] == 'withdrawn']
assert len(withdrawn) == 1 and withdrawn[0]['superseded_by_ref_id']
assert packet['open_web_discovery_allowed'] is False
prohibited_markers = ('TO' + 'DO', 'PLACE' + 'HOLDER', 'TB' + 'D')
for path in [
    ROOT / '.github/workflows/scout-003.yml',
    ROOT / 'server/test/support/scout-003-live-first-day.mjs',
    ROOT / 'server/test/scout-003-contract.test.mjs',
]:
    text = path.read_text()
    assert all(marker not in text for marker in prohibited_markers)
print('pass|scout-003-package|issue=427|required_sources=3|human_attestation=true|max_tasks=1|cost_usd=0')
