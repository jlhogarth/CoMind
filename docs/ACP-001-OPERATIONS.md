# ACP-001: Durable Checkpoint Operations and Recovery

## Evidence state

ACP-001 is repository implementation with isolated PostgreSQL verification when its dedicated workflow passes on the exact pull-request head. It is not a live Supabase deployment, an operating production control, or evidence of certification conformity.

The default remains `ACP_CHECKPOINTS_ENABLED=false`. No live database migration, production enablement, paid provider call, or external authorization is performed by ACP-001.

## Purpose

ACP-001 preserves compact, bounded, verified institutional state so a successor execution can recover governed context without replaying an entire conversation. The checkpoint is a machine-restorable continuity envelope, not a transcript copy and not a source of new authority.

The envelope records:

- conversation and workflow identity
- execution identity and execution cursor
- parent checkpoint lineage
- authority subject, policy version, and capability identifiers
- bounded objective, decisions, and references
- provenance source and evidence references
- outstanding operation identifiers and idempotency keys
- optional canonical Foundry task and fencing-epoch references
- optional canonical Foundry adapter-operation reference
- creation and expiration timestamps
- deterministic state and envelope SHA-256 digests

The serialized checkpoint is limited to 64 KiB. Raw credentials and common credential forms are rejected before persistence and again during restoration.

## Relationship to Foundry

ACP does not create a second work dispatcher or a second operation-outcome authority.

The canonical Foundry work ownership substrate remains `comind.cm_foundry_work_lease` from migration `20261009_009_foundry_work_lease_kernel.sql`. Recovery reads its fencing epoch and state when an ACP checkpoint references a task. ACP never stores the lease token.

The canonical external-operation records remain `comind.cm_foundry_adapter_operation` and `comind.cm_foundry_adapter_operation_result`. ACP reads those records to determine whether a recorded operation has a durable terminal result. Recovery does not invoke or replay the operation.

`comind.cm_foundry_recovery_checkpoint` has a different purpose. It is an append-only governance and provenance summary record. `comind.cm_continuity_checkpoint` is the bounded machine-restorable ACP state envelope. Neither is represented as replacing the other.

## Runtime behavior

After a successful `201` from `POST /api/conversations/:id/assistant-response`, the Fastify response hook may enqueue a continuity checkpoint when ACP is enabled. The response is not blocked on the PostgreSQL checkpoint write.

The scheduler is bounded. It coalesces repeated queued states for the same conversation, performs persistence asynchronously, reports queue saturation or write failure, and drains accepted work during application shutdown. A failed checkpoint write is never treated as durable.

Persistence resolves the previous checkpoint as lineage, then inserts the immutable successor. Repeating the same conversation and execution identity with the same state is idempotent. Reusing that execution identity with materially different state fails closed.

## Recovery confidence gate

Recovery begins with an independently supplied current authority envelope. The checkpoint never grants authority by itself.

Possible results are:

- `ABSENT`: no checkpoint exists for the conversation.
- `BLOCKED`: integrity, identity, freshness, schema, secret screening, or authority validation failed.
- `DEGRADED`: the state is readable, but a dependency or recorded operation still requires authoritative reconciliation.
- `READY`: the state is valid under current authority and every recorded side-effect obligation has either been absent or independently reconciled against canonical outcome evidence.

For every recorded operation, ACP performs read-only reconciliation against the canonical Foundry tables before recovery can become `READY`. A checkpoint-local `completed` status is observational and is not accepted as canonical outcome evidence by itself. A terminal adapter result may mark that operation completed only in the recovered in-memory state. A newer work-lease fencing epoch, active lease, exhausted lease, missing lease, missing terminal result, unavailable substrate, or reconciliation query failure remains `DEGRADED`.

ACP recovery never claims a lease, renews a lease, finishes work, retries an adapter operation, or performs another external side effect.

## Successor restoration

A validated recovered state can be transformed deterministically into a successor state by supplying:

- the verified parent checkpoint identifier
- a new execution identifier
- a new execution cursor

The successor preserves authority, provenance, context, and unresolved obligations. This transformation does not persist the successor, grant authority, or execute work.

## Expiration and retention

Version 1 checkpoints carry their own expiration timestamp. The current default logical lifetime is 24 hours and creation rejects a lifetime beyond 30 days.

Logical expiration and physical retention are deliberately separate. ACP-001 does not delete immutable checkpoints. A future physical-retention policy requires a separately governed migration because evidence deletion is consequential and can affect recovery and audit history.

## Isolated verification

Run only against a disposable local PostgreSQL database named `comind_ci`:

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/comind_ci \
  bash scripts/test_acp_continuity.sh
```

The script refuses nonlocal or differently named databases. It builds the current Foundry substrate, applies runtime orchestration and the canonical work-lease kernel, loads conversation fixtures, applies the ACP migration twice, builds the server, and runs deterministic unit and integration tests.

The integration suite includes:

- deterministic checkpoint roundtrip, tamper, expiration, authority, credential, size, and successor tests
- PostgreSQL persistence, immutability, lineage, and idempotency tests
- actual Fastify assistant-response lifecycle checkpointing against isolated PostgreSQL with a fixture provider
- read-only recovery reconciliation against the canonical Foundry work-lease and adapter-outcome substrate
- explicit proof that checkpoint-local completed status cannot replace canonical outcome evidence
- PostgreSQL-backed write latency, scheduler enqueue latency, payload size, and query-count measurements

The workflow publishes `artifacts/acp-continuity-baseline.json` as exact-run performance evidence. These measurements are CI and isolated-development evidence only. They are not production latency claims.

## Failure handling

- Missing ACP migration: keep the feature flag disabled.
- Queue saturation: treat the rejected checkpoint request as not durable and investigate load or capacity.
- Persistence failure: treat the checkpoint as not durable and inspect database health and schema state.
- Invalid or expired checkpoint: `BLOCKED`; do not bypass validation.
- Unavailable reconciliation substrate: `DEGRADED`; do not replay work.
- Newer fencing epoch: `DEGRADED`; the saved worker ownership is stale.
- Unknown adapter outcome: `DEGRADED`; reconcile against the authoritative system before any separately authorized retry.
- Reduced or changed authority: `BLOCKED` until current authority is independently established.

## Rollback

Disable `ACP_CHECKPOINTS_ENABLED` and restart the application to stop new runtime checkpoint scheduling. Do not delete immutable checkpoints as an application rollback mechanism.

Schema removal, evidence deletion, live deployment, and production enablement require separate review and authorization.

## Remaining production gates

ACP-001 does not establish production readiness. Before production use, CoMind still needs authorized live migration, deployed privilege and RLS verification, retention governance, operating audit integration, production performance evidence, operational alerting, recovery exercises, and an approved production authority model.
