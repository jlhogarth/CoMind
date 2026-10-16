# Sovereign Data Node Recovery Runbook

## Scope

This runbook covers the SDN-002 production-shaped, non-production foundation. It defines executable recovery patterns that must be demonstrated before a later production activation milestone.

Do not use a recovery procedure to bypass lifecycle governance, destructive authority, secret handling, or production authorization boundaries.

## Recovery classes

### Routine recovery

Use when the authoritative host and storage are intact and the fault is operational, such as a container restart, worker interruption, temporary database connection loss, or failed backup attempt.

### Disaster recovery

Use when the original database or host cannot be trusted or used, such as database corruption, host loss, storage loss, or host replacement.

### Security incident recovery

Use when credentials, host integrity, configuration integrity, or an access path may be compromised. Preserve evidence before rotation or destruction when safe to do so.

### Operator error recovery

Use when a configuration change, schema change, incorrect command, or accidental service action creates an inconsistent or unavailable state.

## Required recovery inputs

Before starting a recovery, record:

- incident start time;
- operator identity;
- current repository commit and image versions;
- current schema contract;
- current database health;
- current pgBackRest status;
- current restic status;
- latest successful database backup;
- latest successful artifact snapshot;
- latest successful independent restore proof;
- active governance holds;
- lifecycle backlog and failures;
- current disk state;
- whether destructive capability was available or used.

Never copy secret values into the incident record.

## Standard environment

Set the deployment roots explicitly before using Compose:

```bash
export SDN_PERSIST_ROOT=/path/to/sdn/persist
export SDN_RECOVERY_ROOT=/path/to/sdn/recovery
export SDN_SECRET_ROOT=/path/to/protected/sdn/secrets
export SDN_HOST_UID="$(id -u)"
export SDN_HOST_GID="$(id -g)"
```

All examples run from `sdn/production` unless otherwise stated.

## Routine: PostgreSQL container interruption

1. Stop ingestion or confirm it reports not ready.
2. Inspect the database container exit state and logs.
3. Verify the persistent PostgreSQL data path is present and has expected ownership.
4. Start PostgreSQL only.
5. Wait for the database health check.
6. Verify PostgreSQL version and required extensions.
7. Verify `sdn_ops.current_status()`.
8. Verify WAL archiving is healthy with pgBackRest `check`.
9. Start ingestion.
10. Verify ingestion readiness.
11. Verify lifecycle backlog and failed or interrupted jobs.
12. Record the interruption and recovery.

Example:

```bash
docker compose -f compose.yaml stop ingest
docker compose -f compose.yaml up -d --wait db
docker compose -f compose.yaml exec -T db pgbackrest --stanza=sdn check
docker compose -f compose.yaml up -d --wait ingest
```

## Routine: lifecycle worker interruption

A lifecycle worker interruption must remain visible. Do not delete or overwrite the interrupted job record.

1. Inspect `sdn_lifecycle.jobs` for `running`, `failed`, and `interrupted` states.
2. Verify the prior lease has expired before another worker claims equivalent work.
3. Run lifecycle evaluation again with the intended controlled time or operational time.
4. Verify the prior job is preserved as interrupted.
5. Verify the replacement job is idempotent and does not duplicate summaries, manifests, or transitions.
6. Verify active holds still block eligibility.
7. Record the recovery.

## Routine: destructive worker failure

A destructive worker failure is not permission to broaden destructive access.

1. Stop further destructive attempts.
2. Confirm the failed process used only `sdn_purge_role`.
3. Inspect the target event's latest eligibility evaluation.
4. Verify the retention policy version still authorizes deletion.
5. Verify no active hold exists.
6. Verify required derivative and compaction evidence still exists.
7. Check whether a deletion receipt and tombstone already exist.
8. If durable deletion evidence exists, do not blindly retry.
9. If no deletion occurred and all guards remain valid, retry through the same guarded function only.
10. Preserve the original failure evidence.

## Routine: failed PostgreSQL backup

1. Do not remove the previous verified backup.
2. Run `pgbackrest --stanza=sdn info` and inspect repository status.
3. Run `pgbackrest --stanza=sdn check`.
4. Inspect free capacity for the PostgreSQL data path and repository.
5. Inspect pgBackRest logs.
6. Verify WAL archiving is operating.
7. Correct only the demonstrated cause.
8. Rerun the failed backup type.
9. Inspect machine-readable backup metadata.
10. Run an independent restore test before treating recoverability as restored.

