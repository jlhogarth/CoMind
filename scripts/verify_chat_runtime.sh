#!/usr/bin/env bash
set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
port="${PORT:-3000}"
base_url="http://127.0.0.1:${port}"
verification_id="${GITHUB_RUN_ID:-local}-$(date +%s)"
verification_title="Runtime verification ${verification_id}"
verification_message="CoMind browser database path ${verification_id}"
server_log="$(mktemp)"

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required for runtime verification." >&2
  exit 2
fi

(
  cd "${repository_root}/server"
  npm run build
  exec node dist/index.js >"${server_log}" 2>&1
) &
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
    echo "CoMind server did not become ready." >&2
    exit 1
  fi
  sleep 1
done

export BASE_URL="${base_url}"
export VERIFICATION_TITLE="${verification_title}"
export VERIFICATION_MESSAGE="${verification_message}"

node <<'NODE'
import assert from 'node:assert/strict';

const baseUrl = process.env.BASE_URL;
const title = process.env.VERIFICATION_TITLE;
const message = process.env.VERIFICATION_MESSAGE;

async function request(path, options) {
  const response = await fetch(`${baseUrl}${path}`, options);
  const text = await response.text();
  assert.equal(response.ok, true, `${path} returned ${response.status}: ${text}`);
  return { response, text };
}

const chat = await request('/chat');
assert.match(chat.text, /<title>CoMind Chat<\/title>/);

const created = await request('/api/conversations', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ title })
});
const conversation = JSON.parse(created.text);
assert.ok(conversation.conv_id);

await request(`/api/conversations/${encodeURIComponent(conversation.conv_id)}/messages`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ role: 'user', content: message })
});

const reloaded = await request(`/api/conversations/${encodeURIComponent(conversation.conv_id)}`);
const detail = JSON.parse(reloaded.text);
assert.equal(detail.conversation.title, title);
assert.ok(detail.messages.some((row) => row.role === 'user' && row.content === message));

const search = await request(`/api/messages/search?q=${encodeURIComponent(message)}`);
const searchRows = JSON.parse(search.text);
assert.ok(searchRows.some((row) => row.conv_id === conversation.conv_id));

const analytics = await request('/api/analytics/summary');
const summary = JSON.parse(analytics.text);
assert.ok(summary.conversations >= 1);
assert.ok(summary.messages >= 1);

console.log(`HTTP runtime verification passed for conversation ${conversation.conv_id}.`);
NODE

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
  echo "Expected exactly one persisted runtime verification row, found ${persisted_count}." >&2
  exit 1
fi

echo "Direct PostgreSQL verification passed for ${verification_id}."
