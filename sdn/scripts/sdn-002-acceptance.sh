#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SDN="$ROOT/sdn"
PRODUCTION="$SDN/production"
EVIDENCE="$SDN/evidence/sdn-002"
WORK="$(mktemp -d)"

export SDN_PERSIST_ROOT="$WORK/persist"
export SDN_RECOVERY_ROOT="$WORK/recovery"
export SDN_SECRET_ROOT="$WORK/secrets"
export SDN_HOST_UID="$(id -u)"
export SDN_HOST_GID="$(id -g)"
export SDN_INGEST_PORT="${SDN_INGEST_PORT:-3102}"
export SDN_TEST_PRODUCER_ID="${SDN_TEST_PRODUCER_ID:-11111111-1111-4111-8111-111111111111}"

COMPOSE=(docker compose -f "$PRODUCTION/compose.yaml")
TOOLS=(docker compose -f "$PRODUCTION/compose.yaml" --profile tools)
BACKUP=(docker compose -f "$PRODUCTION/compose.yaml" --profile backup)
RECOVERY=(docker compose -f "$PRODUCTION/compose.yaml" --profile recovery)

rm -rf "$EVIDENCE"
mkdir -p "$EVIDENCE" "$SDN_SECRET_ROOT" \
  "$SDN_PERSIST_ROOT/postgres/data" "$SDN_PERSIST_ROOT/backups/pgbackrest" "$SDN_PERSIST_ROOT/backups/restic" \
  "$SDN_PERSIST_ROOT/logs/pgbackrest" "$SDN_PERSIST_ROOT/artifacts" "$SDN_PERSIST_ROOT/archive" \
  "$SDN_RECOVERY_ROOT/postgres/data" "$SDN_RECOVERY_ROOT/logs/pgbackrest" "$SDN_RECOVERY_ROOT/artifacts"
chmod 0700 "$SDN_SECRET_ROOT"

for secret_name in db_owner_password ingest_password lifecycle_password purge_password observer_password backup_password producer_token restic_password; do
  openssl rand -hex 32 > "$SDN_SECRET_ROOT/$secret_name"
  chmod 0444 "$SDN_SECRET_ROOT/$secret_name"
done
export SDN_TEST_PRODUCER_TOKEN="$(cat "$SDN_SECRET_ROOT/producer_token")"

finalize() {
  local rc=$?
  trap - EXIT
  if (( rc != 0 )); then
    "${COMPOSE[@]}" ps -a > "$EVIDENCE/container-status-on-failure.txt" 2>&1 || true
    "${COMPOSE[@]}" logs --no-color db ingest > "$EVIDENCE/container-logs-on-failure.txt" 2>&1 || true
  fi
  "${COMPOSE[@]}" down --remove-orphans >/dev/null 2>&1 || true
  if docker image inspect comind/sdn-postgres:sdn-002 >/dev/null 2>&1; then
    docker run --rm --user 0 --entrypoint /bin/sh -v "$WORK:/work" comind/sdn-postgres:sdn-002 -ec \
      'find /work -mindepth 1 -depth -delete' >/dev/null 2>&1 || true
  fi
  rm -rf "$WORK" >/dev/null 2>&1 || true
  exit "$rc"
}
trap finalize EXIT
"${COMPOSE[@]}" down --remove-orphans >/dev/null 2>&1 || true

