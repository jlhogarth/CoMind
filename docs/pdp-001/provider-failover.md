# Staged two-provider production failover requirement

Joseph's 2026-10-17 clarification: $50 is the initial managed-database planning budget; the eventual target is two production provider databases with failover. The future combined budget, target failover time and acceptable loss window are not yet specified. This is a design requirement, not authorization to provision a standby or initiate replication.

## Stages and selection consequence

| Stage | Architecture | Gate |
| --- | --- | --- |
| Initial | One managed writer, independent backups/exports, SDN cognitive/evidence plane | Under-$50 database target; measured recovery and portability |
| Dual-provider readiness | Independently managed second production DB, continuous one-way replication, schema/config parity and rehearsed promotion | Separately approved combined cost, identities/networking and production replication authority |
| Governed failover | Controlled promotion of standby after fencing old writer and proving recovery frontier | Measured end-to-end failover and human authorization; no automatic promotion assumed |
| Future automated failover | Independent coordination/witness, expiring writer leases and fencing enforced on every write/worker path | Partition/split-brain tests, documented failure policy and separately approved automation authority |

Single-writer operation is the proposed architecture. Two providers must never accept independent conflicting writes. The managed-authoritative entries in authority.csv refer to the logical control-plane domain, whose active provider is selected by the accepted writer epoch. Provider A or B is not permanently authoritative regardless of failover. SDN remains the data plane and does not become the managed writer or sole failover witness.

Primary selection must now include a credible independently hosted standby route. Verify PG17 extension compatibility, outbound publication/CDC and inbound subscription/apply support, permissions, slot limits, network reachability, DDL parity, export and restoration. Database-only low price cannot win if it makes this target impractical. Neon Launch is compatibility-blocked pending the evidence in neon-history.md, and is not a proven replication partner. The second provider and underlying cloud/region are unselected. Two vendor brands hosted in the same cloud/region do not eliminate that shared failure domain; document billing, IAM, DNS and operator dependencies too.

## Replication design options

Prefer asynchronous native PostgreSQL logical replication for compatible application tables when both managed plans explicitly permit it. Verify full transactional consistency across the chosen publication/subscription arrangement, replica identities, deletes, initial snapshot and checkpoints. Application-owned outbox/CDC projection is an alternative only with demonstrated complete coverage of all authoritative control state. The filtered managed-to-SDN stream is not automatically sufficient to rebuild a production standby.

PostgreSQL 17 logical replication does not carry DDL, sequence state or large objects. Replicated rows do not prove that roles, policies, extensions, functions, secrets or external identity/object services are ready. Keep reviewed migrations/configuration synchronized separately and validate sequence allocation before promotion [P1]. Subscription/slot management requires explicit lifecycle handling and monitoring of retained WAL; an abandoned slot can exhaust source storage [P2]. These capabilities must be confirmed for the actual managed tiers, not inferred from upstream PostgreSQL support.

Asynchronous replication can lose committed-but-unreplicated changes during provider loss. A near-zero or zero-loss target is a separate requirement with latency, availability and cost implications; no such guarantee is made. Report measured lag and confirmed durable apply position, not just last network contact. Independent backup protects against corruption or malicious deletion that replication can copy immediately.

## Required promotion sequence

1. Declare incident; freeze admission and side-effecting workers, preserve evidence. A network timeout alone cannot prove the old writer is dead.
2. Fence the old writer and its workers using a separately designed expiring-lease/epoch mechanism enforced at every write and externally consequential action. A new epoch stored only in the promoted database cannot fence an isolated old primary. If fencing cannot be established, keep writes unavailable rather than risk split brain.
3. Verify standby schema, roles, RLS, sequences, integrity, current policy/holds/revocations and confirmed apply frontier. Record the acknowledged source interval that cannot be proven present. Obtain loss acceptance where required.
4. Promote one writer under the approved failover authority. Switch the application gateway/configuration and pools, revoke old credentials where accessible, revalidate identities/API routes, expire old leases and bind jobs to the new epoch. DNS changes alone are insufficient because cached endpoints and existing connections persist.
5. Reconcile SDN source events and managed outbox/inbox against the new writer. Preserve original event IDs; handle forgotten inbox effects and external idempotency before replay. No blind replay of paid or destructive effects.
6. Run authorization/integrity/application checks and publish actual RPO/RTO and service limitations. Reopen incrementally under incident control.
7. Keep returning old primary quarantined. Reconcile divergent data as evidence, then reseed it from the current authority through an approved process. Failback is another planned single-writer transition, never automatic bidirectional merge.

External coordination must not depend only on either database or the SDN host. Select a proven coordination design with independent failure assumptions; no witness service, protocol or endpoint is claimed implemented. First activation should use human-controlled failover until fencing and partitions are independently verified.

## Whole-service continuity and cost

Database failover cannot repair an unavailable provider-specific Auth, API, Storage or Edge runtime. Either make those services independently portable/redundant, or explicitly label the result database recovery with limited application continuity. The Console's Supabase Data API dependency is a concrete test case. IdP user IDs, login/revocation behavior, secret availability, object access and application hosting must all survive the selected failure scenario before promising service failover.

Future monthly cost includes both database instances and retained storage, replication egress, retained WAL/history, standby warm-up/read tests, independent backups, coordination, monitoring and drills. Do not promise two production providers under the initial $50 or assume a free tier is production standby. Quote the actual provider pair after workload and availability requirements are accepted. The initial budget is not silently broadened, and the long-term target is not discarded to meet it.

Acceptance for the eventual two-provider stage: authorized provider pair and region/cloud separation; complete replication/DDL/service inventory; measured sustained lag and outage behavior; verified fencing under asymmetric network partitions; clean standby promotion and failback/reseed drill; external-effect reconciliation; current independent backups; total-cost forecast; named operators and specific C4 activation approval. None of these deployment proofs has been completed in PDP-001.

Sources retrieved 2026-10-17:

- P1: https://www.postgresql.org/docs/17/logical-replication-restrictions.html
- P2: https://www.postgresql.org/docs/17/logical-replication-subscription.html
