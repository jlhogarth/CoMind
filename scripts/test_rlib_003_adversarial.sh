#!/usr/bin/env bash
# Synthetic isolated CI cases only. Every mutation rolls back on expected failure.
set -euo pipefail
: "${DATABASE_URL:?DATABASE_URL is required}"
verifier="db/migrations/verify_20261030_026_rlib_003_ve_standards_learning_path.sql"
migration="db/migrations/20261030_026_rlib_003_ve_standards_learning_path.sql"
expect_rejected() {
  local label="$1" mutation="$2" expected="$3" output
  output="$(mktemp)"
  if psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 >"$output" 2>&1 <<SQL
BEGIN;
$mutation
\i $verifier
ROLLBACK;
SQL
  then
    cat "$output"
    rm -f "$output"
    printf 'FAIL: accepted %s\n' "$label"
    exit 1
  fi
  if ! grep -F "$expected" "$output" >/dev/null; then
    cat "$output"
    rm -f "$output"
    exit 1
  fi
  rm -f "$output"
  printf 'Rejected %s as required\n' "$label"
}
expect_rejected "null optional fingerprint" "UPDATE comind.cm_research_refs SET content_sha256=NULL WHERE drive_file_id='1YV8Jt7JbbAu_jzhVHWezOkeGfI8jsgxx';" "fingerprint drift"
expect_rejected "missing secondary guidance label" "UPDATE comind.cm_learning_path_item SET metadata=metadata-'source_expectation' WHERE path_id=(SELECT path_id FROM comind.cm_learning_path WHERE slug='virtual-employee-standards-v0-1') AND sequence_no=4;" "guidance classification drifted"
expect_rejected "missing required freshness" "UPDATE comind.cm_research_refs SET freshness_due_at=NULL WHERE drive_file_id='1p5hU1sYu7UbZdmX7Gsu2FI818DWH0dJx';" "stale, weakly fingerprinted"
expect_rejected "missing supersession" "UPDATE comind.cm_research_refs SET superseded_by_ref_id=NULL WHERE drive_file_id='19Cksd5HogXnQepDZCayPNURCmspGSBfO';" "supersession literacy source drifted"
expect_rejected "missing standard commit" "UPDATE comind.cm_learning_path SET metadata=metadata-'governing_standard_commit' WHERE slug='virtual-employee-standards-v0-1';" "governing standard commit"

# Run the migration body inside a rollback transaction to verify non-destructive
# refusal. Strip only its outer BEGIN/COMMIT, not internal PL/pgSQL blocks.
output="$(mktemp)"
fixture="$(mktemp)"
{
  printf 'BEGIN;\n'
  cat <<'SQL'
WITH r AS (
  INSERT INTO comind.cm_research_refs(title,url)
  VALUES('RLIB-003 synthetic additional curriculum fixture','https://comindinc.com/verification/rlib-003')
  RETURNING ref_id
)
INSERT INTO comind.cm_learning_path_item(path_id,ref_id,sequence_no,section_title,rationale,required)
SELECT p.path_id,r.ref_id,99,'Synthetic preservation test','Isolated negative acceptance fixture',false
FROM comind.cm_learning_path p CROSS JOIN r
WHERE p.slug='virtual-employee-standards-v0-1';
SQL
  sed '/^BEGIN;$/d; /^COMMIT;$/d' "$migration"
  printf '\nROLLBACK;\n'
} >"$fixture"
if psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 -f "$fixture" >"$output" 2>&1; then
  cat "$output"
  rm -f "$output" "$fixture"
  echo 'FAIL: migration accepted additional curriculum item'
  exit 1
fi
if ! grep -F 'refuses to delete additional curriculum items' "$output" >/dev/null; then
  cat "$output"
  rm -f "$output" "$fixture"
  exit 1
fi
rm -f "$output" "$fixture"
psql "${DATABASE_URL}" -X -v ON_ERROR_STOP=1 -f "$verifier"
echo 'RLIB-003 adversarial checks passed; canonical fixture unchanged.'
