# SDN-002 Production Boundary Foundation

## Status

This directory defines a production-shaped, non-production Sovereign Data Node deployment foundation.

It is not a production authorization. It must not be used to route production CoMind data, live agent telemetry, live Supabase synchronization, regulated data, public remote ingestion, or automatic production destructive retention.

The accepted SDN-001 isolated proof remains the lifecycle regression oracle. SDN-002 adds host, persistence, backup, restore, capacity, security, and recovery boundaries without replacing the SDN-001 architecture.

## Container topology

The Compose topology contains these bounded capabilities:

- `db`: PostgreSQL 17 plus pgvector and pgBackRest. No host port is published.
- `restore-db`: independent recovery target. No host port is published. It is enabled only through the `recovery` profile.
- `ingest`: authenticated Fastify ingestion. Its only host publication is loopback by default.
- `lifecycle`: one-off lifecycle worker under the `tools` profile.
- `purge`: one-off separately credentialed destructive capability under the `tools` profile. No scheduler is attached.
- `admin`: one-off database bootstrap and migration capability under the `tools` profile.
- `restic`: network-disabled artifact and archive backup tool under the `backup` profile.

The PostgreSQL network is internal. No container mounts the Docker socket. No service is configured as privileged.

## Persistent filesystem contract

The operator supplies three roots:

- `SDN_PERSIST_ROOT`: authoritative non-production persistent working storage.
- `SDN_RECOVERY_ROOT`: independent restore target.
- `SDN_SECRET_ROOT`: host-protected secret files that are mounted only into explicitly authorized services.

`SDN_PERSIST_ROOT` contains:

- `postgres/data`: PostgreSQL data directory.
- `artifacts`: artifact content.
- `archive`: archive content.
- `backups/pgbackrest`: PostgreSQL backup repository and archived WAL.
- `backups/restic`: encrypted restic repository.
- `logs/pgbackrest`: persistent pgBackRest logs.

`SDN_RECOVERY_ROOT` contains independent PostgreSQL and artifact restore locations. Recovery must never overwrite the source as its first proof step.

Production host deployment should place the database, artifact/archive tier, and backup repositories on storage selected for their durability and failure domains. A later production milestone must decide whether backup repositories remain local, move off-host, or use both.

## Filesystem ownership and permissions

The PostgreSQL data, pgBackRest repository, and pgBackRest log paths are owned by the image `postgres` user. The acceptance harness determines and applies ownership only inside its bounded disposable roots.

Secret-root traversal is host restricted. Secret values are never committed. Compose receives file references, not literal secret values. The acceptance harness does not preserve the rendered Compose configuration as evidence because rendering infrastructure configuration is not a justification to preserve secret-bearing runtime material.

The restic process runs as the configured host UID and GID and receives only the artifact/archive source paths, its repository, its independent restore path, and its password secret.

## Database capability boundaries

SDN capability roles remain distinct:

- `sdn_ingest_role`: ingestion persistence only.
- `sdn_lifecycle_role`: evaluation, summaries, manifests, and lifecycle state only.
- `sdn_purge_role`: guarded physical deletion function only. It does not receive raw `DELETE` authority.
- `sdn_observer_role`: aggregate operational status function only, without raw event payload access.
- `sdn_backup_role`: backup, restore, capacity, and artifact evidence recording.
- `sdn_admin_role`: observer and backup evidence capabilities. It does not inherit `sdn_purge_role`.

Administrative migration is intentionally a one-off tools profile. It is not a permanent network service.

## PostgreSQL backup architecture

SDN-002 uses pgBackRest 2.59.3, built on the same PostgreSQL 17 and pgvector image family used by SDN-001.

The repository is `/var/lib/pgbackrest` inside the database and restore containers. The current non-production policy keeps two full backups and four differential backups. This is a test retention configuration, not an accepted production RPO or RTO.

The database starts with WAL archiving enabled and uses:

`pgbackrest --stanza=sdn archive-push %p`

The acceptance harness creates the stanza, runs `check`, creates a full backup, creates a differential backup after additional state changes, inspects machine-readable metadata, and restores from the repository into an independent PostgreSQL data directory while the source database is stopped.

## Artifact and archive backup architecture

SDN-002 uses `restic/restic:0.19.1` with an encrypted repository. The password is provided through a mounted secret file.

The acceptance harness proves:

- repository initialization;
- multiple snapshots;
- snapshot listing;
- repository integrity check;
- retention and prune;
- independent restore;
- SHA-256 tree comparison;
- wrong-password failure;
- missing-source failure.

