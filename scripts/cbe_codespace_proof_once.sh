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

if [[ -s "${evidence_path}" ]]; then
  echo "CBE Codespaces runtime proof already exists."
  exit 0
fi

export CBE_PROFILE_DIR="${CBE_PROFILE_DIR:-/workspaces/.comind-cbe-profile}"
export CBE_PROOF_OUTPUT="${proof_file}"
export PLAYWRIGHT_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-/ms-playwright}"
rm -f "${proof_file}"

cd "${repository_root}/server"
npm ci
npm run build
node scripts/cbe-codespace-runtime-proof.mjs

if [[ ! -s "${proof_file}" ]]; then
  echo "CBE Codespaces runtime proof did not produce evidence." >&2
  exit 4
fi

cp "${proof_file}" "${evidence_path}"
chmod 644 "${evidence_path}"

cd "${repository_root}"
if ! git status --short -- "${evidence_relative}" | grep -q .; then
  echo "CBE evidence file was not detected as a workspace change." >&2
  exit 5
fi

echo "CBE Codespaces runtime proof completed. Evidence is ready for Codespaces export."
