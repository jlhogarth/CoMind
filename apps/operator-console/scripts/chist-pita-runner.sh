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
CIPHER_SHA256="6640c333cd6ce4ff65c6ba327ac316166c70024a96c2b0e0340aaca163965eec"

PART_HASHES=(
  "cfc14e05ba6e3367efa087722f24584f4b9882a249561bac43b27511e972c0af"
  "5a273b48da90a9dbd94383dc95a2bb1cb9ae0f23f01e56e262131ccdcf45a97f"
  "677182fb2f5ae07abf3dafc1c55e13fdfaa700dd879778161b2e0ef83b56607c"
  "57e8e1bd323a1bec5958c3fbafe9d7b88d4104086a95ff2a1d5dca63de39daf5"
  "05707bcf79bc335e169ed5f0dd56a456fef8c8fbd53e3731ccedda95693fc718"
  "d0be48c137332b7f8fa34d32bb0510e383a5dc75352e5d264407faefb513380d"
  "b84ed34d5a7d4f97f6b6b530425e64c7701974a7527e3af0fcd56b0138caeb86"
  "55c557afa2877f4180e84d93813988aaa2885acfdd327846dccf1568a83717eb"
  "9b7a83540dcc57f31c4b66ed7c1b552eeb33491d7026d6a97b615aeae9b749d0"
  "0e9abc5450feadd5f5a08f3e1e4a52de85e1cac12bca7eace7bf21737c26c67a"
  "aa297116045838782e2518d363b6c77061cf92caf3e921cc1defba2926abd42c"
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
