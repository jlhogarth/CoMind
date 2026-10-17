# SDN-003 Production Activation Plan

## Status and authority

This document is the SDN-003 production activation plan for the CoMind Sovereign Data Node.

SDN-003 is planning only. This document does not authorize a production host mutation, production credential creation, production data migration, live telemetry routing, public ingress, destructive production lifecycle actions, or production cutover.

Planning work is tracked by Issue #136 and is based on authoritative main commit `76e6d9549640d7e726219f7d477dcc2976ebf19c`, which contains the accepted SDN-002 production boundary and recovery foundation.

Any production security-control activation, production data mutation, destructive production action, or live-routing change remains subject to an explicit human authorization checkpoint and the existing CoMind C4 boundary.

## Governing principles

1. PostgreSQL is never exposed directly to the public Internet.
2. Remote producers terminate at an authenticated application boundary, never at PostgreSQL.
3. Storage pressure never grants destructive authority.
4. Backup existence is not recoverability. Independent restore proof is required.
5. No source record may disappear silently during migration or recovery.
6. Production credentials are service-specific, least-privilege, revocable, and absent from Git, logs, evidence bundles, and this document.
7. The currently authoritative source remains intact until migration reconciliation, rollback proof, and separate cutover authorization are complete.
8. Missing deployment facts are blockers, not invitations to guess.
9. The recovery target must not overwrite the source as its first proof step.
10. Planning completion does not authorize deployment.

## Evidence baseline inherited from SDN-002

The accepted SDN-002 foundation already establishes the following tested architecture:

- PostgreSQL 17 with pgvector and pgBackRest.
- no host publication of PostgreSQL port 5432.
- an internal PostgreSQL container network.
- loopback-only ingestion publication by default.
- independent PostgreSQL recovery target.
- explicit persistence roots for database data, artifacts, archive, backup repositories, logs, secrets, and recovery targets.
- WAL archiving through pgBackRest.
- encrypted restic repository behavior and independent artifact restore proof.
- distinct ingest, lifecycle, purge, observer, backup, and admin database capabilities.
- admin does not inherit purge authority.
- append-only backup, restore, operational, capacity, artifact, and schema-contract evidence.
- payload-free aggregate status through `sdn_ops.current_status()`.
- a capacity guard whose warning and critical states never confer deletion authority.
- executable recovery procedures for interruption, backup failure, repository unavailability, disk pressure, corruption, host replacement, credential compromise, configuration loss, schema mismatch, and failed restore.

SDN-003 preserves these controls unless a later reviewed change makes them stricter.

## External technical references

The activation design is consistent with the following upstream guidance:

- PostgreSQL 17 connection configuration: https://www.postgresql.org/docs/17/runtime-config-connection.html
- pgBackRest user guide: https://pgbackrest.org/user-guide.html
- pgBackRest command reference: https://pgbackrest.org/command.html
- restic documentation: https://restic.readthedocs.io/en/latest/
- Docker Engine security: https://docs.docker.com/engine/security/

These references support configuration mechanics. CoMind acceptance still depends on CoMind-specific measured evidence.

# 1. Production host requirements

## 1.1 Host selection state

The physical production host has not yet been selected or documented. No host hardware, operating-system image, storage-device inventory, UPS, router topology, private-access technology, or off-host backup provider is authoritative yet.

Production activation is blocked until the actual inventory is recorded.

## 1.2 Minimum host characteristics

The production host should be a dedicated, always-on native Linux system rather than a developer workstation or desktop virtualization layer.

Minimum requirements before activation:

- supported 64-bit Linux distribution with a maintained security lifecycle.
- PostgreSQL 17 and current SDN container runtime compatibility.
- hardware virtualization or desktop hypervisor dependency is not required for normal operation.
- sufficient RAM to prevent sustained swap pressure during database operation, backup, restore, and integrity checks.
- high-endurance SSD or NVMe storage for PostgreSQL data.
- physically distinct local backup storage from the primary database storage failure domain.
- SMART or equivalent device health telemetry.
- power-loss protection through a verified UPS or equivalent controlled-shutdown capability.
- stable time synchronization.
- host firewall with default-deny unsolicited inbound access.
- a documented replacement-host path for disaster recovery.

