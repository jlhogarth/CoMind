#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SDN="$ROOT/sdn"
EVIDENCE="$SDN/evidence"
mkdir -p "$EVIDENCE"
cd "$SDN"
export SDN_DB_OWNER_PASSWORD="${SDN_DB_OWNER_PASSWORD:-$(openssl rand -hex 24)}"
export SDN_RESTORE_OWNER_PASSWORD="${SDN_RESTORE_OWNER_PASSWORD:-$(openssl rand -hex 24)}"
export SDN_INGEST_PASSWORD="${SDN_INGEST_PASSWORD:-$(openssl rand -hex 24)}"
export SDN_LIFECYCLE_PASSWORD="${SDN_LIFECYCLE_PASSWORD:-$(openssl rand -hex 24)}"
export SDN_PURGE_PASSWORD="${SDN_PURGE_PASSWORD:-$(openssl rand -hex 24)}"
export SDN_TEST_PRODUCER_TOKEN="${SDN_TEST_PRODUCER_TOKEN:-$(openssl rand -hex 32)}"
export SDN_TEST_PRODUCER_ID="${SDN_TEST_PRODUCER_ID:-11111111-1111-4111-8111-111111111111}"
COMPOSE=(docker compose -f compose.yaml)
cleanup(){ "${COMPOSE[@]}" down -v --remove-orphans >/dev/null 2>&1 || true; }
trap cleanup EXIT
cleanup
TMP=$(mktemp)
"${COMPOSE[@]}" config --format json > "$TMP"
node - "$TMP" "$EVIDENCE/topology-proof.json" <<'NODE'
const fs=require('node:fs'); const [input,output]=process.argv.slice(2); const c=JSON.parse(fs.readFileSync(input,'utf8'));
for(const n of ['db','restore-db']) if((c.services?.[n]?.ports??[]).length) throw new Error(`${n} publishes a database port`);
const p=c.services?.ingest?.ports??[]; if(p.length!==1||p[0].host_ip!=='127.0.0.1') throw new Error('ingest is not loopback-only');
fs.writeFileSync(output,JSON.stringify({postgresImage:c.services.db.image,restoreImage:c.services['restore-db'].image,dbPorts:c.services.db.ports??[],restorePorts:c.services['restore-db'].ports??[],ingestPorts:p,networkInternal:Boolean(c.networks?.sdn_internal?.internal)},null,2));
NODE
rm -f "$TMP"
"${COMPOSE[@]}" up -d --wait --wait-timeout 60 db restore-db
./scripts/migrate.sh | tee "$EVIDENCE/migration-pass-1.log"
./scripts/migrate.sh | tee "$EVIDENCE/migration-pass-2.log"
./scripts/bootstrap_roles.sh | tee "$EVIDENCE/runtime-role-bootstrap.log"
PG_VERSION=$("${COMPOSE[@]}" exec -T db psql -U postgres -d comind_sdn_test -Atc 'show server_version')
[[ "$PG_VERSION" == 17.* ]] || { echo "Expected PostgreSQL 17, got $PG_VERSION" >&2; exit 1; }
EXTENSIONS=$("${COMPOSE[@]}" exec -T db psql -U postgres -d comind_sdn_test -Atc "select string_agg(extname,',' order by extname) from pg_extension where extname in ('pgcrypto','citext','pg_trgm','vector')")
[[ "$EXTENSIONS" == 'citext,pg_trgm,pgcrypto,vector' ]] || { echo "Missing extensions: $EXTENSIONS" >&2; exit 1; }
"${COMPOSE[@]}" up -d --build ingest
for _ in $(seq 1 30); do curl -fsS http://127.0.0.1:3100/health/ready >/dev/null && break; sleep 1; done
curl -fsS http://127.0.0.1:3100/health/live | tee "$EVIDENCE/health-live.json"
curl -fsS http://127.0.0.1:3100/health/ready | tee "$EVIDENCE/health-ready.json"
SDN_FIXTURE_EVIDENCE_PATH="$EVIDENCE/fixture-results.json" node scripts/fixtures.mjs > "$EVIDENCE/fixtures.stdout.json"
q(){ "${COMPOSE[@]}" exec -T db psql -U postgres -d comind_sdn_test -Atc "$1"; }
[[ "$(q 'select count(*) from sdn_telemetry.events')" == 5 ]] || { echo 'semantic event count failed' >&2; exit 1; }
[[ "$(q "select count(*) from sdn_telemetry.events where event_id='dddddddd-dddd-4ddd-8ddd-ddddddddddd1'")" == 1 ]] || { echo 'duplicate persistence failed' >&2; exit 1; }
[[ "$(q 'select count(*) from sdn_evidence.integrity_conflicts')" == 1 ]] || { echo 'conflict evidence failed' >&2; exit 1; }
[[ "$(q 'select count(*) from sdn_evidence.provenance_edges')" == 1 ]] || { echo 'provenance failed' >&2; exit 1; }
[[ "$(q "select count(*) from sdn_telemetry.events where event_id='cccccccc-cccc-4ccc-8ccc-ccccccccccc1'")" == 0 ]] || { echo 'missing policy did not fail closed' >&2; exit 1; }
BASE=$(q 'select max(ingested_at)::text from sdn_telemetry.events')
plus(){ node -e "console.log(new Date(new Date(process.argv[1]).getTime()+Number(process.argv[2])*1000).toISOString())" "$BASE" "$1"; }
T10=$(plus 10); T35=$(plus 35); T65=$(plus 65); T125=$(plus 125)
SDN_AS_OF="$T10" "${COMPOSE[@]}" run --rm -e SDN_AS_OF="$T10" lifecycle | tee "$EVIDENCE/lifecycle-10s.json"
[[ "$(q 'select count(*) from sdn_summary.summaries')" == 0 ]] || { echo 'early summary created' >&2; exit 1; }
SDN_AS_OF="$T35" "${COMPOSE[@]}" run --rm -e SDN_AS_OF="$T35" lifecycle | tee "$EVIDENCE/lifecycle-35s.json"
[[ "$(q 'select count(*) from sdn_summary.summaries')" == 4 ]] || { echo 'deterministic derivatives missing' >&2; exit 1; }
HELD_PK=$(q "select event_pk from sdn_telemetry.events where event_id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2'")
"${COMPOSE[@]}" exec -T db psql -U postgres -d comind_sdn_test -v ON_ERROR_STOP=1 -c "insert into sdn_lifecycle.holds(hold_id,event_pk,hold_type,reason,starts_at) values (gen_random_uuid(),'$HELD_PK','governance','synthetic hold proof',clock_timestamp()-interval '1 second')"
"${COMPOSE[@]}" exec -T db psql -U postgres -d comind_sdn_test -v ON_ERROR_STOP=1 -c "insert into sdn_lifecycle.jobs(job_id,job_key,job_type,status,as_of,started_at,lease_expires_at) values (gen_random_uuid(),encode(digest('interrupted','sha256'),'hex'),'evaluate','running','$T10','$T10','$T10')"
SDN_AS_OF="$T65" "${COMPOSE[@]}" run --rm -e SDN_AS_OF="$T65" lifecycle | tee "$EVIDENCE/lifecycle-65s.json"
[[ "$(q "select count(*) from sdn_lifecycle.compaction_manifests where verification_status='verified'")" == 2 ]] || { echo 'compaction manifest verification failed' >&2; exit 1; }
[[ "$(q "select count(*) from sdn_lifecycle.jobs where status='interrupted' and error_code='lease_expired'")" == 1 ]] || { echo 'worker interruption not surfaced' >&2; exit 1; }
SDN_AS_OF="$T125" "${COMPOSE[@]}" run --rm -e SDN_AS_OF="$T125" lifecycle | tee "$EVIDENCE/lifecycle-125s.json"
J1=$(q "select count(*) from sdn_lifecycle.jobs where as_of='$T125'::timestamptz and job_type='evaluate'")
SDN_AS_OF="$T125" "${COMPOSE[@]}" run --rm -e SDN_AS_OF="$T125" lifecycle | tee "$EVIDENCE/lifecycle-125s-duplicate.json"
J2=$(q "select count(*) from sdn_lifecycle.jobs where as_of='$T125'::timestamptz and job_type='evaluate'")
[[ "$J1" == 1 && "$J2" == 1 ]] || { echo 'duplicate lifecycle job created' >&2; exit 1; }
[[ "$(q "select count(*) from sdn_lifecycle.evaluations x join sdn_telemetry.events e on e.event_pk=x.event_pk where e.lifecycle_class='A' and x.outcome='eligible'")" == 0 ]] || { echo 'Class A became eligible' >&2; exit 1; }
[[ "$(q "select outcome from sdn_lifecycle.evaluations where event_pk='$HELD_PK' order by evaluated_at desc limit 1")" == 'blocked_hold' ]] || { echo 'hold did not block lifecycle' >&2; exit 1; }
FREE_KB=$("${COMPOSE[@]}" exec -T db sh -c "df -Pk /var/lib/postgresql/data | awk 'NR==2 {print \$4}'" | tr -d '\r')
DB_BYTES=$(q 'select pg_database_size(current_database())')
"${COMPOSE[@]}" exec -T db psql -U postgres -d comind_sdn_test -c "insert into sdn_ops.capacity_samples(database_bytes,free_disk_bytes) values ($DB_BYTES,$((FREE_KB*1024)))"
curl -fsS http://127.0.0.1:3100/health/metrics | tee "$EVIDENCE/health-metrics.json"
SOURCE=$("${COMPOSE[@]}" exec -T db psql -U postgres -d comind_sdn_test -Atf /dev/stdin < scripts/snapshot.sql)
printf '%s\n' "$SOURCE" > "$EVIDENCE/source-snapshot.json"
"${COMPOSE[@]}" exec -T db pg_dump -U postgres -d comind_sdn_test -Fc > "$EVIDENCE/comind_sdn_test.dump"
cat "$EVIDENCE/comind_sdn_test.dump" | "${COMPOSE[@]}" exec -T restore-db pg_restore -U postgres -d comind_sdn_restore_test --no-owner --no-privileges
RESTORED=$("${COMPOSE[@]}" exec -T restore-db psql -U postgres -d comind_sdn_restore_test -Atf /dev/stdin < scripts/snapshot.sql)
printf '%s\n' "$RESTORED" > "$EVIDENCE/restore-snapshot.json"
[[ "$SOURCE" == "$RESTORED" ]] || { echo 'restore verification mismatch' >&2; exit 1; }
bash scripts/guard_failures.sh | tee "$EVIDENCE/destructive-guard-summary.txt"
A_PK=$(q "select event_pk from sdn_telemetry.events where lifecycle_class='A' limit 1")
if "${COMPOSE[@]}" run --rm purge node src/purge.mjs --event-pk "$A_PK" >"$EVIDENCE/purge-class-a.stdout" 2>"$EVIDENCE/purge-class-a.stderr"; then echo 'Class A purge succeeded unexpectedly' >&2; exit 1; fi
if "${COMPOSE[@]}" run --rm purge node src/purge.mjs --event-pk "$HELD_PK" >"$EVIDENCE/purge-held.stdout" 2>"$EVIDENCE/purge-held.stderr"; then echo 'held purge succeeded unexpectedly' >&2; exit 1; fi
"${COMPOSE[@]}" run --rm purge | tee "$EVIDENCE/purge-eligible.json"
RECEIPTS=$(q 'select count(*) from sdn_lifecycle.deletion_receipts'); TOMBSTONES=$(q 'select count(*) from sdn_lifecycle.tombstones')
[[ "$RECEIPTS" == 3 && "$TOMBSTONES" == 3 ]] || { echo "deletion evidence mismatch $RECEIPTS/$TOMBSTONES" >&2; exit 1; }
[[ "$(q "select count(*) from sdn_telemetry.events where lifecycle_class='A'")" == 1 ]] || { echo 'Class A lost' >&2; exit 1; }
[[ "$(q 'select count(*) from sdn_summary.summaries')" == 4 ]] || { echo 'summaries lost' >&2; exit 1; }
[[ "$(q 'select count(*) from sdn_lifecycle.compaction_manifests')" == 2 ]] || { echo 'manifests lost' >&2; exit 1; }
[[ "$(q 'select count(*) from sdn_evidence.provenance_edges')" == 1 ]] || { echo 'provenance lost' >&2; exit 1; }
"${COMPOSE[@]}" exec -T db psql -U postgres -d comind_sdn_test -P pager=off -c "select lifecycle_class,count(*) from sdn_telemetry.events group by lifecycle_class order by lifecycle_class; select outcome,count(*) from sdn_lifecycle.evaluations group by outcome order by outcome; select count(*) receipts from sdn_lifecycle.deletion_receipts; select count(*) tombstones from sdn_lifecycle.tombstones;" > "$EVIDENCE/final-database-state.txt"
echo 'SDN-001 isolated acceptance proof completed successfully.'
