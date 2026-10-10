# ACP-001 reconciliation provenance

Date: 2026-10-10
Issue: https://github.com/jlhogarth/CoMind/issues/83
Pull request: https://github.com/jlhogarth/CoMind/pull/84

## Reconciliation inputs

Authoritative main inspected at reconciliation start:

`074780cf13b48eccfbcd3e4af1b7a84711fad4c5`

Pre-reconciliation ACP head:

`daafeec31a4cbc33a52f46e82dc7ef3f1f62fc07`

The ACP branch was 22 commits ahead and 70 commits behind current main. Its successful ACP workflow had run against the earlier merge base `1e47dd1c61e9f6f91bc50ba8bad8a19bee8fab4f`, so those checks were historical evidence only and were not accepted as current-main verification.

## Material findings

Useful ACP work existed and was preserved: deterministic serialization, SHA-256 integrity, bounded state, secret screening, authority revalidation, expiration, immutable persistence, asynchronous scheduling, recovery classification, isolated PostgreSQL testing, and an operating runbook.

The original lane did not yet satisfy all Issue #83 acceptance criteria. In particular, it lacked explicit successor restoration, canonical lease and outcome reconciliation, a true Fastify plus PostgreSQL checkpoint lifecycle test, and PostgreSQL-backed checkpoint performance evidence.

Main had also gained Foundry capabilities after ACP branched:

- `comind.cm_foundry_work_lease` with bounded claims, ownership tokens, fencing epochs, renewal, completion, release, exhaustion, and append-only transition evidence
- `comind.cm_foundry_adapter_operation` and `comind.cm_foundry_adapter_operation_result` for durable operation identity and terminal outcome evidence
- `comind.cm_foundry_recovery_checkpoint` for governance and provenance summaries
- runtime performance baseline work
- GOV-001 and GOV-002 governance evidence discipline

## Reconciliation decision

PR #84 remains the single ACP-001 implementation lane. The useful checkpoint work is continued rather than discarded or superseded.

The old unsequenced public-schema ACP migration is not carried into the reconciled tree. The reconciled migration is `20261010_010_acp_continuity_checkpoints.sql` under the `comind` schema so migration ordering and namespace are explicit against current main.

ACP does not duplicate Foundry work ownership or operation outcomes. Recovery reads the canonical Foundry lease fencing epoch and durable adapter result when those references are present. Lease ownership tokens are never stored in the ACP checkpoint.

Foundry provenance summary checkpoints and ACP machine-restorable checkpoints remain separate artifacts with separate purposes.

## Verification boundary

No live Supabase mutation, paid provider execution, credential exposure, production rollout, or external authorization is part of this reconciliation.

Repository implementation is not deployment. Dedicated exact-head CI and isolated PostgreSQL verification must pass after the reconciliation commit before ACP-001 can be considered accepted for merge review.

Production operation, production control effectiveness, compliance, certification readiness, and certified conformity are not asserted by this record.
