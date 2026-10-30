#!/usr/bin/env bash
set -euo pipefail
repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
: "${DATABASE_URL:?DATABASE_URL required for isolated CFR-002A verification}"
DATABASE_URL="${DATABASE_URL}" python3 - <<'PY'
import os,sys
from urllib.parse import urlparse
p=urlparse(os.environ['DATABASE_URL']); allowed={'localhost','127.0.0.1','::1','db'}
if p.scheme not in ('postgres','postgresql') or p.hostname not in allowed or p.path != '/comind_ci':
    print('Refusing CFR-002A verification outside local isolated comind_ci.', file=sys.stderr); raise SystemExit(2)
PY
printf 'Reusing CFR-002 foundation acceptance harness...\n'
bash "${repository_root}/scripts/test_cfr_002_dual_acquisition.sh"
printf 'Running CFR-002A OpenAI provider stream unit proof...\n'
(cd "${repository_root}/server" && node --test test/openai-provider-streaming.test.mjs)
printf 'Running CFR-002A constrained acquisition-store integration proof...\n'
(cd "${repository_root}/server" && node --test test/integration/conversation-acquisition-store.test.mjs)
printf 'Running CFR-001 continuity regression with CFR-002A ordering proof...\n'
(cd "${repository_root}/server" && node --test test/integration/assistant-continuity-streaming.test.mjs)
printf 'CFR-002A supported OpenAI provider-event acquisition acceptance: PASS\n'