## Routine: backup repository unavailable

1. Treat the repository as unavailable, not empty.
2. Do not initialize a new repository at the expected path until the missing repository is explained.
3. Verify mount, filesystem, permissions, and path identity.
4. Verify whether the repository exists on another intended storage device.
5. Preserve pgBackRest logs and status output.
6. Restore repository access or intentionally provision a new repository under a separately recorded recovery decision.
7. A newly initialized repository has no historical recoverability and must not be reported as equivalent to the missing repository.

## Routine: restic password failure

1. Stop repeated password guesses.
2. Verify the intended secret file path and permissions without printing its value.
3. Verify the repository path is correct.
4. Confirm whether a credential rotation occurred.
5. Use the authoritative secret source to restore the expected credential.
6. Run `restic snapshots` and `restic check`.
7. Perform an independent restore before closing the incident.

If the repository password is irretrievably lost, the encrypted repository is not recoverable from the repository alone. Escalate as credential-loss disaster recovery.

## Routine: insufficient disk

Storage pressure never grants deletion authority.

### Warning state

At or below the provisional warning threshold:

1. surface operator attention;
2. measure database, WAL, artifact, archive, and backup growth;
3. verify backups are not unexpectedly duplicating data;
4. identify safe capacity expansion or movement of non-authoritative temporary material;
5. leave lifecycle and destructive authority unchanged.

### Critical state

At or below the provisional critical threshold:

1. backpressure or stop new ingestion that can safely retry;
2. keep already durable evidence intact;
3. do not auto-purge events;
4. stop nonessential write amplification;
5. preserve active holds and Class A records;
6. expand or recover capacity;
7. verify database consistency after capacity recovery;
8. verify backup repository health;
9. resume ingestion only after the capacity state is no longer critical.

## Disaster: database corruption

Do not restore over the suspected corrupt source as the first action.

1. Stop ingestion.
2. Stop lifecycle and destructive workers.
3. Stop PostgreSQL if continued writes may worsen the condition.
4. Preserve container logs and relevant storage diagnostics.
5. Preserve the corrupt data directory when capacity permits.
6. Select the latest verified pgBackRest backup that satisfies the recovery objective.
7. Prepare an independent empty recovery data directory.
8. Restore into that directory.
9. Start only the recovery PostgreSQL instance.
10. Verify PostgreSQL starts cleanly.
11. Verify extensions and schema contracts.
12. Run the semantic snapshot comparison.
13. Verify events, receipts, conflicts, summaries, manifests, provenance, lifecycle history, deletion receipts, tombstones, and artifact metadata.
14. Verify governance holds.
15. Verify expected WAL recovery state.
16. Only after verification may a later authorized cutover replace the failed database.

SDN-002 example restore:

```bash
docker compose -f compose.yaml stop ingest db
docker compose -f compose.yaml --profile recovery run --rm restore-db \
  pgbackrest --stanza=sdn --pg1-path=/var/lib/postgresql/data restore
docker compose -f compose.yaml --profile recovery up -d --wait restore-db
```

## Disaster: host replacement

1. Treat the replacement host as untrusted until baseline hardening is complete.
2. Install the pinned OCI runtime and repository version.
3. Recreate only the documented persistent roots and ownership.
4. Restore protected configuration from an authoritative configuration source.
5. Restore credentials through the approved secret process. Do not copy secrets into Git.
6. Restore the pgBackRest repository or attach the verified repository storage.
7. Restore the restic repository or attach its verified storage.
8. Restore PostgreSQL into a clean data directory.
9. Restore artifacts into a clean artifact path.
10. Verify semantic and cryptographic evidence.
11. Verify firewall rules and confirm PostgreSQL is not publicly exposed.
12. Verify ingestion remains loopback or otherwise within the separately authorized access boundary.
13. Verify current status and backup health.
14. Do not route production traffic until the applicable production authority approves cutover.

## Disaster: artifact-store corruption

1. Stop processes that can overwrite the affected artifact path.
2. Preserve the corrupt files when practical for evidence.
3. Run `restic check` against the repository.
4. Select the intended snapshot.
5. Restore into an independent path.
6. Compare SHA-256 tree hashes with recorded artifact metadata.
7. Investigate any mismatch before replacement.
8. Replace corrupt source content only after the independent restore is verified and the appropriate authority approves the change.