TMP_CONFIG="$WORK/compose-config.json"
"${COMPOSE[@]}" config --format json > "$TMP_CONFIG"
node - "$TMP_CONFIG" "$EVIDENCE/topology-proof.json" <<'NODE'
const fs=require('node:fs');
const [input,output]=process.argv.slice(2);
const c=JSON.parse(fs.readFileSync(input,'utf8'));
for(const name of ['db','restore-db']) if((c.services?.[name]?.ports??[]).length) throw new Error(`${name} publishes a database port`);
const ingestPorts=c.services?.ingest?.ports??[];
if(ingestPorts.length!==1 || ingestPorts[0].host_ip!=='127.0.0.1') throw new Error('ingest is not loopback-only');
if(c.networks?.sdn_internal?.internal!==true) throw new Error('sdn_internal is not internal');
const privileged=[]; const dockerSocketMounts=[];
for(const [name,svc] of Object.entries(c.services??{})) {
  if(svc.privileged===true) privileged.push(name);
  for(const mount of svc.volumes??[]) {
    const source=typeof mount==='string'?mount.split(':')[0]:mount.source;
    const target=typeof mount==='string'?mount.split(':')[1]:mount.target;
    if(source==='/var/run/docker.sock'||target==='/var/run/docker.sock') dockerSocketMounts.push(name);
  }
}
if(privileged.length) throw new Error(`privileged services found: ${privileged.join(',')}`);
if(dockerSocketMounts.length) throw new Error(`docker socket mounts found: ${dockerSocketMounts.join(',')}`);
const secretTargets={};
for(const name of ['db','admin','ingest','lifecycle','purge','restic']) secretTargets[name]=(c.services?.[name]?.secrets??[]).map(s=>typeof s==='string'?s:s.source).sort();
fs.writeFileSync(output,JSON.stringify({
  databasePublishedPorts:[], restorePublishedPorts:[], ingestHostIp:ingestPorts[0].host_ip,
  ingestPublishedPort:ingestPorts[0].published, internalDatabaseNetwork:true,
  privilegedServices:privileged, dockerSocketMounts,
  secretInjectionConfigured:Object.fromEntries(Object.entries(secretTargets).map(([k,v])=>[k,v.length>0])),
  automaticDestructiveService:false, publicRemoteIngestion:false
},null,2));
NODE
rm -f "$TMP_CONFIG"

"${COMPOSE[@]}" build db
PGBACKREST_VERSION="$(docker run --rm --entrypoint pgbackrest comind/sdn-postgres:sdn-002 version | awk '{print $2}')"
[[ "$PGBACKREST_VERSION" == "2.59.3" ]] || { echo "Unexpected pgBackRest version $PGBACKREST_VERSION" >&2; exit 1; }
printf 'pgbackrest_version=%s\npostgres_image=%s\nrestic_image=%s\n' "$PGBACKREST_VERSION" 'pgvector/pgvector:0.8.6-pg17-bookworm' 'restic/restic:0.19.1' > "$EVIDENCE/tool-versions.txt"

docker run --rm --user 0 -v "$SDN_PERSIST_ROOT:/host" comind/sdn-postgres:sdn-002 sh -ec \
  'chown -R postgres:postgres /host/postgres /host/backups/pgbackrest /host/logs/pgbackrest && chmod 0700 /host/postgres/data && chmod 0770 /host/backups/pgbackrest /host/logs/pgbackrest'
docker run --rm --user 0 -v "$SDN_RECOVERY_ROOT:/host" comind/sdn-postgres:sdn-002 sh -ec \
  'chown -R postgres:postgres /host/postgres /host/logs/pgbackrest && chmod 0700 /host/postgres/data && chmod 0770 /host/logs/pgbackrest'

"${COMPOSE[@]}" up -d --wait --wait-timeout 90 db
"${TOOLS[@]}" run --rm admin \
  'export PGPASSWORD="$(cat /run/secrets/db_owner_password)"; if [ "$(psql -h db -U postgres -d postgres -Atc "select count(*) from pg_database where datname='"'"'comind_sdn_test'"'"'")" != 1 ]; then createdb -h db -U postgres comind_sdn_test; fi; psql -h db -U postgres -d comind_sdn_test -Atc "select current_database()"' \
  > "$EVIDENCE/database-bootstrap.txt"
grep -qx 'comind_sdn_test' "$EVIDENCE/database-bootstrap.txt" || { echo 'Application database bootstrap did not verify comind_sdn_test' >&2; exit 1; }

for pass in 1 2; do
  "${TOOLS[@]}" run --rm admin \
    'export PGPASSWORD="$(cat /run/secrets/db_owner_password)"; for sql in /migrations/*.sql; do echo "Applying $(basename "$sql")"; psql -h db -U postgres -d comind_sdn_test -v ON_ERROR_STOP=1 -f "$sql"; done' \
    | tee "$EVIDENCE/migration-pass-$pass.log"
