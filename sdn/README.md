# SDN-001 Isolated Lifecycle Proof

SDN-001 is the first runnable Sovereign Data Node slice. It is intentionally isolated and synthetic. It does not connect to live Supabase, does not use production CoMind data, does not publish PostgreSQL to the host, and does not create a production remote punch-out.

## Proven path

Authenticated local ingestion -> PostgreSQL 17 persistence -> server-side lifecycle classification -> immutable policy version assignment -> deterministic summary/compaction -> provenance/source manifest preservation -> expiration eligibility -> separately scoped guarded physical deletion -> deletion receipt/tombstone -> independent backup/restore verification.

## Topology

- `db`: `pgvector/pgvector:0.8.6-pg17-bookworm`, no published port.
- `restore-db`: independent disposable restore target, no published port.
- `ingest`: Node.js 24 Fastify service. The only host publication is loopback `127.0.0.1:3100` by default.
- `lifecycle`: deterministic policy worker using the `sdn_lifecycle_role` capability.
- `purge`: test-only destructive client using only the `sdn_purge_role` capability. It has no raw `DELETE` grant and can invoke only the guarded `sdn_lifecycle.purge_eligible_event(uuid)` database function.

The Compose network is marked internal. Database credentials and the synthetic bearer token are generated at acceptance runtime and are never committed or preserved in CI artifacts.

## Lifecycle classes and synthetic policy

- A: authoritative evidence. `delete_allowed=false`.
- D: summary after 30 seconds, compaction after 60 seconds, raw expiration after 120 seconds only after verified derivative and compaction evidence.
- E: current-state derivative after 30 seconds, raw expiration after 60 seconds only after verified derivative evidence.
- C is registered without a retention rule only to prove missing-policy fail-closed behavior. The ingestion service rejects it before raw persistence.

These timings are test fixtures only.

## Event integrity

The server computes SHA-256 over deterministic key-sorted JSON (`json-key-sort-v1`). Event uniqueness is `(producer_id, event_id)`.

- Exact redelivery returns the original immutable receipt.
- Same identity plus changed payload creates append-only integrity-conflict evidence and returns HTTP 409.
- Producer lifecycle hints are recorded but never authoritative. Classification comes from the server-side event-type registry.

## Lifecycle evidence

The acceptance path preserves:

- immutable ingestion receipts;
- integrity conflicts;
- provenance edges;
- immutable policy versions and rules;
- deterministic summaries and source links;
- compaction manifests with source count and source-set hash;
- append-only lifecycle evaluations and transition ledger;
- deletion receipts and tombstones after guarded expiration;
- observable interrupted worker state and duplicate-job idempotency.

## Running the isolated acceptance proof

Requirements: Docker with Compose v2, Node.js 24, Bash, curl, and OpenSSL.

From the repository root:

```bash
bash sdn/scripts/acceptance.sh
```

The script generates ephemeral credentials, tears down any prior disposable SDN-001 Compose state, runs migrations twice, executes the full synthetic proof, creates a PostgreSQL custom-format backup, restores it into `restore-db`, compares source and restored integrity snapshots, performs guarded synthetic expiration, writes evidence under `sdn/evidence/`, then destroys the disposable Compose volumes on exit.

`sdn/evidence/` is ignored by Git and uploaded by the dedicated GitHub Actions workflow when available.

## Boundaries

SDN-001 is not a production deployment and does not claim production readiness. Live Supabase synchronization, remote ingress, customer data, self-hosted Supabase, object-store services, LLM summarization, Kubernetes, HA, read replicas, multi-node workers, production automatic destructive retention, regulated retention schedules, enterprise IAM federation, and final production RPO/RTO guarantees remain deferred.
