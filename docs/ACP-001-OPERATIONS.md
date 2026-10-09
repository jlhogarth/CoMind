# ACP-001: Durable Checkpoint Operations and Recovery

## Scope and current guarantees

ACP-001 provides immutable PostgreSQL checkpoint persistence, deterministic integrity checks, authority revalidation, an opt-in asynchronous scheduler, and read-only recovery classification. It does **not** provide autonomous task resumption, cross-provider conversation creation, external side-effect reconciliation, or a production-ready delegation mechanism. The observational runtime checkpoint contains only conversation identifiers and bounded references; it is not a complete conversation snapshot.

## Deployment and feature flag

The default is `ACP_CHECKPOINTS_ENABLED=false`. Keep it disabled until the migration is applied by an explicitly authorized operator and the environment has passed isolated and staging tests. No live database migration is authorized by this document.

For local isolated verification, set `DATABASE_URL` to PostgreSQL on localhost with database name `comind_ci` and run `bash scripts/test_acp_continuity.sh`. The script refuses remote hosts or any other database name. It applies the migration twice and runs the deterministic unit, integration and benchmark tests.

## Runtime behavior

After a successful 201 response from `POST /api/conversations/:id/assistant-response`, the Fastify response hook queues an observational checkpoint if the flag is enabled. Queueing is bounded (32 distinct conversations by default); a full queue emits a warning and does not block the response. Same-conversation queued state is coalesced. Database writes run asynchronously. Shutdown drains queued work before closing the pool. Failed writes emit a warning; they are not silently treated as durable. There is no retry mechanism in ACP-001.

## Recovery procedure

1. Verify the operator identity, conversation identifier, policy version, capabilities, and current time from independent trusted sources.
2. Fetch the latest checkpoint for that conversation. Check the digest, schema version, freshness, identity and current authority.
3. Classify with `coordinateRecovery`: ABSENT means no checkpoint; BLOCKED means integrity/identity/authority invalid; DEGRADED means dependencies unavailable or unresolved operations; READY means state can be read under the verified authority.
4. **Do not** automatically execute any pending, uncertain, or previously completed operation. Reconcile side effects with the authoritative external system and its idempotency records before any separately authorized retry.
5. Record the checkpoint ID, recovery decision, reason codes, actor and time in the governed audit system when that integration exists. ACP-001 does not yet write those audit events.

## Failure handling

- Missing migration: leave the feature flag off and apply only through an authorized deployment.
- Queue saturation: inspect `checkpoint_queue_full` warnings and reduce load; no claim of persistence is made.
- Persistence failure: inspect `checkpoint_write_failed`; verify database health and schema before enabling again.
- Invalid or stale checkpoint: BLOCKED, investigate source and authority, never bypass verification.
- Unknown external outcome: DEGRADED, reconcile independently; do not replay automatically.
- Expired policy or capability: BLOCKED until independent authorization is re-established.

## Verification and performance evidence

The isolated CI job `ACP-001 Isolated PostgreSQL` is the authoritative free deterministic migration/integration gate. The benchmark test emits measured enqueue and drain times for 1,000 in-memory mock-query operations; it explicitly excludes network and PostgreSQL latency. Do not interpret that figure as end-to-end production response overhead. Record GitHub workflow URLs and commit SHA before merging.

## Rollback

Disable `ACP_CHECKPOINTS_ENABLED` and restart the application. Do not delete immutable checkpoints to roll back application behavior. A schema rollback requires separate review and authorization because it can destroy recovery evidence.

## Outstanding before production

Validate a true runtime HTTP integration test with a migrated isolated database; test concurrent shutdown and queue saturation; establish PostgreSQL-backed p50/p95/p99 scheduling latency; integrate audit events, lineage and authoritative operation reconciliation; define retention and privilege-separated checkpoint readers. Require explicit authorization for live migration and enablement.
