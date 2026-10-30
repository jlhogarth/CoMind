# SEC-RLS-001 Current-Schema RLS Hardening

Status: implementation candidate
Issue: #392
Environment: repository and isolated PostgreSQL only
Production activation: excluded
Live Supabase DDL: excluded while PR #119 retains the shared mutation lease

## Purpose

SEC-RLS-001 establishes a current-state Row Level Security invariant for CoMind's private `comind` and `comind_pm` schemas without replaying stale historical security semantics.

The capability is a successor to LF-3 security readiness, Issue #133 / PR #134. LF-3 correctly identified the need for broad RLS hardening, but its reviewed migration `20261008_007_foundry_security_prerequisites.sql` was designed against the October 17 schema and policy surface. The current schema has evolved materially.

## Current security classification

The connected CoMind Supabase Test project reported 88 ordinary custom-schema tables with RLS disabled: 87 in `comind` and `comind_pm.pm_research_sessions`.

That advisor finding is a material hardening gap, but the effective privilege evidence does not establish an active anonymous-data exposure:

- `anon` has no `USAGE` on `comind` or `comind_pm`;
- `authenticated` has no `USAGE` on `comind` or `comind_pm`;
- both roles have zero effective SELECT, INSERT, UPDATE, or DELETE privileges on all 88 RLS-disabled tables;
- PUBLIC has zero effective DML privilege on those 88 tables;
- `service_role` and `postgres` are BYPASSRLS roles.

Therefore SEC-RLS-001 treats the finding as defense-in-depth and future-proofing work, not as proof that private CoMind data is currently reachable by ordinary Supabase clients.

## Why migration 007 is lineage, not current executable truth

Migration 007 dynamically enables RLS on every then-current `comind` table and revokes PUBLIC, `anon`, and `authenticated` table privileges. Those principles remain useful.

However, it also deletes every `comind` policy whose `USING` or `WITH CHECK` expression is literal `true`.

The current Test substrate contains 218 RLS policies across `comind` and `comind_pm`; 170 use a literal `true` predicate. Later governed capabilities intentionally use role-scoped `USING (true)` and `WITH CHECK (true)` policies where the role itself is the authorization boundary. Predicate shape alone is therefore no longer a valid test for policy legitimacy.

Migration 007 also does not address `comind_pm`, including the currently unprotected `pm_research_sessions` table.

SEC-RLS-001 does not modify or erase migration 007. It preserves the old migration as historical lineage and introduces a current-state successor.

## Hardening invariant

After SEC-RLS-001, every ordinary or partitioned table in `comind` and `comind_pm` must have RLS enabled.

The migration also preserves the existing private-schema boundary:

- PUBLIC receives no custom-schema table privilege through this migration;
- `anon` and `authenticated` have custom-schema `USAGE` revoked;
- `anon` and `authenticated` have all current-table privileges revoked;
- existing policies are preserved unless they are explicitly owned by SEC-RLS-001 and are being idempotently replaced.

SEC-RLS-001 does not FORCE RLS across the schemas. Existing privileged server identities with `BYPASSRLS`, including `service_role`, retain their accepted PostgreSQL behavior. Enabling RLS is intended to govern non-bypass identities, not to silently redesign server authority.

## Dedicated non-bypass role preservation

Fresh privilege analysis found only two non-bypass CoMind roles with direct access to the 88 currently-unprotected tables.

### `comind_conversation_deriver`

Accepted access:

- SELECT `comind.cm_assistant_generation`;
- SELECT `comind.cm_conversation_capture_event`;
- SELECT `comind.cm_conversation_recovery_checkpoint`;
- SELECT, INSERT, UPDATE `comind.cm_message_analytics`;
- SELECT, INSERT, UPDATE `comind.cm_conversation_analytics`.

DELETE remains denied on both analytics tables.

### `comind_conversation_reconciler`

Accepted access:

- SELECT `comind.cm_assistant_generation`;
- SELECT `comind.cm_conversation_capture_event`;
- SELECT `comind.cm_conversation_recovery_checkpoint`.

It receives no analytics-table access through SEC-RLS-001.

