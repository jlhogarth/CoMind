# PDP-001 synchronization, continuity and integrated recovery

Design proposal only. No described synchronization worker, queue, alarm, failover path or production backup is claimed deployed by PDP-001.

## Ownership semantics

[authority.csv](authority.csv) is normative for this proposal. Managed PostgreSQL owns transactions, identity references, authority and control transitions. SDN owns cognitive/evidence bytes and their versioned derivatives. For externally authored documents, SDN owns the preserved captured version; it cannot redefine the external original.

Application data-family splitting must use separate tables or typed events and write permissions. The scoped columns in the matrix are distinct objects, not competing masters for one mutable row. Every replica carries origin, authority domain, version, hash, freshness and classification. A replica cannot be promoted merely because its source is unavailable. No timestamp-based last-writer-wins across planes.

Managed summary/index copies are bounded and rebuildable; they do not become the only copy of a consequential fact. Sensitive identity data, credentials, full JWTs and secrets stay outside SDN replication. Hashes of low-entropy personal values are not anonymization; minimize or use keyed references with protected keys.

## Durable synchronization contract

Use application-owned transactional outbox and consumer inbox on each authoritative plane. Managed-to-SDN transports selected control/evidence events; SDN-to-managed transports catalog manifests, compact observations and result proposals. Replication writes use projection-only roles and cannot call authority-granting mutation paths.

1. Source transaction commits its business mutation and outbox row atomically. Large SDN objects are durably written and hash-verified first; the transaction commits their manifest and outbox reference. An orphan blob is discoverable and held for reconciliation, never silently deleted.
2. Producer identity is a registered service identity bound to tenant, environment, event type and authority domain. Transport credentials authenticate the connection; signed envelope/key ID and authorized provenance bind origin. Key rotation preserves old verification keys for retained events.
3. Event envelope includes UUID event ID, producer ID, environment, authority domain, aggregate ID, authority epoch, aggregate version, event type, schema version, occurred/committed times, correlation/causation IDs, classification, payload hash, and object manifest references. One event ID is generated once inside the source operation and reused across retries. Request idempotency keys bind user/API retries to the same business operation.
4. Source assigns contiguous committed aggregate versions under a row lock or equivalent serialized update. Database sequence numbers alone are not proof of gap-free commit order. Cross-aggregate causal dependencies are explicit; there is no global timestamp ordering assumption.
5. A pull-based relay uses outbound authenticated HTTPS/private connectivity from SDN. Managed gateway exposes narrow export/receipt endpoints, not unrestricted SQL. SDN uploads outbound proposals to managed ingress. Local PostgreSQL stays unexposed. The exact hosting/network implementation is an activation blocker, not a fabricated endpoint.
6. Durable outbox is the initial queue. No Kafka or paid queue is required initially. Source-side retention, leased delivery rows and indexed pending scans support retries; lease expiry recovers crashed relays. If a broker is later added, it is a transport cache, not the source of authority.
7. Consumer verifies identity, signature/hash, schema, size, tenant, authority, predecessor/version and classification before applying. Inbox uniqueness on origin/epoch/event ID plus projection update commits in one transaction. Same ID with a different hash is a security/integrity failure.
8. Acknowledgment means durable inbox+projection commit, including verified referenced-object persistence when required. It does not mean HTTP receipt or in-memory enqueue. Lost acknowledgment causes duplicate delivery and a repeatable stored receipt, not a second effect.
9. Retry transient failures with exponential backoff and jitter, bounded concurrency and no finite retry policy that discards records. Quarantine poison/schema/integrity events with reason, owner and status; preserve source bytes. Block dependent aggregate progression; unrelated aggregates may proceed if dependency rules permit.
10. Track contiguous high-watermarks per producer/aggregate/epoch plus gap sets and object verification receipts. Reconcile counts, version ranges, partition manifests and hashes daily and after incidents. Counts alone cannot detect altered bytes or compensated omission.
11. Replay by authorized origin/range into an isolated projection namespace first. Preserve original IDs and hashes; replay delivery IDs differ. Suppress external side effects. Bidirectional projections must never emit the received event as a new source fact, preventing loops.
12. Schema evolution uses versioned contracts, expand/contract and backward-compatible consumers. Unsupported major versions quarantine and alert; no lossy best-effort coercion. Record source/consumer schema versions and adapter transformation lineage.
13. Control plane validates SDN result proposals against current job lease, fencing epoch, policy and idempotency state. An expired or duplicate execution remains evidence but cannot finalize a task or spend again. External side effects need stable idempotency keys and reconciliation before retry after ambiguous outcomes.

