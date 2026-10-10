# ACP-001 reconciliation provenance

Date: 2026-10-10
Issue: https://github.com/jlhogarth/CoMind/issues/83
Pull request: https://github.com/jlhogarth/CoMind/pull/84

## Reconciliation inputs

Authoritative main inspected at reconciliation start:

`074780cf13b48eccfbcd3e4af1b7a84711fad4c5`

Pre-reconciliation ACP head:

`daafeec31a4cbc33a52f46e82dc7ef3f1f62fc07`

The ACP branch was 22 commits ahead and 70 commits behind that main state. Its successful ACP workflow had run against the earlier merge base `1e47dd1c61e9f6f91bc50ba8bad8a19bee8fab4f`, so those checks were historical evidence only and were not accepted as current-main verification.

During reconciliation, main advanced again through GOV-003 to:

`8d6bead77ab5064f070b6eb7b2a7abed60ac93c9`

The ACP branch was then reconciled onto that exact main state before the final acceptance checks. This record therefore preserves both the initial reconciliation input and the later authoritative-main advancement rather than silently replacing history.

## Material findings

Useful ACP work existed and was preserved: deterministic serialization, SHA-256 integrity, bounded state, secret screening, authority revalidation, expiration, immutable persistence, asynchronous scheduling, recovery classification, isolated PostgreSQL testing, and an operating runbook.

The original lane did not yet satisfy all Issue #83 acceptance criteria. In particular, it lacked explicit successor restoration, canonical lease and outcome reconciliation, a true Fastify plus PostgreSQL checkpoint lifecycle test, and PostgreSQL-backed checkpoint performance evidence.

Main had also gained Foundry capabilities after ACP branched:

- `comind.cm_foundry_work_lease` with bounded claims, ownership tokens, fencing epochs, renewal, completion, release, exhaustion, and append-only transition evidence
- `comind.cm_foundry_adapter_operation` and `comind.cm_foundry_adapter_operation_result` for durable operation identity and terminal outcome evidence
- `comind.cm_foundry_recovery_checkpoint` for governance and provenance summaries
- runtime performance baseline work
- GOV-001, GOV-002, and subsequently GOV-003 governance evidence discipline

A later fail-closed review found one additional trust boundary: a checkpoint-local operation status of `completed` could not be accepted as canonical outcome evidence solely because the checkpoint was integrity-valid. ACP recovery was tightened so every recorded side-effect obligation requires read-only reconciliation against canonical Foundry outcome data before recovery can become `READY`.

## Reconciliation decision

PR #84 remains the single ACP-001 implementation lane. The useful checkpoint work is continued rather than discarded or superseded.

The old unsequenced public-schema ACP migration is not carried into the reconciled tree. The reconciled migration is `20261010_010_acp_continuity_checkpoints.sql` under the `comind` schema so migration ordering and namespace are explicit against current main.

ACP does not duplicate Foundry work ownership or operation outcomes. Recovery reads the canonical Foundry lease fencing epoch and durable adapter result when those references are present. Lease ownership tokens are never stored in the ACP checkpoint.

Checkpoint-local operation status is observational only. It cannot independently authorize replay or establish a durable terminal outcome. Canonical Foundry records remain authoritative for side-effect reconciliation.

Foundry provenance summary checkpoints and ACP machine-restorable checkpoints remain separate artifacts with separate purposes.

The ACP isolated workflow uses the same PostgreSQL 17 plus pgvector service image as the canonical Foundry work-lease verification path so the ACP gate tests against the current Foundry database prerequisites rather than a reduced database environment.

## Independent review finding and repair: restart-safe execution identity

A fresh acceptance review after reconciliation identified a restart-safety defect in the runtime checkpoint identity. The assistant-response lifecycle used Fastify `request.id` as the durable ACP `executionId`. Fastify request identifiers are runtime-local and can repeat after an application restart, so the same conversation could reuse a previously persisted `(conversation_id, execution_id)` pair and fail closed instead of writing a new checkpoint.

The existing ACP branch was repaired in place rather than creating a competing lane. Runtime checkpoint execution identifiers are now generated with `randomUUID()`. The isolated Fastify plus PostgreSQL integration test now closes the application, rebuilds it, repeats the assistant-response lifecycle for the same conversation, and requires two distinct execution identifiers with valid parent checkpoint lineage.

The first implementation commit for this repair was `4ce0bf8f079036696b558d6725d070395dd31382`. The restart-boundary integration test commit was `98a0c57328416fc4972e239ffeaf3ccb2f64abfe`.

Because these commits changed the PR head, all earlier exact-head CI evidence became historical. Fresh exact-head verification is required before merge eligibility can be reconsidered.

## Independent review finding and repair: deterministic latest-state ordering

The same acceptance review found that repository restoration and recovery selected the latest checkpoint by checkpoint-local `created_at`, then by random UUID. Two valid checkpoints can share the same checkpoint timestamp. In that case a UUID tie-breaker does not encode persistence order, so latest-state restoration could select an older checkpoint nondeterministically.

The ACP persistence table now includes a database-assigned monotonic `persistence_seq` identity column. Parent resolution, latest checkpoint restoration, and recovery coordination select by `persistence_seq DESC` rather than by client timestamp or UUID ordering. The recent-checkpoint index was aligned with that persistence order.

The isolated PostgreSQL repository integration test now persists a successor checkpoint with the exact same `createdAt` timestamp as its parent and requires restoration to return the successor. It also verifies that the successor has a strictly greater persistence sequence.

This repair changes repository implementation and verification evidence only. It does not imply live migration, production deployment, operating control effectiveness, or certification conformity.

## Verification boundary

No live Supabase mutation, paid provider execution, credential exposure, production rollout, or external authorization is part of this reconciliation.

Repository implementation is not deployment. Dedicated exact-head CI and isolated PostgreSQL verification must pass after the final reconciliation commit before ACP-001 can be considered accepted for merge review.

Production operation, production control effectiveness, compliance, certification readiness, and certified conformity are not asserted by this record.
