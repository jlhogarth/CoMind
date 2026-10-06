#!/usr/bin/env bash
set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
port="${PORT:-3000}"
base_url="http://127.0.0.1:${port}"
verification_id="$(date +%s)"
verification_title="OpenAI live verification ${verification_id}"
verification_message="Reply briefly that CoMind provider persistence is verified. Verification id: ${verification_id}"
server_log="$(mktemp)"

: "${DATABASE_URL:?DATABASE_URL must identify the isolated comind_runtime database}"
: "${OPENAI_API_KEY:?OPENAI_API_KEY is required for live OpenAI verification}"

export ASSISTANT_PROVIDER=openai
export OPENAI_MODEL="${OPENAI_MODEL:-gpt-6-luna}"
export OPENAI_REASONING_EFFORT="${OPENAI_REASONING_EFFORT:-low}"
export OPENAI_MAX_OUTPUT_TOKENS="${OPENAI_MAX_OUTPUT_TOKENS:-128}"
export PORT="${port}"

node <<'NODE'
const parsed = new URL(process.env.DATABASE_URL);
const allowedHosts = new Set(['db', 'localhost', '127.0.0.1']);
if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
  console.error('Live provider verification requires a PostgreSQL URL.');
  process.exit(2);
}
if (!allowedHosts.has(parsed.hostname) || parsed.pathname !== '/comind_runtime') {
  console.error('Refusing live provider verification outside the isolated comind_runtime database.');
  process.exit(2);
}
NODE

bash "${repository_root}/scripts/bootstrap_dev_runtime.sh"

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
    echo "CoMind server did not become ready for live provider verification." >&2
    exit 1
  fi
  sleep 1
done

export BASE_URL="${base_url}"
export VERIFICATION_TITLE="${verification_title}"
export VERIFICATION_MESSAGE="${verification_message}"

if ! conversation_id="$(node <<'NODE'
import assert from 'node:assert/strict';

const baseUrl = process.env.BASE_URL;
const title = process.env.VERIFICATION_TITLE;
const message = process.env.VERIFICATION_MESSAGE;

async function request(path, options) {
  const response = await fetch(`${baseUrl}${path}`, options);
  const text = await response.text();
  assert.equal(response.ok, true, `${path} returned ${response.status}: ${text}`);
  return text ? JSON.parse(text) : {};
}

const status = await request('/api/assistant/status');
assert.deepEqual(status, { enabled: true, provider: 'openai' });

const conversation = await request('/api/conversations', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ title }),
});
assert.ok(conversation.conv_id);

await request(`/api/conversations/${encodeURIComponent(conversation.conv_id)}/messages`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ role: 'user', content: message }),
});

const assistant = await request(
  `/api/conversations/${encodeURIComponent(conversation.conv_id)}/assistant-response`,
  { method: 'POST' }
);
assert.equal(assistant.role, 'assistant');
assert.equal(typeof assistant.content, 'string');
assert.ok(assistant.content.length > 0);
assert.equal(assistant.meta?.provider, 'openai');
assert.equal(typeof assistant.meta?.model, 'string');
assert.equal(typeof assistant.meta?.response_id, 'string');

const reloaded = await request(`/api/conversations/${encodeURIComponent(conversation.conv_id)}`);
assert.deepEqual(reloaded.messages.map((row) => row.role), ['user', 'assistant']);
assert.equal(reloaded.messages[1].msg_id, assistant.msg_id);
assert.equal(reloaded.messages[1].content, assistant.content);

console.error(`OpenAI live API verification passed for response ${assistant.meta.response_id}.`);
process.stdout.write(conversation.conv_id);
NODE
)"; then
  cat "${server_log}" >&2
  echo "Live OpenAI verification failed; server diagnostics emitted above." >&2
  exit 1
fi

persisted_count="$(
  psql "${DATABASE_URL}" \
    -v ON_ERROR_STOP=1 \
    -v conversation_id="${conversation_id}" \
    -At <<'SQL'
SELECT COUNT(*)
FROM comind.cm_message
WHERE conv_id = :'conversation_id'::uuid
  AND role = 'assistant'
  AND meta->>'provider' = 'openai'
  AND NULLIF(meta->>'response_id', '') IS NOT NULL;
SQL
)"

if [[ "${persisted_count}" != "1" ]]; then
  echo "Expected one persisted OpenAI assistant response, found ${persisted_count}." >&2
  exit 1
fi

echo "Live OpenAI response is persisted in isolated PostgreSQL conversation ${conversation_id}."