No distributed exactly-once claim is made. Delivery is at least once; inbox/application idempotency bounds duplicate internal effects. Outside services may still require manual compensation.

## Backpressure and extended outage

Proposed initial thresholds for rehearsal: warning oldest unacknowledged event >5 minutes; critical >30 minutes or predicted disk exhaustion <24 hours; stop admitting optional high-volume work when remaining spool capacity cannot cover the configured outage budget. These are proposed values, not tuned production thresholds.

Never drop consequential records to meet a storage budget. Reject new work explicitly before execution when durable logging cannot be guaranteed. Optional sampling of future telemetry requires an explicit approved policy, recorded sampling parameters and loss accounting. Existing raw data expires only through approved lifecycle policy with holds and receipt evidence.

Size spool as measured peak bytes/second times outage duration times measured serialization/index/retry amplification, plus recovery reserve. Start design rehearsal with seven days of backlog; hardware capacity is unknown. Prioritize revocations, kill switches and incident notices over bulk indexing. Do not let priority skip causal ordering within an aggregate.

After a long outage: inspect epoch/schema/key compatibility; preserve queue snapshot; verify source continuity and object manifests; renew credentials; revalidate current grants; replay bounded batches; track drain rate vs arrival rate. If consumer rate is not above incoming rate, backlog will not clear. Pruning an acknowledged source outbox requires both reconciliation and the independent replay-retention policy; a restored consumer behind retention requires a new consistent snapshot and a declared replay boundary.

## Failure and continuation matrix

The following behavior is required design, not verified production behavior. Cloud application hosting must itself be available for managed-only continuity.

| Failure | What may continue | What stops and recovery action |
| --- | --- | --- |
| Managed DB unavailable | Local read-only cognition from authorized cached content; durable local observation capture within existing limits | No new grants, job leases, authoritative transactions or paid execution. Queue proposals; recover managed authority first |
| SDN unavailable | Managed identities, RunBook, task/control transactions and managed application functions without SDN dependency | Evidence-dependent cognition/ingestion cannot claim completion. Keep managed outbox; explicitly mark missing content |
| Home Internet outage | Local cached reads and durable non-authoritative drafts | No control-plane dependent execution. Cloud managed-only application can continue elsewhere; reconnect/reconcile |
| Local power outage | Managed cloud control functions, if cloud app hosting is independent | SDN work stops; UPS controlled shutdown and restart validation; no automatic data-plane promotion |
| Managed regional failure | Local evidence reads subject to cached access expiry | Control writes stop until approved alternate restoration with fencing; provider HA inside one region is insufficient |
| Local host failure | Managed functions and pending-work visibility | Replace host, restore SDN independent target, verify before replay |
| Local storage failure | Managed functions; unaffected independent backups | Stop affected ingestion; preserve media/evidence; restore DB and object manifests consistently |
| Sync backlog | Independent authorized source operations while spool/capacity safe | Stale projections clearly labeled; stop optional admission at capacity boundary; no silent truncation |
| Corrupted event | Unrelated aggregates with intact dependencies | Quarantine exact bytes/hash, block dependent stream, source comparison and authorized corrective event |
| Credential compromise | Isolated unaffected identities after incident assessment | Revoke credentials/sessions, fence epochs, freeze affected sync and mutations; retain evidence, rotate and replay after review |
| Schema mismatch | Compatible streams only | Unsupported contracts quarantine; expand consumer then replay; no automatic source schema mutation |
| Partial migration | Old authority before cutover, read-only rehearsal target | No split writes; compare snapshot/delta manifests, discard failed target only with scoped authority |
| Stale replica | Informational reads displaying freshness, if access remains valid | Never use stale grants for new authority or stale balances for spending; reconcile against source |
| Provider account suspension | SDN reads and independent export recovery preparation | Provider APIs/backups may be unavailable; invoke provider-independent restore and human escalation |
| Provider exit | Source continues until authorized cutover if available | Export schema/data/objects/config, rebuild auth/API compatibility, rehearse and fence old writer |
| Catastrophic local loss | Managed control/catalog state and off-host evidence | Rebuild from off-host backups; report any last-unprotected SDN interval explicitly |
| Simultaneous disruptions | Independently held recovery inventory and offline incident procedure | No live service promise. Restore clean authority and backups on approved infrastructure; quantify irrecoverable intervals |

Offline reads of confidential content require current valid cached access rights. Expired authorization may stop reads as well as writes. Local drafts never become approval records until managed authority validates them. No offline side-effect execution is proposed in PDP-001.

