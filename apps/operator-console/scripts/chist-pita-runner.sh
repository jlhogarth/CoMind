#!/usr/bin/env bash
set -euo pipefail
umask 077

REPO_ROOT="$(cd ../.. && pwd)"
SERVER_ROOT="$REPO_ROOT/server"
WORK="/tmp/comind-chist-pita"
EXPECTED_DB_USER="comind_archive_ingest_login.sbgfuanxiqepcoboxzcl"

if [[ -z "${CHATGPT_ARCHIVE_DATABASE_URL:-}" ]]; then
  echo "CHIST PIT-A preflight missing CHATGPT_ARCHIVE_DATABASE_URL" >&2
  exit 20
fi

rm -rf "$WORK"
mkdir -p "$WORK"
cd "$SERVER_ROOT"

echo "CHIST PIT-A: installing governed archive server dependencies"
npm ci --include=dev --no-audit --no-fund
echo "CHIST PIT-A: compiling governed archive server"
npm run build

export CHATGPT_ARCHIVE_DATABASE_URL="$(node -e '
const raw = process.env.CHATGPT_ARCHIVE_DATABASE_URL;
const expected = process.argv[1];
const u = new URL(raw);
if (!u.hostname.endsWith(".pooler.supabase.com")) throw new Error("archive URL is not a Supabase pooler endpoint");
if (u.port !== "5432") throw new Error("archive URL must use Session pooler port 5432");
u.username = expected;
process.stdout.write(u.toString());
' "$EXPECTED_DB_USER")"

echo "CHIST PIT-A: running governed database preflight only"
node dist/archive/chatgpt-export-cli.js --preflight > "$WORK/preflight.json"
node -e "const r=require(process.argv[1]); console.log(JSON.stringify({status:r.status,databaseName:r.databaseName,sessionUser:r.sessionUser,currentUser:r.currentUser}))" "$WORK/preflight.json"
rm -f "$WORK/preflight.json"
echo "CHIST PIT-A: corrected credential preflight complete; no archive source was downloaded and no import was attempted"

# Emit a minimal build artifact so the Preview build can finish without invoking the application build.
mkdir -p "$REPO_ROOT/apps/operator-console/.next"
printf '{"version":3}\n' > "$REPO_ROOT/apps/operator-console/.next/BUILD_ID"