done
"${TOOLS[@]}" run --rm admin \
  'export PGPASSWORD="$(cat /run/secrets/db_owner_password)"; exec psql -h db -U postgres -d comind_sdn_test -v ON_ERROR_STOP=1 -f /scripts/bootstrap_production_roles.sql' \
  > "$EVIDENCE/runtime-role-bootstrap.log"

q(){ "${COMPOSE[@]}" exec -T db psql -h /tmp -U postgres -d comind_sdn_test -Atc "$1"; }

"${TOOLS[@]}" run --rm admin \
  'export PGPASSWORD="$(cat /run/secrets/observer_password)"; exec psql -h db -U sdn_observer_user -d comind_sdn_test -Atc "select sdn_ops.current_status()"' \
  > "$EVIDENCE/observer-status.json"
if "${TOOLS[@]}" run --rm admin \
  'export PGPASSWORD="$(cat /run/secrets/observer_password)"; exec psql -h db -U sdn_observer_user -d comind_sdn_test -Atc "select count(*) from sdn_telemetry.events"' \
  > "$EVIDENCE/observer-raw-read.stdout" 2> "$EVIDENCE/observer-raw-read.stderr"; then
  echo 'Observer unexpectedly read raw events' >&2
  exit 1
fi
"${TOOLS[@]}" run --rm admin \
  'export PGPASSWORD="$(cat /run/secrets/backup_password)"; exec psql -h db -U sdn_backup_user -d comind_sdn_test -v ON_ERROR_STOP=1 -f /scripts/backup_role_probe.sql' \
  > "$EVIDENCE/backup-role-write-proof.txt"

q "select sdn_core.assert_schema_version('sdn-core','2.0.0')" > /dev/null
if "${COMPOSE[@]}" exec -T db psql -h /tmp -U postgres -d comind_sdn_test -v ON_ERROR_STOP=1 -c \
  "select sdn_core.assert_schema_version('sdn-core','999.0.0')" > "$EVIDENCE/schema-mismatch.stdout" 2> "$EVIDENCE/schema-mismatch.stderr"; then
  echo 'Schema mismatch did not fail closed' >&2
  exit 1
fi

"${COMPOSE[@]}" up -d --build --wait --wait-timeout 90 ingest
for _ in $(seq 1 30); do curl -fsS "http://127.0.0.1:$SDN_INGEST_PORT/health/ready" >/dev/null && break; sleep 1; done
curl -fsS "http://127.0.0.1:$SDN_INGEST_PORT/health/live" > "$EVIDENCE/health-live.json"
curl -fsS "http://127.0.0.1:$SDN_INGEST_PORT/health/ready" > "$EVIDENCE/health-ready.json"
SDN_INGEST_URL="http://127.0.0.1:$SDN_INGEST_PORT" SDN_FIXTURE_EVIDENCE_PATH="$EVIDENCE/fixture-results.json" node "$SDN/scripts/fixtures.mjs" > "$EVIDENCE/fixtures.stdout.json"

BASE="$(q 'select max(ingested_at)::text from sdn_telemetry.events')"
plus(){ node -e "console.log(new Date(new Date(process.argv[1]).getTime()+Number(process.argv[2])*1000).toISOString())" "$BASE" "$1"; }
T35="$(plus 35)"; T65="$(plus 65)"; T125="$(plus 125)"
SDN_AS_OF="$T35" "${TOOLS[@]}" run --rm -e SDN_AS_OF="$T35" lifecycle > "$EVIDENCE/lifecycle-35s.json"
HELD_PK="$(q "select event_pk from sdn_telemetry.events where event_id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2'")"
q "insert into sdn_lifecycle.holds(hold_id,event_pk,hold_type,reason,starts_at) values (gen_random_uuid(),'$HELD_PK','governance','sdn-002 synthetic hold',clock_timestamp()-interval '1 second')" > /dev/null
q "insert into sdn_lifecycle.jobs(job_id,job_key,job_type,status,as_of,started_at,lease_expires_at) values (gen_random_uuid(),encode(digest('sdn002-interrupted','sha256'),'hex'),'evaluate','running','$T35','$T35','$T35')" > /dev/null
SDN_AS_OF="$T65" "${TOOLS[@]}" run --rm -e SDN_AS_OF="$T65" lifecycle > "$EVIDENCE/lifecycle-65s.json"
SDN_AS_OF="$T125" "${TOOLS[@]}" run --rm -e SDN_AS_OF="$T125" lifecycle > "$EVIDENCE/lifecycle-125s.json"
[[ "$(q "select count(*) from sdn_lifecycle.jobs where status='interrupted' and error_code='lease_expired'")" -ge 1 ]] || { echo 'Interrupted lifecycle worker was not surfaced' >&2; exit 1; }
[[ "$(q "select outcome from sdn_lifecycle.evaluations where event_pk='$HELD_PK' order by evaluated_at desc limit 1")" == 'blocked_hold' ]] || { echo 'Governance hold did not block lifecycle' >&2; exit 1; }