## Recovery objectives and authority

Provisional objectives for review, not achieved guarantees:

| Recovery scope | Proposed RPO | Proposed RTO | Proof required |
| --- | --- | --- | --- |
| Managed DB ordinary failure | <=5 minutes of committed authoritative data | <=4 hours | Timestamped committed markers and PITR restore plus semantic checks |
| Managed provider-independent disaster | <=24 hours from verified export plus eligible replay | <=24 hours after clean target and operator availability | Independent PG17 restore without provider access; objects/auth/config reconciliation |
| SDN database local failure | <=5 minutes with WAL archive | <=4 hours | Existing SDN acceptance extended to actual hardware and real backup chain |
| SDN catastrophic off-host restore | <=24 hours for independently protected DB+objects | <=24 hours after replacement hardware available | Clean-host restore with keys independent of lost host |
| Sync under normal operation | <=5 minutes freshness | Backlog drain within 4 hours after restored connectivity for 24-hour outage | Measured source/consumer watermarks, sustained drain above arrival rate |

RTO clocks start at incident declaration and include detection/escalation separately in evidence. Hardware/provider/operator availability qualifications must be reported; they cannot hide elapsed customer outage. Objectives require Joseph's acceptance and feasible measurements. More stringent region-loss RPO implies independent continuous event/export protection or cross-region replication with additional cost; daily exports do not achieve five-minute regional RPO.

A sync watermark is not a database recovery point. Define the coherent recovery frontier as the set of source epochs/aggregate versions whose transactions, referenced objects and consumer commits all verify. Events beyond the frontier are retained for reconciliation, not overwritten. Replicas and outboxes are not independent backups.

## Integrated backup policy proposal

Managed provider PITR handles short-window database recovery. Daily encrypted logical exports of application schemas, data, grants, role definitions without secret values, extension inventory, migration/version manifest and outbox/inbox/checkpoints provide portability. IdP export/config and object contents require separate tools and authorization. Export scope must be rehearsed against restricted managed schemas. Retain provider-independent exports off-host and outside the managed-provider account, with separate encryption-key escrow.

SDN retains accepted pgBackRest WAL/database chains and restic artifact/archive snapshots, with separate local and off-host failure domains. Proposed initial retention: two weekly full database chains locally, four off-host, daily differentials; daily off-host object snapshots. Final retention depends on measurements, privacy obligations and holds. Do not enable purge/prune in planning. Cross-reference SDN backup IDs, object snapshot IDs, managed export/PITR IDs, schema versions and sync frontier in one signed recovery manifest stored in each available plane and independent off-host storage.

A single encrypted disk on the SDN host is not off-host protection. An ordinary SDN application account cannot delete off-host recovery material. Test object-lock/versioning compatibility before adoption; retention locks can themselves incur unavoidable charges.

## Authoritative recovery sequence

1. Declare incident; stop relays and side effects, fence old writers and external workers, preserve logs and storage. Select incident commander and independent restore verifier.
2. Determine per-family source, known compromise interval, schema and integrity state. Use clean infrastructure and independently retrieved keys. Do not restore directly over original evidence.
3. Restore managed authority to an isolated target from clean PITR/export. Expire leases; keep activation disabled. Reapply revocations, holds, budget and kill-switch events newer than snapshot from independently verified evidence. If this cannot be proven, require new human grants and keep affected work disabled.
4. Restore SDN DB and objects independently using verified compatible recovery manifest; reconcile missing/orphan objects and hashes. Preserve newer valid SDN-origin facts, but never let them rewrite managed control state.
5. Compute the verified recovery frontier and compare every source stream with inbox/ack state. A restored inbox may forget earlier effects; check business idempotency records and external-provider receipts before replay.
6. Snapshot/replay controlled gaps without side effects first. Quarantine conflicting hashes or impossible versions. Record known lost intervals, source counts, hashes, holds and acceptance results in the RunBook.
7. Restore keys with new service credentials, verify old ones revoked, test policies and network denies, measure RPO/RTO and projection freshness. Get explicit cutover/activation authority before enabling writers/relays.
8. Reconcile again after reopening; retire incident monitors only after declared terminal conditions. Preserve independent evidence.

Drill schedule proposal: pre-activation clean restore and 24-hour outage replay; monthly isolated managed and SDN recovery; quarterly combined/provider-exit exercise; repeat after schema, major engine, key or backup changes. Cost and destructive implications require scoped approval. No drill has been run by this planning change.