Because those five tables previously lacked RLS, their ACLs were sufficient. Enabling RLS would otherwise turn the existing grants into denied operations. SEC-RLS-001 therefore adds explicit row policies only for this accepted access.

Three source tables receive one SEC-owned SELECT policy for the derivation and reconciliation roles. The two analytics tables receive separate SEC-owned SELECT, INSERT, and UPDATE policies for the derivation role. No DELETE policy is created.

## Existing-policy preservation

SEC-RLS-001 deliberately does not scan for and remove policies based on `true` predicates.

The isolated acceptance fixture creates a pre-existing role-scoped policy with `USING (true)` before hardening, applies the migration twice, and requires the exact policy to survive. This is a regression proof against the stale migration-007 behavior.

## Idempotency

The migration is repeatable:

- enabling RLS on an already-enabled table is safe;
- privilege revocation is repeatable;
- SEC-owned policies are dropped and recreated by exact SEC policy name;
- unrelated policies are untouched.

The isolated acceptance proof applies the migration twice before validating the final contract.

## Future-table integrity control

Current-state hardening alone is insufficient if a later migration can create another private-schema table without RLS.

`scripts/check_custom_schema_rls_migrations.py` provides a repository-level migration guard. For changed SQL migrations, it detects creation of tables in `comind` or `comind_pm`, including migrations that use a custom-schema `search_path`, and requires the same migration to enable RLS on the created table.

The guard has deterministic self-tests and is executed by the dedicated SEC-RLS-001 workflow.

This is a development-integrity control. It does not inspect arbitrary runtime DDL and is not a substitute for database role restrictions or postdeployment verification.

## Read-only live preflight

`db/verification/sec_rls_001_current_preflight.sql` is deliberately non-mutating. It inventories:

- custom-schema table count;
- RLS-disabled count;
- policy count and literal-true policy count;
- ordinary-role schema usage;
- ordinary-role effective DML exposure;
- accepted direct access for the derivation and reconciliation roles.

The preflight can be repeated immediately before any future live activation decision. Any unexpected drift must freeze mutation and be reconciled rather than normalized away.

## Shared Supabase mutation authority

Historical issue #126 established that shared Supabase schema mutation is serialized. Open PR #119 remains the historical live schema-mutation lane.

Joseph authorized SEC-RLS-001 development and continued autonomous work, but that broad development authority is not interpreted as silently invalidating an existing resource lease. Therefore this lane performs repository development, isolated PostgreSQL verification, and read-only Supabase inspection while PR #119 retains that lease.

A later decision may explicitly release, supersede, or transfer the live mutation lease. Until then, SEC-RLS-001 repository acceptance does not apply migration `_027` to the connected Test database.

## Migration namespace

Current merged `main` owns `20261030_025` for CE-004. Open RLIB-003 PR #389 claims `20261030_026`.

SEC-RLS-001 therefore uses the next verified-unused slot:

- `db/migrations/20261030_027_sec_rls_001_current_schema_hardening.sql`;
- `db/migrations/verify_20261030_027_sec_rls_001_current_schema_hardening.sql`.

The namespace must be rechecked before PR acceptance because parallel CoMind lanes continue to move.

## Acceptance

Repository acceptance requires exact-head proof that:

1. the hardening migration applies and reapplies on PostgreSQL 17;
2. all ordinary/partitioned `comind` and `comind_pm` tables are RLS enabled afterward;
3. ordinary Data API roles remain denied custom-schema usage and DML;
4. a legitimate pre-existing literal-true policy survives;
5. the two non-bypass conversation roles retain only their accepted behavior;
6. DELETE remains denied where it was not authorized;
7. `service_role` BYPASSRLS behavior remains operable;
8. the future migration guard detects a missing-RLS migration;
9. broad repository and runtime regressions remain green;
10. Production remains inactive.

Live Supabase activation is a separate acceptance state.

## Recovery

Before live activation, recovery is simply abandonment or reversion of this branch because no shared database state has changed.

For any future live activation, capture a fresh preflight, preserve the previous security state as evidence, apply transactionally, perform immediate postdeployment verification, and prefer a reviewed forward repair over blind schema-wide rollback if unexpected behavior is discovered.