Exact CPU, memory, storage capacity, filesystem, UPS model, and operating-system release are activation inventory items and must be measured rather than fabricated in this plan.

# 2. Storage topology

## 2.1 Logical storage tiers

Production storage should be separated by function and failure domain.

### Tier A: PostgreSQL primary

Contains:

- `SDN_PERSIST_ROOT/postgres/data`

Requirements:

- high-endurance SSD or NVMe.
- mirrored or otherwise redundantly protected local storage is strongly preferred.
- filesystem and mount options selected for PostgreSQL durability rather than maximum benchmark throughput.
- capacity reservation sufficient for database growth, WAL spikes, vacuum, index creation, migrations, and restore staging.

### Tier B: artifact and archive primary

Contains:

- `SDN_PERSIST_ROOT/artifacts`
- `SDN_PERSIST_ROOT/archive`

Requirements:

- capacity-oriented storage with integrity checking.
- must not share an unprotected single-device failure domain with the only backup copy.
- artifact identity and recorded SHA-256 metadata remain authoritative evidence for verification.

### Tier C: local backup repository

Contains:

- `SDN_PERSIST_ROOT/backups/pgbackrest`
- `SDN_PERSIST_ROOT/backups/restic`
- `SDN_PERSIST_ROOT/logs/pgbackrest`

Requirements:

- preferably a separate physical device or storage pool from Tier A and Tier B.
- repository disappearance is treated as unavailable, never as an empty repository to be silently reinitialized.
- backup retention is calibrated to measured storage growth before activation.

### Tier D: recovery workspace

Contains:

- `SDN_RECOVERY_ROOT/postgres/data`
- `SDN_RECOVERY_ROOT/artifacts`
- recovery logs

Requirements:

- must never alias the source paths.
- should be large enough for a complete independent database and artifact restore.
- should preferably use a separate local filesystem or device so a restore proof is not merely an in-place copy test.

### Tier E: off-host backup

Contains independent encrypted copies of database recovery material and durable artifacts outside the production host failure domain.

Requirements:

- separate failure domain from the production host and local backup storage.
- encrypted in transit and at rest.
- credentials isolated from ordinary application identities.
- repository health and restore are independently tested.
- provider-side versioning or immutability may be used only after compatibility with pgBackRest/restic retention and recovery behavior is demonstrated.

The exact off-host provider is unresolved and is an activation blocker.

# 3. Network and remote-access boundary

## 3.1 PostgreSQL exposure model

PostgreSQL remains private.

Required production properties:

- Compose or successor runtime publishes no PostgreSQL host port.
- router/NAT configuration does not forward 5432.
- no public tunnel points to PostgreSQL.
- public cloud security groups, if ever used, do not expose PostgreSQL.
- the database accepts only the minimum container or host-local interfaces required for the SDN topology.
- access is controlled by PostgreSQL role, database privilege, network boundary, and host firewall together.

Activation evidence must include a local topology inspection plus an external or LAN-side negative connectivity test showing PostgreSQL is not reachable through unintended paths.

## 3.2 Remote producer access

If remote producers are authorized later, they terminate at a governed application ingress boundary.

The preferred architecture is outbound-only from the production network through either:

- a private authenticated mesh/VPN path, or
- an outbound application tunnel terminating at a managed ingress service.

The final technology is a deployment decision. No router port-forwarding requirement should be introduced merely to make ingestion reachable.

The ingress boundary must provide:

- TLS.
- producer authentication with revocation.
- request-size limits.
- rate limiting and abuse protection.
- schema validation.
- replay/idempotency controls.
- source identity in provenance.
- auditable authentication failures without logging secret values or sensitive payloads.

## 3.3 Operator access

Operator access should use a private authenticated path that is distinct from public producer ingress.