if "${TOOLS[@]}" run --rm lifecycle /bin/sh -ec \
  'export DATABASE_URL="postgresql://sdn_lifecycle_user:$(cat /run/secrets/lifecycle_password)@db:5432/comind_sdn_test"; exec node src/purge.mjs' \
  > "$EVIDENCE/destructive-unavailable.stdout" 2> "$EVIDENCE/destructive-unavailable.stderr"; then
  echo 'Lifecycle capability unexpectedly exercised destructive function' >&2
  exit 1
fi
if "${TOOLS[@]}" run --rm purge /bin/sh -ec \
  'export DATABASE_URL="postgresql://sdn_purge_user:$(cat /run/secrets/purge_password)@db:5432/comind_sdn_test"; exec node src/purge.mjs --event-pk "$1"' _ "$HELD_PK" \
  > "$EVIDENCE/purge-held.stdout" 2> "$EVIDENCE/purge-held.stderr"; then
  echo 'Held event was purged unexpectedly' >&2
  exit 1
fi
"${TOOLS[@]}" run --rm purge > "$EVIDENCE/purge-eligible.json"
[[ "$(q 'select count(*) from sdn_lifecycle.deletion_receipts')" == 3 ]] || { echo 'Expected three synthetic deletion receipts' >&2; exit 1; }
[[ "$(q 'select count(*) from sdn_lifecycle.tombstones')" == 3 ]] || { echo 'Expected three synthetic tombstones' >&2; exit 1; }
[[ "$(q "select count(*) from sdn_telemetry.events where lifecycle_class='A'")" == 1 ]] || { echo 'Class A preservation failed' >&2; exit 1; }

"${COMPOSE[@]}" stop db
if curl -fsS "http://127.0.0.1:$SDN_INGEST_PORT/health/ready" > "$EVIDENCE/db-interruption.stdout" 2> "$EVIDENCE/db-interruption.stderr"; then
  echo 'Ingestion remained ready while PostgreSQL was stopped' >&2
  exit 1
fi
"${COMPOSE[@]}" up -d --wait --wait-timeout 90 db
for _ in $(seq 1 30); do curl -fsS "http://127.0.0.1:$SDN_INGEST_PORT/health/ready" >/dev/null && break; sleep 1; done
curl -fsS "http://127.0.0.1:$SDN_INGEST_PORT/health/ready" > "$EVIDENCE/db-interruption-recovered.json"
q "insert into sdn_ops.operational_events(event_type,severity,status,details) values ('postgresql_container_interruption','warning','recovered','{\"synthetic\":true}'::jsonb)" > /dev/null

"${COMPOSE[@]}" exec -T db pgbackrest --stanza=sdn stanza-create > "$EVIDENCE/pgbackrest-stanza-create.txt"
"${COMPOSE[@]}" exec -T db pgbackrest --stanza=sdn check > "$EVIDENCE/pgbackrest-check.txt"
"${COMPOSE[@]}" exec -T db pgbackrest --stanza=sdn --type=full backup > "$EVIDENCE/pgbackrest-full-backup.txt"
"${COMPOSE[@]}" exec -T db pgbackrest --stanza=sdn --output=json info > "$EVIDENCE/pgbackrest-info-after-full.json"
FULL_REPO_BYTES="$("${COMPOSE[@]}" exec -T db sh -ec "du -sb /var/lib/pgbackrest | awk '{print \$1}'" | tr -d '\r')"
q "insert into sdn_ops.backup_events(subsystem,backup_type,status,repository_ref,backup_set_ref,metadata) values ('postgresql','full','success','local-pgbackrest-sdn-002','full-1',jsonb_build_object('pgBackRestVersion','$PGBACKREST_VERSION'))" > /dev/null