## Disaster: partial restore

A partial restore must have an explicit scope. It must not silently create a database and artifact state from incompatible points in time.

1. Define the exact database backup set and artifact snapshot.
2. Record their timestamps and identifiers.
3. Determine whether the restored artifacts are referenced by the restored database state.
4. Restore into independent paths.
5. Verify all requested objects.
6. Verify no required provenance or governance evidence is omitted.
7. Record anything intentionally excluded.
8. Do not present a partial restore as full-system recovery.

## Security incident: credential loss or compromise

1. Preserve security evidence where safe.
2. Disable or rotate the affected credential through its authoritative secret source.
3. Identify every service that received the credential.
4. Confirm the credential was not written to Git, logs, CI evidence, or backup metadata.
5. Rotate dependent credentials if lateral exposure is plausible.
6. Recreate one-off administrative sessions after rotation.
7. Verify service access under least privilege.
8. Verify the old credential no longer authenticates.
9. Run backup and restore checks if backup credentials were affected.

Loss of the restic encryption password can make the artifact backup repository unrecoverable. Treat that as a disaster, not a routine rotation.

## Security incident: host compromise

1. Stop externally consequential activity if it can be done safely.
2. Preserve forensic evidence under the applicable incident process.
3. Do not trust local binaries, configuration, credentials, or backup metadata solely because they are present.
4. Build a clean replacement host from authoritative source.
5. Rotate credentials.
6. Validate backup repositories from the clean environment.
7. Restore into clean independent targets.
8. Perform semantic and cryptographic verification.
9. Re-establish firewall and network boundaries.
10. Resume service only under explicit incident recovery authority.

## Operator error: incorrect backup configuration

1. Preserve the failed configuration and error output.
2. Compare against the repository version of `pgbackrest.conf` and the documented filesystem contract.
3. Change one demonstrated variable at a time.
4. Run `stanza-create` only when creating the intended repository relationship.
5. Run `check`.
6. Create a new backup.
7. Perform an independent restore.
8. Do not claim the configuration is repaired based only on successful backup creation.

## Operator error: configuration loss

Configuration is recoverable from version control only to the extent it was intentionally versioned. Secrets are not configuration backups.

1. restore repository-tracked configuration from an accepted commit;
2. recreate host paths and permissions from this runbook;
3. restore secrets from the approved secret source;
4. compare image versions and schema contracts;
5. run the complete non-production acceptance proof before production reuse.

## Operator error: unexpected schema version

The schema contract guard must fail closed.

1. stop the incompatible action;
2. record expected and observed contract versions;
3. determine whether the mismatch came from code, migration state, restore point, or operator selection;
4. do not mutate the restored database to make the version string match;
5. select compatible code or a compatible backup, or perform a separately reviewed migration;
6. rerun semantic verification.

## Failed restore

A failed restore does not modify the source database in the SDN-002 procedure.

1. preserve restore stderr and pgBackRest logs;
2. keep the source stopped only as long as operationally required by the recovery plan;
3. verify repository availability;
4. verify backup metadata and required WAL;
5. verify target directory ownership and emptiness;
6. verify runtime and recorded backup versions;
7. correct the demonstrated fault;
8. recreate a clean recovery target;
9. rerun restore from the beginning;
10. run semantic verification before any cutover.

## Recovery verification checklist

A database restore is not accepted solely because PostgreSQL starts. Verify, as applicable:

- required schemas;
- extension names and versions;
- schema contracts;
- event counts and hashes;
- ingestion receipts;
- integrity conflicts;
- policy versions and rules;
- summaries and summary sources;
- compaction manifests and sources;
- provenance;
- lifecycle jobs;
- lifecycle evaluations;
- transition history;
- deletion receipts;
- tombstones;
- artifact metadata and hashes;
- backup metadata;
- active governance holds;
- Class A preservation.

An artifact restore is not accepted until the restored tree is cryptographically compared with the expected content.

## Production RPO and RTO

SDN-002 does not establish final RPO or RTO. Those values require measured production-shaped data growth, backup duration, WAL volume, restore duration, verification duration, host replacement assumptions, and off-host repository design.

Do not infer an RPO or RTO from a single successful CI recovery proof.