Administrative shell or Docker-daemon access must never be exposed as an unauthenticated Internet service. Docker socket access is treated as root-equivalent administrative authority.

# 4. Credentials and secret lifecycle

## 4.1 Secret storage

Production secrets remain outside Git and outside Compose literals.

The existing `SDN_SECRET_ROOT` file-mount contract is retained unless a stronger local secret-management system is selected and tested.

Secret-directory requirements:

- host access restricted to the minimum administrator and service identities.
- directory traversal restricted.
- individual secret files readable only by the service path that requires them.
- secrets excluded from shell history, logs, crash bundles, CI evidence, repository content, Drive runbooks, and ChatGPT memory.
- secret backup, where required for disaster recovery, is separately encrypted and access-controlled.

## 4.2 Service identities

Production uses distinct identities for distinct authorities.

At minimum:

- ingest login receives only ingest persistence capability.
- lifecycle login receives lifecycle evaluation and derivative capability.
- purge login receives only the guarded purge capability and no unrestricted raw delete capability.
- observer login receives only the payload-free aggregate status surface.
- backup login receives only backup/restore/capacity evidence capability.
- administrative login is one-off and receives migration/bootstrap capability but does not inherit purge authority.

Group roles remain NOLOGIN where appropriate. Each runtime service identity receives only the group capability needed for that service.

## 4.3 Rotation and revocation

Before activation, each production secret must have:

- authoritative owner.
- creation method.
- storage location by name, never secret value.
- dependent services.
- rotation procedure.
- revocation procedure.
- verification procedure proving the old credential no longer authenticates.
- recovery/escrow policy where loss would make encrypted backups unrecoverable.

Rotation should be event-driven for suspected exposure and scheduled for service credentials according to the adopted operations policy. The plan does not assert an arbitrary rotation interval before the actual secret-management system is selected.

# 5. Container and host hardening

The accepted container controls are retained:

- read-only root filesystems where applicable.
- `no-new-privileges`.
- all Linux capabilities dropped unless a demonstrated requirement exists.
- no Docker socket mounted into application containers.
- no privileged application containers.
- internal PostgreSQL network.
- network-disabled restic container where compatible with the selected repository path.

Host hardening before activation must include:

- current security patches.
- restricted Docker-daemon administration.
- rootless Docker evaluated and used only if volume ownership, networking, backup, and recovery behavior pass acceptance. If rootless mode is not used, Docker group membership is restricted as root-equivalent authority.
- firewall baseline.
- SSH disabled from public interfaces or restricted to the approved private operator path.
- AppArmor, SELinux, or equivalent mandatory-access controls preserved when supported by the host distribution and verified against the SDN workload.
- unattended reboot disabled for the database host unless a tested high-availability design later makes automatic reboot safe.
- security updates staged with backup and rollback evidence when they can affect kernel, filesystem, Docker, or PostgreSQL behavior.

# 6. pgBackRest production initialization

No production pgBackRest repository or stanza is created under this planning issue.

When production initialization is separately authorized, the required sequence is:

1. verify the intended repository path and storage identity.
2. verify repository ownership and permissions.
3. verify database data directory identity.
4. configure repository encryption for each repository that requires pgBackRest encryption before stanza initialization.
5. configure local repository as the fast-recovery repository.
6. configure an off-host repository when selected and tested.
7. enable asynchronous archiving for a multi-repository design after failure behavior is tested.
8. run `stanza-create`.
9. run `check`.
10. create a full backup.
11. inspect machine-readable `info` output.
12. force WAL activity and verify archive arrival.
13. create a differential backup.
14. restore independently into `SDN_RECOVERY_ROOT`.
15. verify PostgreSQL startup, schema contract, semantic snapshot, provenance, lifecycle state, holds, receipts, and backup evidence.
16. record repository and backup identifiers without recording encryption keys.

A successful `backup` command without a successful independent restore is not sufficient activation evidence.

## 6.1 Provisional backup policy

The following is a starting policy for benchmark and capacity modeling, not an accepted guarantee:

