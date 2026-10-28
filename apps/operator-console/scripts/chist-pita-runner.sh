#!/usr/bin/env bash
set -euo pipefail
umask 077

APP_ROOT="$(pwd)"
REPO_ROOT="$(cd ../.. && pwd)"
SERVER_ROOT="$REPO_ROOT/server"
WORK="/tmp/comind-chist-pita"
CHUNKS="$WORK/chunks"
ZIP="$WORK/openai-export.zip"
ENC="$WORK/openai-export.enc"
EXPECTED_DB_USER="comind_archive_ingest_login.sbgfuanxiqepcoboxzcl"

CANONICAL_BYTES="535654634"
CANONICAL_SHA256="125f79141e7aa8c046e6c8f3c6a12c0dd5507ec4f58d261af697fa62fdf87b2e"
CIPHER_SHA256="4ac50d08752ac6059dda89422af304af82a8f7fbd980673b59045f86f8e3c32c"

PART_HASHES=(
  "65dff85b5079b7616ca116441426554028fa6ecd80a674ac14cd0d383c31fdc1"
  "85be3c688146feb650c48bcf20b310261f6b23bd6c3f141e6688c628c0f93e3b"
  "311e041848b07a42effd7469db0d4efe011198a02daf4fea06af90f905de2b9c"
  "7b2418679a51f9f45a0f26ee533160890ec6df14c8969bd7c10e183fa29f7458"
  "2dbd07996ccb57b76bfdd023f246ca9232193a89771570ac4551e498aca43ac7"
  "274905c0720b92f3b9b8ce95a7435b0eae9b923b96f28d1c79d0f6f044653a96"
  "c1d1e894c60757543734dde5e9fa85eadf7e55805f8d403c427412684b16f73c"
  "865a318469417837f07de31ba89515066798f7df9bbf2b5e5566846ecf0b800c"
  "93e5d046db5707ac75ed71aaf78d4d42ba88c9bb4856b6adee19cede41dd417c"
  "9593c0aaa783135cbc8307ae0659156112846eb42772d61dd04d14d13a448da6"
  "75ca85edcd498f5c96ec6cddb2384412f334603576320c134534b5df6c733a18"
)

required=(
  CHATGPT_ARCHIVE_DATABASE_URL
  CHIST_PITA_TRANSFER_KEY
  CHIST_PITA_TRANSFER_IV
  CHIST_PITA_URL_00 CHIST_PITA_URL_01 CHIST_PITA_URL_02 CHIST_PITA_URL_03
  CHIST_PITA_URL_04 CHIST_PITA_URL_05 CHIST_PITA_URL_06 CHIST_PITA_URL_07
  CHIST_PITA_URL_08 CHIST_PITA_URL_09 CHIST_PITA_URL_10
)
for name in "${required[@]}"; do
  if [[ -z "${!name:-}" ]]; then
    echo "CHIST PIT-A runner missing required protected variable: $name" >&2
    exit 20
  fi
done

rm -rf "$WORK"
mkdir -p "$CHUNKS"

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

echo "CHIST PIT-A: running governed database preflight"
node dist/archive/chatgpt-export-cli.js --preflight > "$WORK/preflight.json"
node -e "const r=require(process.argv[1]); console.log(JSON.stringify({status:r.status,databaseName:r.databaseName,sessionUser:r.sessionUser,currentUser:r.currentUser}))" "$WORK/preflight.json"

echo "CHIST PIT-A: acquiring encrypted source chunks concurrently"
pids=()
for i in $(seq -w 0 10); do
  var="CHIST_PITA_URL_${i}"
  out="$CHUNKS/part-${i}"
  curl --fail --location --silent --show-error --retry 2 --retry-all-errors "${!var}" -o "$out" &
  pids+=("$!")
done
for pid in "${pids[@]}"; do
  wait "$pid"
done

for i in $(seq -w 0 10); do
  out="$CHUNKS/part-${i}"
  index=$((10#$i))
  got="$(sha256sum "$out" | awk '{print $1}')"
  if [[ "$got" != "${PART_HASHES[$index]}" ]]; then
    echo "CHIST PIT-A: encrypted chunk integrity failure at part-${i}" >&2
    exit 21
  fi
done
echo "CHIST PIT-A: encrypted chunk integrity PASS (11/11)"

cat "$CHUNKS"/part-* > "$ENC"
if [[ "$(sha256sum "$ENC" | awk '{print $1}')" != "$CIPHER_SHA256" ]]; then
  echo "CHIST PIT-A: reconstructed ciphertext integrity failure" >&2
  exit 22
fi

echo "CHIST PIT-A: ciphertext integrity PASS"
openssl enc -d -aes-256-ctr \
  -K "$CHIST_PITA_TRANSFER_KEY" \
  -iv "$CHIST_PITA_TRANSFER_IV" \
  -in "$ENC" -out "$ZIP"
rm -f "$ENC"
rm -rf "$CHUNKS"

bytes="$(wc -c < "$ZIP" | tr -d ' ')"
sha="$(sha256sum "$ZIP" | awk '{print $1}')"
if [[ "$bytes" != "$CANONICAL_BYTES" || "$sha" != "$CANONICAL_SHA256" ]]; then
  echo "CHIST PIT-A: canonical source identity failure" >&2
  exit 23
fi
unzip -tqq "$ZIP"
echo "CHIST PIT-A: canonical source PASS bytes=$bytes sha256=$sha"

echo "CHIST PIT-A: beginning first real governed baseline ingestion"
started="$(date +%s)"
node dist/archive/chatgpt-export-cli.js "$ZIP" > "$WORK/import.json"
elapsed="$(( $(date +%s) - started ))"
node -e "const r=require(process.argv[1]); console.log(JSON.stringify({status:r.status,importId:r.importId,sourceArchiveId:r.sourceArchiveId,receiptSha256:r.receiptSha256,reused:r.reused}))" "$WORK/import.json"
echo "CHIST PIT-A: first ingest process elapsed_seconds=$elapsed"

rm -f "$ZIP" "$WORK/import.json" "$WORK/preflight.json"
echo "CHIST PIT-A: ingestion stage complete; independent reconciliation is still required before certification"

cd "$APP_ROOT"
npx next build
