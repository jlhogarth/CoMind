#!/usr/bin/env bash
set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
port="${PORT:-3000}"
base_url="http://127.0.0.1:${port}"
verification_id="${GITHUB_RUN_ID:-local}-$(date +%s)"
verification_title="Browser verification ${verification_id}"
verification_message="CoMind browser persistence ${verification_id}"
server_log="$(mktemp)"

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required for browser verification." >&2
  exit 2
fi

(
  cd "${repository_root}/server"
  npm run build
  exec node dist/index.js
) >"${server_log}" 2>&1 &
server_pid=$!

cleanup() {
  kill "${server_pid}" >/dev/null 2>&1 || true
  wait "${server_pid}" >/dev/null 2>&1 || true
  rm -f "${server_log}"
}
trap cleanup EXIT

for attempt in $(seq 1 30); do
  if curl --fail --silent "${base_url}/health" >/dev/null 2>&1; then
    break
  fi
  if [[ "${attempt}" -eq 30 ]]; then
    cat "${server_log}" >&2
    echo "CoMind server did not become ready for browser verification." >&2
    exit 1
  fi
  sleep 1
done

export BASE_URL="${base_url}"
export BROWSER_VERIFICATION_TITLE="${verification_title}"
export BROWSER_VERIFICATION_MESSAGE="${verification_message}"
export BROWSER_VERIFICATION_SCREENSHOT="${repository_root}/artifacts/chat-browser-verification.png"

python3 "${repository_root}/scripts/verify_chat_browser.py"

persisted_count="$(
  psql "${DATABASE_URL}" \
    -v ON_ERROR_STOP=1 \
    -v verification_title="${verification_title}" \
    -v verification_message="${verification_message}" \
    -At <<'SQL'
SELECT COUNT(*)
FROM comind.cm_conversation AS c
JOIN comind.cm_message AS m ON m.conv_id = c.conv_id
WHERE c.title = :'verification_title'
  AND m.role = 'user'
  AND m.content = :'verification_message';
SQL
)"

if [[ "${persisted_count}" != "1" ]]; then
  echo "Expected exactly one browser-created persisted row, found ${persisted_count}." >&2
  exit 1
fi

echo "Direct PostgreSQL verification passed for browser-created data ${verification_id}."