- WAL archive: continuous, with current archive timeout no greater than 60 seconds unless measurement supports a stricter value.
- full backup: weekly.
- differential backup: daily.
- local retention planning basis: at least 2 full backup chains plus sufficient differentials for two weeks of operational recovery points.
- off-host retention planning basis: at least 4 full backup chains plus sufficient differentials for approximately one month of operational recovery points.

Final counts are selected only after measured database growth and repository amplification are known.

# 7. restic production initialization

No production restic repository is created under this planning issue.

When separately authorized:

1. verify source paths and ensure they contain only intended artifact/archive material.
2. verify the target repository identity and failure domain.
3. create a strong repository password through the approved secret process.
4. initialize the repository exactly once.
5. create the first snapshot.
6. record snapshot metadata without secret values.
7. run `restic check`.
8. restore to the independent recovery path.
9. compare the restored tree with recorded SHA-256 artifact evidence.
10. prove wrong-password failure remains fail-closed.
11. prove missing-source failure remains visible.
12. configure off-host repository behavior and independently restore from the off-host copy.

An unknown restic exit code is treated as failure.

## 7.1 Provisional artifact snapshot policy

To support the proposed 15-minute off-host RPO, the initial design target is an artifact backup opportunity at least every 15 minutes for data classified as requiring disaster recovery.

A provisional restic retention model for capacity testing is:

- hourly recovery points for 48 hours.
- daily recovery points for 30 days.
- weekly recovery points for 8 weeks.
- monthly recovery points for 12 months.

This policy must be revised if measured repository growth, legal retention, or artifact classification indicates a different requirement.

# 8. Off-host backup architecture

The preferred production design has two independent recovery paths:

1. local backup for rapid operational recovery.
2. encrypted off-host backup for production-host or site failure.

For PostgreSQL, pgBackRest supports multiple repositories and can archive WAL to each configured repository. A production test must prove behavior when the off-host repository is temporarily unavailable and later returns.

For artifacts, use an independent off-host restic repository or another independently restorable encrypted copy whose integrity can be verified without the production host.

The off-host account should be separated from ordinary runtime application authority. A compromise of the ingest service must not automatically confer backup-destruction authority.

Exact provider, bucket/container naming, account ownership, geographic region, monthly cost ceiling, retention cost, API rate limits, and restore-egress behavior are unresolved deployment decisions.

# 9. Restore-validation schedule

Recoverability is continuously re-proven.

Proposed production schedule:

## Daily

- PostgreSQL readiness.
- pgBackRest `check`.
- backup freshness and failure state.
- WAL archive freshness.
- restic latest-snapshot freshness.
- capacity and runway calculation.
- `sdn_ops.current_status()` health capture.

## Weekly

- independent PostgreSQL restore into the recovery root.
- semantic snapshot comparison against expected source state.
- independent artifact restore sample or full restore where size permits.
- restic integrity check appropriate to repository size and resource limits.
- negative credential/path checks that do not risk repository mutation.

## Monthly

- complete database plus artifact recovery drill into independent paths.
- measured RPO and RTO report.
- firewall and exposure verification.
- secret inventory and dependency review.
- recovery-runbook dry run.

## Quarterly

- host-loss tabletop or controlled replacement-host rehearsal.
- off-host-only recovery proof.
- review of retention, capacity growth, and failure-domain assumptions.

A failed scheduled restore proof is a recoverability regression. It creates an operator incident and blocks any claim that the affected backup path is healthy until the cause is corrected and a new restore succeeds.

# 10. Proposed recovery objectives

These are activation targets, not current guarantees.

## 10.1 RPO

### Local PostgreSQL recovery

Target: no more than 5 minutes of acknowledged durable database state under healthy WAL archiving.

Measurement: inject writes with durable identifiers, interrupt the database or restore from a selected base backup plus archived WAL, and measure the latest recovered acknowledged event.

### Off-host disaster recovery

Target: no more than 15 minutes of acknowledged PostgreSQL state and durable artifact state once off-host backup paths are active.