if "${COMPOSE[@]}" exec -T db pgbackrest --stanza=sdn --repo1-path=/tmp/sdn-missing-repository check \
  > "$EVIDENCE/pgbackrest-missing-repo.stdout" 2> "$EVIDENCE/pgbackrest-missing-repo.stderr"; then
  echo 'pgBackRest missing repository failure was not surfaced' >&2
  exit 1
fi
q "insert into sdn_ops.operational_events(event_type,severity,status,details) values ('pgbackrest_repository_unavailable','warning','recovered','{\"synthetic\":true}'::jsonb)" > /dev/null
if "${COMPOSE[@]}" exec -T db sh -ec \
  'rm -rf /tmp/sdn-incomplete-repo /tmp/sdn-incomplete-restore; mkdir -p /tmp/sdn-incomplete-repo /tmp/sdn-incomplete-restore; printf broken > /tmp/sdn-incomplete-repo/backup.info; pgbackrest --stanza=sdn --repo1-path=/tmp/sdn-incomplete-repo --pg1-path=/tmp/sdn-incomplete-restore restore' \
  > "$EVIDENCE/pgbackrest-incomplete-restore.stdout" 2> "$EVIDENCE/pgbackrest-incomplete-restore.stderr"; then
  echo 'Incomplete pgBackRest input restored unexpectedly' >&2
  exit 1
fi
q "insert into sdn_ops.operational_events(event_type,severity,status,details) values ('pgbackrest_incomplete_restore','warning','recovered','{\"synthetic\":true}'::jsonb)" > /dev/null

