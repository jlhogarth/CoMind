#!/usr/bin/env bash
set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
verifier="${repository_root}/scripts/verify_pr_merge_candidate_identity.sh"
work_root="$(mktemp -d)"
trap 'rm -rf "${work_root}"' EXIT

export GIT_AUTHOR_NAME='CoMind Test'
export GIT_AUTHOR_EMAIL='comind-test@example.invalid'
export GIT_COMMITTER_NAME='CoMind Test'
export GIT_COMMITTER_EMAIL='comind-test@example.invalid'

origin="${work_root}/origin.git"
seed="${work_root}/seed"
candidate="${work_root}/candidate"

git init --bare "${origin}" >/dev/null
git clone "${origin}" "${seed}" >/dev/null 2>&1
git -C "${seed}" checkout -b main >/dev/null 2>&1
printf 'base-0\n' >"${seed}/state.txt"
git -C "${seed}" add state.txt
git -C "${seed}" commit -m 'base 0' >/dev/null
git -C "${seed}" push -u origin main >/dev/null 2>&1
base0="$(git -C "${seed}" rev-parse HEAD)"

git -C "${seed}" checkout -b feature >/dev/null 2>&1
printf 'feature\n' >"${seed}/feature.txt"
git -C "${seed}" add feature.txt
git -C "${seed}" commit -m 'feature' >/dev/null
source_head="$(git -C "${seed}" rev-parse HEAD)"
git -C "${seed}" push -u origin feature >/dev/null 2>&1

git clone "${origin}" "${candidate}" >/dev/null 2>&1

git -C "${candidate}" config user.name 'CoMind Test'
git -C "${candidate}" config user.email 'comind-test@example.invalid'
git -C "${candidate}" fetch --all >/dev/null 2>&1

make_candidate() {
  local base_sha="$1"
  local source_sha="$2"
  git -C "${candidate}" checkout --detach "${base_sha}" >/dev/null 2>&1
  git -C "${candidate}" merge --no-ff --no-edit "${source_sha}" >/dev/null 2>&1
  git -C "${candidate}" rev-parse HEAD
}

verify_pass() {
  local candidate_sha="$1"
  local expected_source="$2"
  local event_base="$3"
  (
    cd "${candidate}"
    EXPECTED_SOURCE_HEAD="${expected_source}" \
    EVENT_BASE_HEAD="${event_base}" \
    BASE_REF='main' \
    GITHUB_SHA="${candidate_sha}" \
    bash "${verifier}" >/dev/null
  )
}

verify_fail() {
  local candidate_sha="$1"
  local expected_source="$2"
  local event_base="$3"
  if (
    cd "${candidate}"
    EXPECTED_SOURCE_HEAD="${expected_source}" \
    EVENT_BASE_HEAD="${event_base}" \
    BASE_REF='main' \
    GITHUB_SHA="${candidate_sha}" \
    bash "${verifier}" >/dev/null 2>&1
  ); then
    echo 'Expected merge-candidate identity verification to fail.' >&2
    exit 1
  fi
}

# 1. Unchanged base: event base, candidate base, and current base are identical.
candidate0="$(make_candidate "${base0}" "${source_head}")"
verify_pass "${candidate0}" "${source_head}" "${base0}"

# Advance main after the original candidate exists.
git -C "${seed}" checkout main >/dev/null 2>&1
printf 'base-1\n' >>"${seed}/state.txt"
git -C "${seed}" add state.txt
git -C "${seed}" commit -m 'base 1' >/dev/null
base1="$(git -C "${seed}" rev-parse HEAD)"
git -C "${seed}" push origin main >/dev/null 2>&1

# 2. Candidate remains on the event base while current main advances. This is valid ancestry.
verify_pass "${candidate0}" "${source_head}" "${base0}"

# 3. GitHub-style regenerated candidate uses the newer base while the event base remains older.
git -C "${candidate}" fetch origin main >/dev/null 2>&1
candidate1="$(make_candidate "${base1}" "${source_head}")"
verify_pass "${candidate1}" "${source_head}" "${base0}"

# 4. Exact source mismatch must fail even when the base lineage is valid.
verify_fail "${candidate1}" "${base1}" "${base0}"

# Build an unrelated base lineage and a candidate whose source parent is still exact.
git -C "${seed}" checkout --orphan unrelated >/dev/null 2>&1
git -C "${seed}" rm -rf . >/dev/null 2>&1 || true
printf 'unrelated\n' >"${seed}/unrelated.txt"
git -C "${seed}" add unrelated.txt
git -C "${seed}" commit -m 'unrelated base' >/dev/null
unrelated="$(git -C "${seed}" rev-parse HEAD)"
git -C "${candidate}" fetch "${seed}" "${unrelated}" >/dev/null 2>&1

git -C "${candidate}" checkout --detach "${unrelated}" >/dev/null 2>&1
git -C "${candidate}" merge --allow-unrelated-histories --no-ff --no-edit "${source_head}" >/dev/null 2>&1
unrelated_candidate="$(git -C "${candidate}" rev-parse HEAD)"

# 5. An unrelated candidate base must fail the event-base ancestry check.
verify_fail "${unrelated_candidate}" "${source_head}" "${base0}"

# Force-push main to an unrelated lineage after creating a valid candidate.
git -C "${seed}" push --force origin "${unrelated}:main" >/dev/null 2>&1

# 6. A divergent/force-pushed current base must fail closed.
verify_fail "${candidate1}" "${source_head}" "${base0}"

printf 'PR merge-candidate identity verification tests passed.\n'