Measurement: perform recovery using only material available outside the production host failure domain.

## 10.2 RTO

### Routine service recovery

Target: 30 minutes or less from detected service failure to verified ingestion readiness when the host and primary storage remain trustworthy.

### Complete host loss

Target: 4 hours or less from availability of replacement host/storage/network prerequisites to verified SDN service readiness.

The complete-host-loss clock does not hide hardware procurement or site-access delay. Those external delays are recorded separately.

## 10.3 Acceptance rule

The target is accepted only when a controlled recovery drill meets it with measured timestamps and complete verification. If measurement fails, the target or architecture must be revised before activation.

# 11. Capacity policy

Production capacity management combines percent-free-space and time-to-exhaustion.

Provisional planning thresholds:

- healthy: more than 25 percent free and more than 14 days projected runway.
- warning: 25 percent free or less, or 14 days projected runway or less.
- critical: 15 percent free or less, or 72 hours projected runway or less.
- emergency: 10 percent free or less, or 24 hours projected runway or less.

These thresholds are starting points for production calibration.

## 11.1 Required responses

### Warning

- notify operator.
- measure growth by database, WAL, artifact, archive, pgBackRest, and restic category.
- identify abnormal write amplification or failed retention.
- prepare expansion or safe movement of non-authoritative temporary material.

### Critical

- backpressure retry-safe new ingestion.
- stop avoidable write amplification.
- preserve Class A records, governance holds, evidence, and backup metadata.
- expand or recover capacity.
- do not broaden purge authority.

### Emergency

- suspend nonessential writes.
- preserve database and evidence integrity.
- invoke operator incident handling.
- restore capacity before normal ingestion resumes.

No threshold grants permission to delete governed data.

# 12. Telemetry and ingestion routing

Production routing should be explicit and reversible.

## 12.1 Producer contract

Each producer must have:

- stable producer identity.
- scoped credential.
- event schema/version contract.
- idempotency identity.
- retry behavior.
- local or upstream durable queue when network delivery can fail.
- routing status visible to operations.
- provenance identifying producer and ingestion time.

## 12.2 Routing sequence

No producer is switched directly from the current path to unrestricted production SDN traffic.

Use this sequence:

1. synthetic production-shaped traffic only.
2. shadow or mirrored non-authoritative telemetry where duplication cannot harm the source of truth.
3. one bounded canary producer.
4. reconciliation of source and SDN receipts.
5. additional producers in small groups.
6. full routing only after an explicit activation authorization.

If a producer cannot safely duplicate writes, use a durable queue or replayable capture instead of introducing an ungoverned dual-write architecture.

# 13. Production data migration sequence

Migration is a controlled evidence process rather than a database-copy shortcut.

## Phase 0: inventory

Record each source dataset, authoritative source, schema/version, classification, record count, size, integrity/hash strategy, provenance requirements, retention policy, and migration owner.

## Phase 1: empty-node acceptance

Before importing production data, prove:

- host hardening.
- network isolation.
- secret permissions.
- database role matrix.
- schema contract.
- local backup and restore.
- off-host backup and restore.
- capacity monitoring.
- synthetic ingestion.
- lifecycle non-destructive behavior.
- operator visibility.

## Phase 2: migration rehearsal

Copy a representative non-production or exported test dataset through the intended migration tooling.

Verify:

- counts.
- stable identifiers.
- canonical hashes where defined.
- provenance links.
- policy assignment.
- duplicate behavior.
- conflict behavior.
- schema contract.
- backup and restore after migration.

## Phase 3: first production copy

Under separate production-data authorization, create a non-destructive first copy while the current authoritative source remains intact.

Record source snapshot identity/time and target import identity/time.

## Phase 4: reconciliation

Compare source and target using counts, identifiers, hashes, provenance, policy state, and known exclusions.

Every mismatch is explained or blocks continuation.

## Phase 5: delta and routing preparation

Capture changes that occurred after the first copy through a deterministic delta mechanism or bounded write pause.

Do not rely on an undocumented best-effort delta.

## Phase 6: canary activation

