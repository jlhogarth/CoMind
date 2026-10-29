#!/usr/bin/env bash
set -euo pipefail

cat >&2 <<'EOF'
The legacy OpenAI live smoke script is disabled by DRULE-003.

Normal assistant OpenAI execution is now RuleBook-governed and requires:
- an authoritative conversation governance binding;
- current time-bounded egress approval;
- DRULE-C11, DRULE-C17, and DRULE-C13 allow decisions;
- an approved governed paid-access binding and proposal;
- zero automatic retries.

A real provider smoke test must be executed through a separately reviewed governed-live proof that binds an explicit synthetic conversation and records the paid-access proposal before any provider or token-count API call.
EOF

exit 2
