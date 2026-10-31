#!/usr/bin/env bash
set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
target_branch="cbe-001-governed-browser-executor"
state_dir="${CBE_AUTOSTART_STATE_DIR:-/workspaces/.comind-cbe-autostart}"
evidence_relative="docs/provenance/2026-10-31-cbe-001-codespaces-authenticated-proof.json"
evidence_path="${repository_root}/${evidence_relative}"
pid_file="${state_dir}/pid"
log_file="${state_dir}/run.log"
proof_file="${state_dir}/proof.json"

mkdir -p "${state_dir}"
chmod 700 "${state_dir}"

if [[ -s "${evidence_path}" ]]; then
  echo "CBE authenticated Codespaces proof already exists; autostart skipped."
  exit 0
fi

if [[ -s "${pid_file}" ]]; then
  existing_pid="$(cat "${pid_file}")"
  if kill -0 "${existing_pid}" >/dev/null 2>&1; then
    echo "CBE authenticated Codespaces proof is already running as PID ${existing_pid}."
    exit 0
  fi
  rm -f "${pid_file}"
fi

(
  set -euo pipefail
  trap 'rm -f "${pid_file}"' EXIT

  current_branch="$(git -C "${repository_root}" branch --show-current)"
  if [[ "${current_branch}" != "${target_branch}" ]]; then
    echo "CBE autostart requires branch ${target_branch}; found ${current_branch}." >&2
    exit 2
  fi

  export CBE_PROFILE_DIR="${CBE_PROFILE_DIR:-/workspaces/.comind-cbe-profile}"
  export CBE_PROOF_OUTPUT="${proof_file}"

  rm -f "${proof_file}"
  bash "${repository_root}/scripts/cbe_codespace_browser.sh"

  if [[ ! -s "${proof_file}" ]]; then
    echo "CBE authenticated Codespaces proof did not produce evidence." >&2
    exit 3
  fi

  git -C "${repository_root}" fetch origin "${target_branch}"
  git -C "${repository_root}" merge --ff-only "origin/${target_branch}"

  if [[ -s "${evidence_path}" ]]; then
    echo "CBE authenticated Codespaces proof was already recorded by another worker."
    exit 0
  fi

  cp "${proof_file}" "${evidence_path}"
  git -C "${repository_root}" add "${evidence_relative}"
  git -C "${repository_root}" \
    -c user.name="CoMind CBE Test" \
    -c user.email="83435038+jlhogarth@users.noreply.github.com" \
    commit -m "CBE-001: record authenticated Codespaces proof"
  git -C "${repository_root}" push origin "HEAD:${target_branch}"
) >>"${log_file}" 2>&1 &

started_pid=$!
printf '%s\n' "${started_pid}" >"${pid_file}"
chmod 600 "${pid_file}" "${log_file}" 2>/dev/null || true

echo "CBE authenticated Codespaces proof started in the background as PID ${started_pid}."
echo "Runtime log: ${log_file}"