Route one bounded producer or workload class to the SDN while the rollback path remains intact.

## Phase 7: controlled cutover

Cut over only after explicit human authorization and only when the acceptance checklist is complete.

## Phase 8: post-cutover hold

Keep the prior authoritative source intact and recoverable through a defined stabilization period. No source retirement or destructive cleanup is implied by cutover.

# 14. Rollback and abandonment

## 14.1 Pre-cutover rollback

Before cutover, rollback means stop SDN-bound producers and continue using the existing authoritative source.

The SDN copy is preserved for diagnosis unless evidence handling requires isolation.

## 14.2 Post-cutover rollback

If the prior source remains write-compatible, route producers back under an incident decision and reconcile writes that occurred only in the SDN.

If immediate reverse routing would cause divergence, stop affected writes, preserve the queue/event journal, reconcile both sides, then resume from one declared authoritative source.

## 14.3 Abandonment

If production activation is abandoned:

- stop ingress.
- preserve required evidence.
- revoke production credentials.
- preserve or securely dispose of production data according to explicit retention authority.
- do not silently delete the target merely because activation failed.
- document why the design was abandoned and what would be required for reconsideration.

# 15. Monitoring and Operator Console integration contract

SDN-003 defines the interface only. It does not modify the Operator Console lane.

The Operator Console should consume a least-privilege SDN observer contract exposing aggregate operational state without raw event payloads.

Minimum fields:

- PostgreSQL queryable state.
- database logical and physical size.
- WAL size and archive freshness.
- artifact/archive size.
- local pgBackRest repository size.
- local/off-host backup freshness.
- restic snapshot freshness.
- latest successful independent restore proof.
- lifecycle backlog and failures.
- active holds.
- integrity conflicts.
- destructive capability configured state.
- deletion-receipt count.
- free bytes, free percent, and projected runway.
- warning/critical/emergency capacity state.
- ingestion readiness and backpressure state.

The console must not require broad database credentials to display these fields.

Initial monitoring should prefer existing CoMind evidence tables and lightweight open-source/local mechanisms. A paid observability platform is not required for activation.

# 16. Provenance and evidence preservation

Every production activation step that can alter recoverability or data authority must create durable evidence.

At minimum record:

- operator identity.
- date/time.
- repository commit.
- container image digests or immutable image identifiers.
- host OS/kernel/runtime versions.
- schema contract.
- storage inventory identifiers.
- network-boundary configuration summary without secrets.
- backup repository identities.
- backup IDs.
- restore-proof IDs.
- source migration snapshot/time.
- target import identity.
- reconciliation result.
- RPO/RTO measurement.
- capacity state.
- authorization decision.
- rollback decision if used.
- failure and workaround records.

Evidence is append-only where the schema supports it. Secret values and sensitive payloads are excluded.

# 17. Failure handling

Failure handling uses the accepted SDN-002 recovery runbook as the base.

Additional production requirements:

- every failed backup creates a visible incident until a new independent restore succeeds.
- off-host repository unavailability never causes silent repository reinitialization.
- ingestion backpressure is explicit and observable.
- retrying a migration chunk is idempotent or uses a recorded compensation path.
- schema mismatch fails closed.
- credential compromise triggers evidence preservation, rotation, dependency review, and verification that the old credential no longer authenticates.
- a host-compromise recovery uses a clean replacement environment and does not trust local backup metadata solely because it exists.
- an unexplained integrity mismatch blocks cutover or recovery completion.

# 18. Disaster recovery

## 18.1 Host loss

Recovery order:

1. establish a clean replacement host.
2. verify host hardening and network boundary.
3. restore configuration from accepted repository state.
4. restore secrets through the authoritative secret process.
5. attach or recover backup repositories.
6. restore PostgreSQL to a clean target.
7. restore artifacts to a clean target.
8. verify schema contracts.
9. verify semantic database state.
10. verify artifact cryptographic hashes.
11. verify holds, provenance, lifecycle evidence, and receipts.
12. verify ingress remains disabled until service acceptance is complete.
13. measure RPO/RTO.
14. resume routing only under recovery authority.

