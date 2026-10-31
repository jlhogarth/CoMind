#!/usr/bin/env bash
set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
target_branch="cbe-001-governed-browser-executor"
state_dir="${CBE_PROOF_STATE_DIR:-/workspaces/.comind-cbe-proof}"
proof_file="${state_dir}/proof.json"
evidence_relative="docs/provenance/2026-10-31-cbe-001-codespaces-runtime-proof.json"
evidence_path="${repository_root}/${evidence_relative}"

if [[ "${CODESPACES:-}" != "true" ]]; then
  echo "CBE proof-only bootstrap must run inside GitHub Codespaces." >&2
  exit 2
fi

mkdir -p "${state_dir}" "${CBE_PROFILE_DIR:-/workspaces/.comind-cbe-profile}"
chmod 700 "${state_dir}" "${CBE_PROFILE_DIR:-/workspaces/.comind-cbe-profile}"

current_branch="$(git -C "${repository_root}" branch --show-current)"
if [[ "${current_branch}" != "${target_branch}" ]]; then
  echo "CBE proof requires branch ${target_branch}; found ${current_branch}." >&2
  exit 3
fi

git -C "${repository_root}" fetch origin "${target_branch}"
git -C "${repository_root}" merge --ff-only "origin/${target_branch}"

if [[ -s "${evidence_path}" ]]; then
  echo "CBE Codespaces runtime proof already exists."
  exit 0
fi

export CBE_PROFILE_DIR="${CBE_PROFILE_DIR:-/workspaces/.comind-cbe-profile}"
export CBE_PROOF_OUTPUT="${proof_file}"
rm -f "${proof_file}"

cd "${repository_root}/server"
npm ci
npx playwright install --with-deps chromium
npm run build
node scripts/cbe-codespace-runtime-proof.mjs

if [[ ! -s "${proof_file}" ]]; then
  echo "CBE Codespaces runtime proof did not produce evidence." >&2
  exit 4
fi

cd "${repository_root}"
git fetch origin "${target_branch}"
git merge --ff-only "origin/${target_branch}"

if [[ -s "${evidence_path}" ]]; then
  echo "CBE Codespaces runtime proof was already recorded by another worker."
  exit 0
fi

cp "${proof_file}" "${evidence_path}"
git add "${evidence_relative}"
git \
  -c user.name="CoMind CBE Test" \
  -c user.email="83435038+jlhogarth@users.noreply.github.com" \
  commit -m "CBE-001: record Codespaces runtime proof"
git push origin "HEAD:${target_branch}"

echo "CBE Codespaces runtime proof completed and pushed."