printf 'artifact-alpha-v1\n' > "$SDN_PERSIST_ROOT/artifacts/alpha.txt"
printf 'archive-seed-v1\n' > "$SDN_PERSIST_ROOT/archive/history.txt"
"${BACKUP[@]}" run --rm restic init > "$EVIDENCE/restic-init.txt"
"${BACKUP[@]}" run --rm restic backup /data/artifacts /data/archive > "$EVIDENCE/restic-backup-1.txt"
printf 'artifact-alpha-v2\n' > "$SDN_PERSIST_ROOT/artifacts/alpha.txt"
printf 'artifact-beta-final\n' > "$SDN_PERSIST_ROOT/artifacts/beta.txt"
"${BACKUP[@]}" run --rm restic backup /data/artifacts /data/archive > "$EVIDENCE/restic-backup-2.txt"
"${BACKUP[@]}" run --rm restic snapshots --json > "$EVIDENCE/restic-snapshots-before-retention.json"
"${BACKUP[@]}" run --rm restic check > "$EVIDENCE/restic-check.txt"
"${BACKUP[@]}" run --rm restic forget --keep-last 1 --prune > "$EVIDENCE/restic-retention-prune.txt"
rm -rf "$SDN_RECOVERY_ROOT/artifacts"/*
"${BACKUP[@]}" run --rm restic restore latest --target /restore > "$EVIDENCE/restic-restore.txt"

source_artifact_hash="$(cd "$SDN_PERSIST_ROOT" && find artifacts archive -type f -print0 | sort -z | xargs -0 sha256sum | sha256sum | awk '{print $1}')"
restored_artifact_hash="$(cd "$SDN_RECOVERY_ROOT/artifacts/data" && find artifacts archive -type f -print0 | sort -z | xargs -0 sha256sum | sha256sum | awk '{print $1}')"
[[ "$source_artifact_hash" == "$restored_artifact_hash" ]] || { echo 'Restic restored artifact hash mismatch' >&2; exit 1; }
printf 'source_tree_hash=%s\nrestored_tree_hash=%s\n' "$source_artifact_hash" "$restored_artifact_hash" > "$EVIDENCE/restic-restore-hash.txt"

if docker run --rm --network none --user "$SDN_HOST_UID:$SDN_HOST_GID" \
  -e RESTIC_REPOSITORY=/repository -e RESTIC_PASSWORD=wrong-password \
  -v "$SDN_PERSIST_ROOT/backups/restic:/repository:ro" restic/restic:0.19.1 snapshots \
  > "$EVIDENCE/restic-wrong-password.stdout" 2> "$EVIDENCE/restic-wrong-password.stderr"; then
  echo 'Restic wrong password was accepted unexpectedly' >&2
  exit 1
fi
if "${BACKUP[@]}" run --rm restic backup /data/does-not-exist \
  > "$EVIDENCE/restic-missing-source.stdout" 2> "$EVIDENCE/restic-missing-source.stderr"; then
  echo 'Restic missing source did not fail' >&2
  exit 1
fi
q "insert into sdn_ops.operational_events(event_type,severity,status,details) values ('restic_auth_and_source_failure','warning','recovered','{\"synthetic\":true}'::jsonb)" > /dev/null

for path in artifacts/alpha.txt artifacts/beta.txt archive/history.txt; do
  file="$SDN_PERSIST_ROOT/$path"
  kind="artifact"; [[ "$path" == archive/* ]] && kind="archive"
  hash="$(sha256sum "$file" | awk '{print $1}')"
  size="$(stat -c %s "$file")"
  q "insert into sdn_evidence.artifacts(artifact_id,artifact_kind,relative_path,content_hash,size_bytes,lifecycle_class) values (gen_random_uuid(),'$kind','$path','$hash',$size,'B')" > /dev/null
done
q "insert into sdn_ops.backup_events(subsystem,backup_type,status,repository_ref,backup_set_ref,metadata) values ('artifact_archive','restic_snapshot','success','local-restic-sdn-002','latest',jsonb_build_object('treeHash','$source_artifact_hash'))" > /dev/null
q "insert into sdn_ops.restore_proofs(subsystem,status,recovery_target,source_independent,cryptographic_hash,metadata) values ('artifact_archive','success','independent-restic-path',true,'$restored_artifact_hash','{\"encryptedRepository\":true}'::jsonb)" > /dev/null

DB_LOGICAL_BYTES="$(q 'select pg_database_size(current_database())')"
DB_PHYSICAL_BYTES="$("${COMPOSE[@]}" exec -T db sh -ec "du -sb /var/lib/postgresql/data | awk '{print \$1}'" | tr -d '\r')"
WAL_BYTES="$("${COMPOSE[@]}" exec -T db sh -ec "du -sb /var/lib/postgresql/data/pg_wal | awk '{print \$1}'" | tr -d '\r')"
ARTIFACT_BYTES="$(du -sb "$SDN_PERSIST_ROOT/artifacts" | awk '{print $1}')"
ARCHIVE_BYTES="$(du -sb "$SDN_PERSIST_ROOT/archive" | awk '{print $1}')"
RESTIC_BYTES="$(du -sb "$SDN_PERSIST_ROOT/backups/restic" | awk '{print $1}')"
FS_TOTAL_BYTES="$(df -B1 --output=size "$SDN_PERSIST_ROOT" | tail -1 | tr -d ' ')"
FS_FREE_BYTES="$(df -B1 --output=avail "$SDN_PERSIST_ROOT" | tail -1 | tr -d ' ')"
FS_FREE_PERCENT="$(awk -v free="$FS_FREE_BYTES" -v total="$FS_TOTAL_BYTES" 'BEGIN { printf "%.3f", (free/total)*100 }')"
SDN_DISK_FREE_PERCENT="$FS_FREE_PERCENT" node "$SDN/scripts/capacity_guard.mjs" > "$EVIDENCE/capacity-actual.json"
ACTUAL_CAPACITY_STATE="$(node -e "const fs=require('fs'); console.log(JSON.parse(fs.readFileSync(process.argv[1],'utf8')).state)" "$EVIDENCE/capacity-actual.json")"
if [[ "$ACTUAL_CAPACITY_STATE" == critical ]]; then
  "${COMPOSE[@]}" stop ingest
  echo 'Actual acceptance filesystem is below the critical capacity threshold' >&2
  exit 1
fi
q "insert into sdn_ops.capacity_samples(database_bytes,free_disk_bytes,database_physical_bytes,wal_bytes,artifact_bytes,archive_bytes,pgbackrest_repository_bytes,restic_repository_bytes,filesystem_total_bytes,free_disk_percent,warning_state) values ($DB_LOGICAL_BYTES,$FS_FREE_BYTES,$DB_PHYSICAL_BYTES,$WAL_BYTES,$ARTIFACT_BYTES,$ARCHIVE_BYTES,$FULL_REPO_BYTES,$RESTIC_BYTES,$FS_TOTAL_BYTES,$FS_FREE_PERCENT,'$ACTUAL_CAPACITY_STATE')" > /dev/null

SDN_DISK_FREE_PERCENT=15 node "$SDN/scripts/capacity_guard.mjs" > "$EVIDENCE/capacity-warning.json"
SDN_DISK_FREE_PERCENT=5 node "$SDN/scripts/capacity_guard.mjs" > "$EVIDENCE/capacity-critical.json"
node - "$EVIDENCE/capacity-warning.json" "$EVIDENCE/capacity-critical.json" <<'NODE'
const fs=require('node:fs'); const [wpath,cpath]=process.argv.slice(2);
const w=JSON.parse(fs.readFileSync(wpath,'utf8')); const c=JSON.parse(fs.readFileSync(cpath,'utf8'));
if(w.state!=='warning'||w.allowNewIngestion!==true||w.destructiveLifecycleAuthorized!==false) throw new Error('warning capacity policy failed');
if(c.state!=='critical'||c.allowNewIngestion!==false||c.destructiveLifecycleAuthorized!==false) throw new Error('critical capacity fail-safe policy failed');
NODE
q "insert into sdn_ops.operational_events(event_type,severity,status,details) values ('disk_space_warning','warning','failed_safe','{\"destructiveAuthorized\":false}'::jsonb),('disk_space_critical','critical','failed_safe','{\"allowNewIngestion\":false,\"destructiveAuthorized\":false}'::jsonb)" > /dev/null

"${COMPOSE[@]}" exec -T db pgbackrest --stanza=sdn --type=diff backup > "$EVIDENCE/pgbackrest-differential-backup.txt"
"${COMPOSE[@]}" exec -T db pgbackrest --stanza=sdn --output=json info > "$EVIDENCE/pgbackrest-info-final.json"
FINAL_REPO_BYTES="$("${COMPOSE[@]}" exec -T db sh -ec "du -sb /var/lib/pgbackrest | awk '{print \$1}'" | tr -d '\r')"
BACKUP_GROWTH=$((FINAL_REPO_BYTES-FULL_REPO_BYTES))
printf 'full_repository_bytes=%s\nfinal_repository_bytes=%s\nbackup_growth_bytes=%s\n' "$FULL_REPO_BYTES" "$FINAL_REPO_BYTES" "$BACKUP_GROWTH" > "$EVIDENCE/backup-growth.txt"

SOURCE_SNAPSHOT="$("${COMPOSE[@]}" exec -T db psql -h /tmp -U postgres -d comind_sdn_test -Atf /dev/stdin < "$SDN/scripts/sdn-002-snapshot.sql")"
printf '%s\n' "$SOURCE_SNAPSHOT" > "$EVIDENCE/source-semantic-snapshot.json"

"${COMPOSE[@]}" stop ingest db
if "${COMPOSE[@]}" ps --status running --services | grep -qx db; then echo 'Source database is still running before independent restore' >&2; exit 1; fi
printf 'source_database_running_during_restore=false\n' > "$EVIDENCE/restore-independence.txt"
"${RECOVERY[@]}" run --rm restore-db pgbackrest --stanza=sdn --pg1-path=/var/lib/postgresql/data restore > "$EVIDENCE/pgbackrest-restore.txt"
"${RECOVERY[@]}" up -d --wait --wait-timeout 90 restore-db
RESTORED_SNAPSHOT="$("${RECOVERY[@]}" exec -T restore-db psql -h /tmp -U postgres -d comind_sdn_test -Atf /dev/stdin < "$SDN/scripts/sdn-002-snapshot.sql")"
printf '%s\n' "$RESTORED_SNAPSHOT" > "$EVIDENCE/restored-semantic-snapshot.json"
[[ "$SOURCE_SNAPSHOT" == "$RESTORED_SNAPSHOT" ]] || { echo 'Independent PostgreSQL semantic restore mismatch' >&2; exit 1; }
SEMANTIC_HASH="$(printf '%s' "$RESTORED_SNAPSHOT" | sha256sum | awk '{print $1}')"
printf 'semantic_snapshot_sha256=%s\n' "$SEMANTIC_HASH" > "$EVIDENCE/postgresql-restore-hash.txt"

"${COMPOSE[@]}" up -d --wait --wait-timeout 90 db ingest
q "insert into sdn_ops.backup_events(subsystem,backup_type,status,repository_ref,backup_set_ref,metadata) values ('postgresql','differential','success','local-pgbackrest-sdn-002','diff-1',jsonb_build_object('repositoryBytes',$FINAL_REPO_BYTES,'growthBytes',$BACKUP_GROWTH))" > /dev/null
q "insert into sdn_ops.restore_proofs(subsystem,status,recovery_target,source_independent,semantic_hash,metadata) values ('postgresql','success','independent-recovery-postgres',true,'$SEMANTIC_HASH','{\"sourceStopped\":true}'::jsonb)" > /dev/null
q "select sdn_ops.current_status()" > "$EVIDENCE/final-operational-status.json"
curl -fsS "http://127.0.0.1:$SDN_INGEST_PORT/health/metrics" > "$EVIDENCE/final-ingestion-metrics.json"

node - "$EVIDENCE/pgbackrest-info-final.json" "$PGBACKREST_VERSION" "$EVIDENCE/backup-version-check.json" <<'NODE'
const fs=require('node:fs'); const [path,expected,out]=process.argv.slice(2); const data=JSON.parse(fs.readFileSync(path,'utf8'));
const backups=data?.[0]?.backup??[]; if(backups.length<2) throw new Error('expected full and differential backups');
const observed=[...new Set(backups.map(b=>b?.backrest?.version).filter(Boolean))];
if(!observed.length) throw new Error('pgBackRest backup version metadata is missing');
const compatible=observed.every(v=>v===expected);
fs.writeFileSync(out,JSON.stringify({expectedPgBackRestVersion:expected,observedBackupVersions:observed,compatible,mismatchPolicy:'reject when recorded backup version differs from runtime version'},null,2));
if(!compatible) throw new Error(`backup version mismatch: ${observed.join(',')}`);
NODE

for secret_file in "$SDN_SECRET_ROOT"/*; do
  secret_value="$(cat "$secret_file")"
  if grep -R -F --binary-files=without-match -- "$secret_value" "$EVIDENCE" >/dev/null 2>&1; then
    echo "Secret value leaked into evidence for $(basename "$secret_file")" >&2
    exit 1
  fi
  if git -C "$ROOT" grep -F -- "$secret_value" >/dev/null 2>&1; then
    echo "Secret value leaked into repository for $(basename "$secret_file")" >&2
    exit 1
  fi
done
printf 'repository_secret_scan=pass\nevidence_secret_scan=pass\nrendered_compose_preserved_as_evidence=false\n' > "$EVIDENCE/secret-safety.txt"

"${COMPOSE[@]}" ps -a > "$EVIDENCE/final-container-status.txt"
(
  cd "$EVIDENCE"
  find . -type f ! -name SHA256SUMS ! -name EVIDENCE-MANIFEST-SHA256.txt -print0 | sort -z | xargs -0 sha256sum > SHA256SUMS
  sha256sum SHA256SUMS > EVIDENCE-MANIFEST-SHA256.txt
)

echo 'SDN-002 non-production production-boundary and recovery acceptance proof completed successfully.'