## 18.2 Site or local-storage loss

Recovery must be possible from the off-host path without depending on the failed local backup device.

## 18.3 Backup credential loss

The secret recovery/escrow process must be tested before production. Loss of a restic repository password can make that repository unrecoverable and is treated as a disaster.

# 19. Operational runbooks required before activation

The following procedures must exist as executable runbooks before production cutover:

1. normal startup and shutdown.
2. routine database interruption.
3. lifecycle worker interruption.
4. failed PostgreSQL backup.
5. failed artifact backup.
6. unavailable local backup repository.
7. unavailable off-host repository.
8. independent PostgreSQL restore.
9. independent artifact restore.
10. capacity warning response.
11. capacity critical/emergency response.
12. producer credential rotation.
13. database service credential rotation.
14. backup credential rotation/recovery.
15. host patch and reboot.
16. PostgreSQL/pgBackRest/restic/container upgrade.
17. schema migration.
18. migration reconciliation failure.
19. rollback to prior routing.
20. complete host replacement.
21. security incident isolation and recovery.
22. abandonment/decommission without silent data loss.

The existing `sdn/production/RECOVERY.md` satisfies part of this requirement and should be extended only when production-specific facts and procedures are available.

# 20. Production activation acceptance criteria

Production activation may be proposed only when every applicable item below has objective evidence.

## Host and storage

- actual host inventory recorded.
- actual OS, kernel, Docker/runtime versions recorded.
- primary database storage identified and health-checked.
- artifact/archive storage identified and health-checked.
- local backup storage proven to be a distinct intended failure domain.
- recovery workspace capacity proven.
- UPS or controlled-shutdown mechanism tested.
- measured baseline capacity and growth recorded.

## Network

- PostgreSQL has no public or LAN-unintended exposure.
- firewall policy verified.
- operator access path verified.
- producer ingress path, if enabled, terminates only at the application boundary.
- TLS and producer revocation verified.

## Identity and secrets

- service role matrix verified.
- admin does not inherit purge authority.
- observer cannot read event payloads.
- purge cannot perform unrestricted raw delete.
- secret paths and permissions verified.
- rotation/revocation procedures executed in a non-destructive proof.
- backup credential recovery/escrow procedure verified.

## Database and schema

- migrations run idempotently against the intended production-shaped environment.
- schema contract matches accepted code.
- synthetic ingestion, duplicate handling, conflict evidence, provenance, lifecycle, holds, and guarded deletion rules pass before production data is loaded.

## Backups and recovery

- pgBackRest stanza initialized and checked.
- full backup succeeds.
- differential backup succeeds.
- WAL archive freshness verified.
- local independent PostgreSQL restore succeeds.
- off-host-only PostgreSQL restore succeeds.
- restic repository initializes and checks successfully.
- local independent artifact restore succeeds.
- off-host-only artifact restore succeeds.
- semantic and cryptographic comparisons pass.
- scheduled restore automation is configured and has at least one successful observed run.

## Recovery objectives

- local PostgreSQL RPO test meets the accepted target.
- off-host disaster RPO test meets the accepted target.
- routine service RTO test meets the accepted target.
- host-loss recovery test meets the accepted target or a revised target is explicitly approved.

## Capacity and operations

- warning, critical, and emergency states are observable.
- critical state backpressures safe-to-retry ingestion.
- no capacity state grants destructive authority.
- operator escalation is verified.
- backup age, restore age, WAL freshness, lifecycle backlog, failures, integrity conflicts, and holds are visible.

## Migration

- source datasets inventoried.
- migration tooling rehearsed.
- first-copy reconciliation method proven.
- delta mechanism proven.
- canary routing proven.
- rollback path rehearsed.
- source-retention period and retirement authority documented.

## Evidence and authority

- exact repository commit and image identifiers preserved.
- Durable RunBook updated.
- unresolved blockers are zero for the requested activation scope.
- explicit human production activation authorization is recorded after review of the evidence package.

