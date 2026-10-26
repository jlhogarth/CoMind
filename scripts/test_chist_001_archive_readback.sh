#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${root}/server"

export COMIND_DATABASE_PURPOSE=chatgpt_history
export CHATGPT_HISTORY_DATABASE_URL='postgresql://chist_history_login:history-test-password@localhost:5432/comind_ci'
node dist/history/conversation-history-cli.js show native-history-1 > /tmp/chist_archive_readback.json

python3 - <<'PY'
import json
show=json.load(open('/tmp/chist_archive_readback.json'))
archive=show['derived']['archive']
assert archive['provenanceLayer']=='derived_evidence'
assert archive['sourceBasis']=='certified_archive'
assert archive['run'] is not None
assert archive['run']['result_state']=='completed'
assert len(archive['analytics']) > 0
assert show['derived']['live']['analytics']
assert 'presented separately' in show['derived']['note']
print('CHIST-001 archive-derived history readback: PASS')
PY
