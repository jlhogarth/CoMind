# SEC-RLS-001 Current-Schema RLS Hardening Evidence

Date: 2026-10-30
Issue: #392
Branch: `sec-rls-001-current-schema-hardening`
Initial base: `c3cc95cae33a2476027ce90639d4f473781f787b`
Connected Test project: `sbgfuanxiqepcoboxzcl`
Production activation: false
Live Supabase DDL performed by this lane: false

## Trigger

During CE-004 post-merge inspection, Supabase security advisories reported Row Level Security disabled on 87 `comind` tables and `comind_pm.pm_research_sessions`, for 88 custom-schema base tables total.

The discovery was preserved as CE missingness signal:

`3aa5bce8-4c21-4ce0-a48b-2f79ac6bead0`

The advisor recommendation was not executed automatically because enabling RLS without understanding existing non-bypass identities and policies can break legitimate access.

## Effective-exposure investigation

Read-only live catalog inspection separated advisor classification from actual effective privileges.

Verified:

- `anon` has no `USAGE` on `comind` or `comind_pm`;
- `authenticated` has no `USAGE` on `comind` or `comind_pm`;
- `anon` has effective DML privileges on zero of the 88 RLS-disabled tables;
- `authenticated` has effective DML privileges on zero of the 88 RLS-disabled tables;
- PUBLIC has effective DML privileges on zero of the 88 RLS-disabled tables;
- `service_role` has `BYPASSRLS`;
- `postgres` has `BYPASSRLS`.

Conclusion: the current evidence establishes a material hardening gap, but it does not establish active anonymous or authenticated exposure of the private custom schemas.

## Non-bypass compatibility inventory

Only two inspected non-bypass CoMind roles had direct privileges on currently-unprotected tables.

### `comind_conversation_deriver`

- SELECT `cm_assistant_generation`;
- SELECT `cm_conversation_capture_event`;
- SELECT `cm_conversation_recovery_checkpoint`;
- SELECT, INSERT, UPDATE `cm_message_analytics`;
- SELECT, INSERT, UPDATE `cm_conversation_analytics`.

### `comind_conversation_reconciler`

- SELECT `cm_assistant_generation`;
- SELECT `cm_conversation_capture_event`;
- SELECT `cm_conversation_recovery_checkpoint`.

No other inspected non-bypass CoMind role had direct SELECT, INSERT, UPDATE, or DELETE privilege on the 88 RLS-disabled tables.

The five affected tables had no RLS policies at the time of inspection because RLS was not enabled there.

## LF-3 lineage review

Existing Issue #133 / merged PR #134 already established Live Foundry LF-3 security readiness for historical migration:

`db/migrations/20261008_007_foundry_security_prerequisites.sql`

PR #134 merged as:

`816966ecf7cb778f5a1942a536136862618845c3`

LF-3 explicitly did not deploy migration 007 live. Its readiness work left live activation behind a separate approval and compatibility gate.

Migration 007 remains useful lineage because it dynamically enables RLS and revokes ordinary-role table access. It is no longer safe to apply unchanged.

Current policy inventory on the connected Test database:

- custom-schema RLS policies: 218;
- policies whose USING or WITH CHECK expression is literal `true`: 170.

Migration 007 deletes every `comind` policy with a literal-true USING or WITH CHECK expression. Later governed capabilities deliberately use role-scoped literal-true policies. Predicate shape alone is therefore no longer evidence that a policy is a permissive scaffold.

Migration 007 also does not cover `comind_pm.pm_research_sessions`.

Decision: preserve migration 007 as historical lineage and implement a current-state successor rather than modifying or replaying the historical migration.

## Shared live-mutation authority

Open Issue #126 preserves the rule that shared Supabase schema mutation is serialized. Open PR #119 remains the historical live Supabase schema-mutation lane.

Joseph authorized continued development under the CoMind Application Development Contract. This lane interprets that as authority for repository work, isolated verification, read-only Supabase inspection, and durable evidence, but not as a silent invalidation of the already-recorded PR #119 resource lease.

Therefore SEC-RLS-001 performs no live Supabase DDL while PR #119 retains that lease.

