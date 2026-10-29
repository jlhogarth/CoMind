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
CIPHER_SHA256="02cc6a51c00f66b3796c1cd40dd3e2118eb7e3a63bb23148e981d8a7b7f9a2c0"

PART_HASHES=(
  "a808d6067328aa3842c5904a3537e8128e740cfaf159696aa47ab983c2e1b10d"
  "7a0caf6c454db92919ab6b7cd4660ae22ad3dfbc2965ee142b91b6ea9241e267"
  "f7829a1d4319012143bd882713c6ea16d5f7f95a408a33b1c9876dcc235ef967"
  "3cae1cbfa0d75f95815a4830317df80cc0cd03d5ff39901e16777da44af3165b"
  "fb723d7c2d4525d6b6559729eba00f60d27d17e5a132b42e7fd9bb44646d49a4"
  "54e10a5364acdd6eb0fc9573786e25bc5bccc4afa966a7d3cfb933508c7ab0a4"
  "7840909e37482015ea87ec464e953a68221180dd818d18639f42af3c02b970f4"
  "8ace504319dcc9bff66da89be788efea1a72c491b150efa7fb7ffba079ee2744"
  "cc0cd96232715b9ad99d57c34c8a5f481184a001f57c099c78214f29b766d3d7"
  "c2bc3f3f9c2f389a1d34b86a660410bc7b5eaec4dfbb3c11114d1759e15c73e1"
  "98631696a070c7357da9eb84f8f72d6e095645ddcfe18a9acfc98467c1e5afa0"
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
