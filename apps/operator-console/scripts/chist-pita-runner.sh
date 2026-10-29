#!/usr/bin/env bash
set -euo pipefail
umask 077

APP_ROOT="$(pwd)"
REPO_ROOT="$(cd ../.. && pwd)"
SERVER_ROOT="$REPO_ROOT/server"
WORK="/tmp/comind-chist-pita"
ZIP="$WORK/openai-export.zip"
EXPECTED_DB_USER="comind_archive_ingest_login.sbgfuanxiqepcoboxzcl"
CANONICAL_BYTES="535654634"
CANONICAL_SHA256="125f79141e7aa8c046e6c8f3c6a12c0dd5507ec4f58d261af697fa62fdf87b2e"

cleanup() {
  rm -f "$ZIP" "$WORK/import.json" "$WORK/preflight.json" "$WORK/transfer.ndjson" "$WORK/transfer-final.json"
}
trap cleanup EXIT

if [[ -z "${CHATGPT_ARCHIVE_DATABASE_URL:-}" ]]; then
  echo "CHIST PIT-A missing CHATGPT_ARCHIVE_DATABASE_URL" >&2
  exit 20
fi
if [[ -z "${CHIST_PITA_TRANSFER_ID:-}" ]]; then
  echo "CHIST PIT-A missing CHIST_PITA_TRANSFER_ID" >&2
  exit 21
fi

rm -rf "$WORK"
mkdir -p "$WORK"
cd "$SERVER_ROOT"

echo "CHIST PIT-A: installing governed archive server dependencies"
npm ci --include=dev --no-audit --no-fund
echo "CHIST PIT-A: compiling governed archive server"
npm run build

export COMIND_DATABASE_PURPOSE=chatgpt_archive
export CHATGPT_ARCHIVE_DATABASE_URL="$(node -e '
const raw = process.env.CHATGPT_ARCHIVE_DATABASE_URL;
const expected = process.argv[1];
const u = new URL(raw);
if (!u.hostname.endsWith(".pooler.supabase.com")) throw new Error("archive URL is not a Supabase pooler endpoint");
if (u.port !== "5432") throw new Error("archive URL must use Session pooler port 5432");
u.username = expected;
process.stdout.write(u.toString());
' "$EXPECTED_DB_USER")"

echo "CHIST PIT-A: running governed database preflight"
node dist/archive/chatgpt-export-cli.js --preflight > "$WORK/preflight.json"
node -e "const r=require(process.argv[1]); console.log(JSON.stringify({status:r.status,databaseName:r.databaseName,sessionUser:r.sessionUser,currentUser:r.currentUser}))" "$WORK/preflight.json"

echo "CHIST PIT-A: acquiring one-use encrypted source through governed transfer bridge"
node dist/archive/chist-pita-transfer-cli.js | tee "$WORK/transfer.ndjson"
tail -n 1 "$WORK/transfer.ndjson" > "$WORK/transfer-final.json"
node -e "const r=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8')); if(r.status!=='PASS'||r.transferConsumed!==true) throw new Error('governed transfer did not finish PASS/consumed'); console.log(JSON.stringify({status:r.status,transferConsumed:r.transferConsumed,sessionUser:r.sessionUser,currentUser:r.currentUser,sourceBytes:r.sourceBytes,sourceSha256:r.sourceSha256}))" "$WORK/transfer-final.json"

bytes="$(wc -c < "$ZIP" | tr -d ' ')"
sha="$(sha256sum "$ZIP" | awk '{print $1}')"
if [[ "$bytes" != "$CANONICAL_BYTES" || "$sha" != "$CANONICAL_SHA256" ]]; then
  echo "CHIST PIT-A: canonical source identity failed after transfer" >&2
  exit 22
fi
unzip -tqq "$ZIP"
echo "CHIST PIT-A: canonical source and ZIP integrity PASS bytes=$bytes sha256=$sha"

echo "CHIST PIT-A: beginning first real governed candidate ingestion"
started="$(date +%s)"
node dist/archive/chatgpt-export-cli.js "$ZIP" > "$WORK/import.json"
elapsed="$(( $(date +%s) - started ))"
node -e "const r=require(process.argv[1]); console.log(JSON.stringify({status:r.status,importId:r.importId,sourceArchiveId:r.sourceArchiveId,receiptSha256:r.receiptSha256,reused:r.reused}))" "$WORK/import.json"
echo "CHIST PIT-A: candidate ingestion process elapsed_seconds=$elapsed"

echo "CHIST PIT-A: deleting plaintext working source before application build"
rm -f "$ZIP" "$WORK/import.json" "$WORK/preflight.json" "$WORK/transfer.ndjson" "$WORK/transfer-final.json"

echo "CHIST PIT-A: candidate ingestion complete; independent reconciliation and certification are still required"
cd "$APP_ROOT"
npx next build