## Lane registration

GitHub Issue:

`#392 SEC-RLS-001: current-schema RLS hardening and policy preservation`

Canonical task:

`fb44f8d0-a133-4328-81b8-2452425ebbb7`

RunBook work item:

`417b0cc5-17a9-405c-8249-1d43927a0616`

Continuity Capsule v1:

`6d654f47-b79f-4385-8dd9-0b909c204d7d`

Capsule state at registration:

`ready / verified`

## Migration namespace

At lane creation:

- current `main` owned migration slot `_025` through CE-004;
- open RLIB-003 PR #389 claimed `_026`;
- no open PR was found claiming `_027`.

SEC-RLS-001 uses:

`20261030_027_sec_rls_001_current_schema_hardening`

Freshness must be rechecked before acceptance because parallel development can claim the same number later.

## Test-first sequence

Acceptance artifacts were committed before the hardening migration:

1. `db/migrations/verify_20261030_027_sec_rls_001_current_schema_hardening.sql`;
2. `scripts/test_sec_rls_001_current_schema_hardening.sh`;
3. `scripts/check_custom_schema_rls_migrations.py`.

The implementation migration followed:

4. `db/migrations/20261030_027_sec_rls_001_current_schema_hardening.sql`.

Then the read-only preflight, exact-head workflow, architecture, and provenance were added.

## Successor migration design

The successor migration:

- dynamically enables RLS on every ordinary or partitioned table in `comind` and `comind_pm`;
- revokes custom-schema USAGE from `anon` and `authenticated`;
- revokes current-table privileges from PUBLIC, `anon`, and `authenticated`;
- preserves every existing policy not explicitly owned by SEC-RLS-001;
- creates a scoped SELECT policy on the three conversation source tables for the derivation and reconciliation roles;
- creates scoped SELECT, INSERT, and UPDATE policies on the two analytics tables for the derivation role;
- creates no DELETE policy;
- preserves `service_role`/`postgres` BYPASSRLS behavior;
- is designed for repeat application.

## Policy-preservation regression

The isolated fixture creates a pre-existing policy:

`sec_rls_001_existing_true_policy`

It is intentionally role-scoped and uses `USING (true)`. The migration is applied twice, and the verifier requires that policy to remain intact.

This proves SEC-RLS-001 does not repeat migration 007's current-unsafe heuristic.

## Future migration guard

`scripts/check_custom_schema_rls_migrations.py` scans changed SQL migrations. When a migration creates a `comind` or `comind_pm` table, including unqualified creation under a custom-schema `search_path`, the same migration must enable RLS for that table.

The guard includes deterministic self-tests and is wired into the dedicated workflow.

This establishes a forward invariant so RLS hardening is not merely a one-time sweep.

## Verifier precision repair

Before CI, self-review found that one reconciler negative check used a combined `has_table_privilege(..., 'SELECT,INSERT,UPDATE,DELETE')` predicate. PostgreSQL interprets that as requiring the complete privilege set, so a hypothetical partial unintended grant could escape the test.

The verifier was tightened before PR acceptance to test each forbidden reconciler analytics privilege independently, for both analytics tables.

The implementation migration was not changed by this verifier repair.

## Current boundaries

- no live Supabase migration applied;
- no Production activation;
- no paid-provider call;
- no credential changes;
- no provider/resource activation;
- no modification of PR #119's live mutation authority;
- no claim that the Supabase advisor finding proves anonymous exposure;
- no deletion of existing role-scoped policies based solely on predicate shape.

## Remaining acceptance

Before review readiness:

1. execute the committed preflight read-only against the connected Test project;
2. recheck current `main`, open lanes, and migration namespace;
3. open one draft PR for Issue #392;
4. require exact-head SEC-RLS-001 workflow success;
5. require broad repository regressions relevant to schema, runtime, Foundry, conversation, RunBook, Continuous Excellence, and implementation integrity;
6. preserve and repair any failures forward;
7. refresh the live read-only preflight before final acceptance;
8. keep live DDL blocked while PR #119 retains the shared mutation lease.
