#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL must identify an isolated PostgreSQL test database}"

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

printf 'Reusing REE-001 isolated governance reconstruction for RCO-001...\n'
bash "${repository_root}/scripts/test_ree_001_rule_evaluation_engine.sh"

printf 'Applying RCO-001 composition migration...\n'
psql -X "${DATABASE_URL}" -v ON_ERROR_STOP=1 \
  -f "${repository_root}/db/migrations/20261026_013_rco_001_rule_composition_ordering.sql"

printf 'Running RCO-001 deterministic composition verification...\n'
psql -X "${DATABASE_URL}" -v ON_ERROR_STOP=1 \
  -f "${repository_root}/db/verification/20261026_rco_001_rule_composition_ordering_verification.sql"

printf 'Running RCO-001 reconciliation/supersession regression verification...\n'
psql -X "${DATABASE_URL}" -v ON_ERROR_STOP=1 \
  -f "${repository_root}/db/verification/20261026_rco_001_reconciliation_supersession_verification.sql"

printf 'RCO-001 rule composition and deterministic ordering verification passed.\n'