Only the final item crosses the planning boundary. Passing technical tests alone does not authorize production.

# 21. Risk and blocker register

## B1: production host not selected

Impact: storage, performance, power, OS-hardening, and RTO assumptions cannot be finalized.

Resolver: Joseph selects or identifies the intended host and provides or authorizes inventory collection.

Activation effect: BLOCKED.

## B2: storage-device inventory and capacity unknown

Impact: retention, capacity thresholds, restore workspace, and growth runway cannot be calibrated.

Resolver: production host/storage inventory.

Activation effect: BLOCKED.

## B3: UPS/power-loss protection unknown

Impact: graceful shutdown and power-loss recovery risk cannot be accepted.

Resolver: production environment inventory.

Activation effect: BLOCKED for unattended production operation.

## B4: remote-access technology not selected

Impact: exact TLS, identity, revocation, and ingress runbook cannot be finalized.

Resolver: architecture selection after host/network inventory.

Activation effect: remote production ingestion BLOCKED. Local-only operation may be assessed separately.

## B5: off-host backup destination not selected

Impact: site-loss recovery and off-host RPO cannot be demonstrated.

Resolver: choose an off-host repository technology/provider and cost ceiling.

Activation effect: full production activation BLOCKED.

## B6: production secret-management/escrow mechanism not selected

Impact: credential-loss recovery cannot be fully demonstrated.

Resolver: choose and test authoritative secret storage and backup-password recovery policy.

Activation effect: BLOCKED.

## B7: production data migration scope not enumerated

Impact: migration sequence cannot be instantiated into dataset-specific steps.

Resolver: inventory authoritative source datasets and producer classes.

Activation effect: production data migration BLOCKED.

## B8: provisional RPO/RTO not yet benchmarked

Impact: targets are engineering objectives only.

Resolver: controlled recovery tests on selected production hardware/storage.

Activation effect: cutover BLOCKED until accepted measurements exist.

# 22. Cost-control considerations

The design avoids requiring a paid observability platform.

Primary recurring production costs expected beyond already-owned local hardware are:

- electricity.
- off-host backup storage.
- optional off-host API/egress costs during restore.
- optional private tunnel or VPN service if a paid tier is selected.

Provider selection must compare storage price, API cost, restore/egress cost, object-lock/versioning features, regional durability, S3 compatibility where relevant, and account-security controls.

No paid provider is selected or provisioned by this planning document.

# 23. Cross-lane interfaces

## Operator Console

SDN-003 defines a payload-free read-only status contract. Implementation belongs to the Operator Console lane unless separately coordinated.

## LF-3

LF-3 remains separate. SDN-003 does not modify LF-3. If LF-3 later depends on a production SDN security control, the dependency must be recorded and coordinated rather than silently absorbed into this lane.

## Agent/VE telemetry

The SDN may later become the high-volume telemetry destination, but no live Agent or VE telemetry is routed under SDN-003 planning authority.

# 24. Human authorization checkpoint

The next production-mutating phase must not begin automatically when this plan is accepted.

Before any production host mutation, credential creation, repository initialization, production data copy, or live routing, the activation package must identify:

- selected host and inventory.
- selected storage topology.
- selected off-host backup destination.
- selected secret-management mechanism.
- selected remote-access boundary if remote ingress is in scope.
- accepted provisional or revised RPO/RTO targets.
- exact non-destructive preflight actions proposed.
- rollback and evidence-capture method.

A human authorization must then explicitly define which production actions are permitted. Unlisted production actions remain unauthorized.

# 25. Planning milestone completion rule

SDN-003 planning is complete when:

- this plan has been reviewed against the accepted SDN-002 implementation.
- unresolved deployment-specific values remain explicit blockers rather than fabricated values.
- the risk register is current.
- the production activation checklist is objective and measurable.
- the Durable RunBook records the SDN-003 planning milestone and production authority boundary.
- no production mutation has occurred.

Planning completion is not production readiness, and production readiness is not production authorization.
