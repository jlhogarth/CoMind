#!/usr/bin/env bash
set -euo pipefail

: "${EXPECTED_SOURCE_HEAD:?EXPECTED_SOURCE_HEAD is required}"
: "${EVENT_BASE_HEAD:?EVENT_BASE_HEAD is required}"
: "${BASE_REF:?BASE_REF is required}"
: "${GITHUB_SHA:?GITHUB_SHA is required}"

REMOTE_NAME="${REMOTE_NAME:-origin}"

fail() {
  printf 'PR merge-candidate identity verification failed: %s\n' "$1" >&2
  exit 1
}

require_sha() {
  local name="$1"
  local value="$2"
  if [[ ! "${value}" =~ ^[0-9a-f]{40}$ ]]; then
    fail "${name} must be a lowercase 40-character Git SHA-1"
  fi
}

require_sha "EXPECTED_SOURCE_HEAD" "${EXPECTED_SOURCE_HEAD}"
require_sha "EVENT_BASE_HEAD" "${EVENT_BASE_HEAD}"
require_sha "GITHUB_SHA" "${GITHUB_SHA}"

git check-ref-format --branch "${BASE_REF}" >/dev/null 2>&1 \
  || fail "BASE_REF is not a valid branch name"

candidate_head="$(git rev-parse --verify HEAD^{commit})"
[[ "${candidate_head}" == "${GITHUB_SHA}" ]] \
  || fail "checked-out HEAD does not equal GITHUB_SHA"

read -r -a parents <<<"$(git rev-list --parents -n 1 HEAD)"
[[ "${#parents[@]}" -eq 3 ]] \
  || fail "pull-request candidate must be a two-parent merge commit"

actual_base="${parents[1]}"
actual_source="${parents[2]}"

[[ "${actual_source}" == "${EXPECTED_SOURCE_HEAD}" ]] \
  || fail "merge source parent does not equal the reviewed PR source head"

git fetch --no-tags --prune "${REMOTE_NAME}" \
  "+refs/heads/${BASE_REF}:refs/remotes/${REMOTE_NAME}/${BASE_REF}" >/dev/null

current_base="$(git rev-parse --verify "refs/remotes/${REMOTE_NAME}/${BASE_REF}^{commit}")"

git cat-file -e "${EVENT_BASE_HEAD}^{commit}" 2>/dev/null \
  || fail "event base commit is not available in the repository history"

git merge-base --is-ancestor "${EVENT_BASE_HEAD}" "${actual_base}" \
  || fail "candidate base does not descend from the event base SHA"

git merge-base --is-ancestor "${actual_base}" "${current_base}" \
  || fail "candidate base is not on the current base-branch ancestry"

printf 'Exact PR merge candidate verified.\n'
printf '  candidate:     %s\n' "${candidate_head}"
printf '  source parent: %s\n' "${actual_source}"
printf '  event base:    %s\n' "${EVENT_BASE_HEAD}"
printf '  candidate base:%s\n' "${actual_base}"
printf '  current base:  %s\n' "${current_base}"
printf '  base ref:      %s\n' "${BASE_REF}"
