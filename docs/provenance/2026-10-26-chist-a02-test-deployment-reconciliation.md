# CHIST-A02 Supabase Test Deployment Reconciliation

**Status:** Forward reconciliation in progress  
**Date:** 2026-10-26  
**Lane:** CHIST-A02  
**Issue:** #235  
**PR:** #240  
**Environment:** Supabase Test only  
**Production impact:** None

## In this document

- [Event](#event)
- [Detected difference](#detected-difference)
- [Impact](#impact)
- [Root cause](#root-cause)
- [Control response](#control-response)
- [Forward repair](#forward-repair)
- [Verification requirements](#verification-requirements)
- [Lessons](#lessons)
- [Related evidence](#related-evidence)

## Event

After exact-head CHIST-A02 isolated acceptance and broad repository CI passed on candidate `74e4af83b86c886c278efdf0c2642a4e2e3b0e93`, migration 011 was applied to Supabase Test.

Supabase recorded the execution as:

- migration version: `20261027000659`
- migration name: `chist_a02_sessionization_temporal_rollups`

Immediately after the successful Test application, the execution payload was recognized as not byte-identical to the reviewed repository file `db/migrations/20261026_011_conversation_history_sessionization.sql`.

Acceptance was stopped before A02 was declared complete or merged.

## Detected difference

The Test execution rendering was semantically equivalent to the reviewed migration but was manually compacted and contained two explicit SQL normalizations not present in the original reviewed 011 text:

1. Event identity generation used `coalesce(p.normalized_message_hash::text,'')` instead of the original implicit coercion form.
2. `cm_archive_local_hour_distribution` used positional `ORDER BY 2` instead of ordering by the returned `local_hour` name.

Supabase migration history preserved the complete executed statement, and `pg_get_functiondef` independently confirmed the resulting live function definitions.

## Impact

No Conversation History personal analytics or session evidence was affected.

At the time of the deployment:

- certified native Conversation History baselines: 0
- A01 personal metric facts: 0
- A02 sessionization runs before migration: 0
- production changes: 0

Migration 011 created schema, policies, indexes, functions, RLS, and grants in Test. No real A02 derivation was eligible to run because the certified-baseline gate had no eligible import.

The two detected SQL differences do not change intended A02 session policy semantics. The defect is provenance alignment: the reviewed repository migration and the exact Test execution source were not identical.

## Root cause

The migration was copied into the Supabase Test migration action through a manually rendered execution payload rather than passed through an exact source-preserving deployment path.

That allowed formatting changes and two benign source-level normalizations to enter the deployed migration despite the repository version being the reviewed canonical artifact.

## Control response

The lane followed the repository/database alignment rule:

- stop acceptance immediately;
- preserve the original Supabase migration-history record;
- do not delete, rewrite, or fabricate migration history;
- do not roll back a non-destructive Test migration merely to make history look cleaner;
- treat GitHub migration source as canonical review provenance;
- reconcile forward through a new reviewed migration;
- rerun exact-head acceptance after the repair;
- apply the repair to Test only after exact-head acceptance passes.

## Forward repair

`db/migrations/20261026_012_conversation_history_sessionization_deployment_reconciliation.sql` establishes the reviewed canonical function end state.

Migration 012 intentionally adopts the two forms already present in Test:

- explicit `normalized_message_hash::text` in deterministic event identity construction;
- positional `ORDER BY 2` in the local-hour projection.

This makes the deployed behavior an intentional reviewed state without altering migration 011 history.

The repair also reasserts function execution privileges and fixed search paths.

## Verification requirements

Before A02 may be accepted:

1. isolated PostgreSQL 17 must apply accepted CHIST and A01 prerequisites, migration 011, and migration 012;
2. the complete A02 functional/security corpus must still pass;
3. `pg_get_functiondef` must contain the explicit `normalized_message_hash::text` form;
4. `pg_get_functiondef` for the local-hour projection must contain `ORDER BY 2`;
5. function search paths and execution privileges must remain constrained;
6. exact-head dedicated A02 GitHub Actions must pass;
7. broad repository CI on the same exact head must pass;
8. only then may migration 012 be applied to Supabase Test;
9. Test readback must show zero A02 derived rows while no certified baseline exists;
10. Test security and performance advisors must show no new A02-specific unresolved finding.

## Lessons

Migration correctness includes provenance correctness.

A semantically equivalent manual execution rendering is still drift when it does not exactly correspond to the reviewed canonical migration source.

Future database deployment work should prefer an exact source-preserving path from the reviewed migration artifact to the deployment action. If a tool requires a query string, the deployed string should be derived directly from the repository file without manual reformatting or cleanup.

Migration-history inspection and live `pg_get_functiondef` readback are useful independent controls for detecting source-to-runtime drift.

## Related evidence

- GitHub Issue #235
- GitHub PR #240
- candidate before reconciliation: `74e4af83b86c886c278efdf0c2642a4e2e3b0e93`
- Supabase Test migration version `20261027000659`
- `db/migrations/20261026_011_conversation_history_sessionization.sql`
- `db/migrations/20261026_012_conversation_history_sessionization_deployment_reconciliation.sql`
- `scripts/test_chist_a02_sessionization.sh`
- `scripts/test_chist_a02_deployment_reconciliation.sh`