## Observability contract

`sdn_ops.current_status()` is a payload-free, machine-readable status surface. It exposes aggregate operational state without exposing event payloads or credentials.

The recovery evidence model records:

- backup events;
- restore proofs;
- operational failures and recoveries;
- artifact hashes;
- capacity samples;
- schema contracts.

Capacity samples may include:

- logical database bytes;
- physical database bytes;
- WAL bytes;
- artifact bytes;
- archive bytes;
- pgBackRest repository bytes;
- restic repository bytes;
- filesystem total and free bytes;
- free percentage;
- observed backup growth.

## Provisional capacity policy

The initial non-production thresholds are:

- above 20 percent free: healthy;
- 10 to 20 percent free: warning;
- at or below 10 percent free: critical.

The thresholds are provisional and must be calibrated with measured growth before production authorization.

At warning state, operator attention is required but existing lifecycle authority does not change.

At critical state, the capacity guard requires new-ingestion backpressure and operator recovery. It never grants destructive authority. Storage pressure alone is not evidence that deletion is authorized.

The SDN-002 acceptance harness proves this decision policy and fails its own run if the actual acceptance filesystem is already critical. Wiring this guard into a permanent production supervisor is explicitly deferred to the production activation milestone.

## Host firewall requirement

A production host must deny unsolicited inbound PostgreSQL access. Port 5432 must not be exposed through Compose, host NAT, router forwarding, tunnel configuration, or a public security group.

Any later remote ingestion path must terminate at a governed application boundary, not at PostgreSQL. Remote access, tunnels, reverse proxies, VPN policy, and TLS termination are outside SDN-002 authorization.

## Logging

Current logging locations are:

- PostgreSQL and ingestion: container runtime stdout and stderr.
- pgBackRest: persistent `SDN_PERSIST_ROOT/logs/pgbackrest` plus console output captured by the acceptance workflow.
- acceptance evidence: `sdn/evidence/sdn-002`, which is ignored by Git and uploaded only by CI.

Sensitive payloads and secret values must not be added to operational logging merely to improve observability.

## Startup and shutdown

Normal startup order is database health first, then ingestion. Lifecycle, purge, admin, backup, and recovery tools are explicit one-off actions.

Normal shutdown should stop ingestion before PostgreSQL so no producer is told the node is ready while the database is intentionally going down. PostgreSQL must receive a normal container stop so it can checkpoint and exit cleanly.

Unexpected power loss is treated as a recovery event. PostgreSQL crash recovery is allowed to run, followed by database health, lifecycle backlog, WAL archive, backup status, and artifact-store checks. A clean restart is not by itself proof that all recoverability invariants remain satisfied.

## Disk exhaustion behavior

A full filesystem must not be allowed to develop silently. Capacity collection and the guard policy must surface warning and critical states.

Critical storage pressure must not trigger an automatic purge. The safe response is to stop or backpressure new non-authoritative writes, preserve already durable evidence, diagnose the storage condition, and expand or recover capacity. Existing guarded lifecycle deletion remains subject to policy, derivative evidence, holds, eligibility, and the separately scoped purge capability.

## Upgrade strategy

Before a database, pgBackRest, restic, pgvector, Node.js, or schema upgrade:

1. record the current image and schema versions;
2. create and verify a fresh backup;
3. restore that backup independently;
4. test the proposed version against a copy;
5. run SDN lifecycle regressions;
6. preserve exact pre-upgrade and candidate image identifiers;
7. promote only after evidence is green.

Schema contracts are append-only version records. A runtime or recovery process that expects a different registered contract must fail closed rather than silently interpreting an unknown schema.

## Rollback strategy

Container rollback means returning to the last verified image and configuration only when the on-disk PostgreSQL format remains compatible. Database major-version rollback must never be attempted by simply starting an older server against a newer data directory.

When storage format or schema compatibility is uncertain, rollback means independent restore from the last verified compatible backup into a clean target, semantic verification, then controlled cutover under a later production authorization.

## Current boundary

SDN-002 can prove production-shaped persistence and recovery mechanics. It does not authorize or prove:

- a permanent production host;
- production credentials;
- off-host backup durability;
- final production backup cadence;
- final RPO or RTO;
- high availability;
- replication or failover;
- public or remote ingestion;
- live Supabase synchronization;
- production destructive retention;
- regulated or customer-data retention;
- enterprise IAM.

Those remain later explicit milestones.
