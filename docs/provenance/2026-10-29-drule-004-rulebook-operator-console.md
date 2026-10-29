# DRULE-004 RuleBook Operator Console provenance

Date: 2026-10-29
Issue: #321
Environment: repository plus Supabase Test only
Production activation: false
Paid provider use: none

## Purpose

DRULE-004 makes the existing Operator Console a bounded human control surface for authoritative conversation RuleBook status and append-only egress review decisions. It composes the conversation-governance substrate already accepted by DRULE-003 rather than creating a second policy or approval system.

## Recovery from interrupted development

The lane was interrupted after an assistant reasoning/context failure. Recovery did not infer missing state. GitHub was re-read as the authority.

Verified recovery facts:

- DRULE-003 PR #319 had already merged at `0007f4a71d2edc898b418835feab437e9dfe2f03`.
- The canonical CoMind Development Environment Contract v1.0 had subsequently merged to `main`.
- DRULE-004 Issue #321 and branch `drule-004-rulebook-operator-console-20261029` already existed.
- The interrupted branch contained exactly six additive DRULE-004 files based on the DRULE-003 merge.
- CUX-001 had merged separately and CUX-002 #324 had no implementation branch; CUX-002 explicitly leaves RuleBook governance semantics to DRULE-004.

The six recovered files were reconciled onto then-current `main` with a force-with-lease branch update, preserving issue/branch ownership and avoiding silent loss of the Development Contract, CUX-001, or later ThreadKeeper work. Reconciled checkpoint: `e145390ace72409882f2bee6afce90a1581d407e`.

## Reused authoritative substrate

DRULE-004 reuses:

- `comind_pm.pm_conversation_governance_bindings`;
- `comind_pm.pm_conversation_egress_review_events`;
- `comind_pm.record_conversation_egress_review`;
- canonical `comind.cm_conversation` tenant/project scope;
- the existing Operator Console RuleBook HUD;
- the existing server-side Supabase runtime boundary.

It does not create another RuleBook registry, conversation authority store, browser-side service credential, or parallel review ledger.

## Database boundary

Migration `20261029_006_drule_004_rulebook_operator_console.sql` adds two bounded `public` RPCs only because the Operator Console server uses Supabase RPC transport:

1. `comind_rulebook_operator_conversation_status(integer)` returns governance metadata only, with fixed `COMIND` project and `OPENAI-API` destination.
2. `comind_rulebook_operator_review_conversation(...)` appends an approved or denied review through the existing private RuleBook function.

Both functions are `SECURITY DEFINER` with pinned search paths. Execute authority is revoked from `PUBLIC`, `anon`, and `authenticated`, then granted only to `service_role`. The status result excludes conversation content, prompts, raw payloads, authority-basis text, evidence-reference text, credentials, and secrets.

Approval windows are restricted to 1, 4, 8, or 24 hours. A denial cannot carry an approval window. Project and destination are server/database-bound rather than caller supplied.

## Console boundary

Protected RuleBook controls fail closed unless all of the following server-only configuration is present:

- `OPERATOR_CONSOLE_RULEBOOK_ACCESS_MODE=trusted-perimeter`;
- `SUPABASE_SECRET_KEY`;
- `OPERATOR_CONSOLE_RULEBOOK_REVIEWER_ID`;
- the configured Supabase URL.

No secret or service-role value is placed in a `NEXT_PUBLIC_` variable. The browser calls only the Console's same-origin `/api/rulebook/conversations` route.

POST review requests require:

- JSON content type;
- explicit `x-comind-operator-intent: rulebook-review`;
- same-origin request origin;
- same-origin or `none` fetch-site when supplied;
- a strict payload containing only conversation ID, decision, authority basis, optional evidence reference, and bounded approval hours.

Reviewer identity is supplied by server configuration. Project, destination, tenant, project scope, and credentials cannot be supplied by the caller.

## UI scope

The existing public RuleBook HUD remains a synthetic Test status projection. DRULE-004 adds one separate protected conversation-governance panel. The panel shows governance metadata and bounded approval/denial controls only when the protected route is available. It does not expose conversation text or raw governance evidence.

No broad Console redesign is included. CUX-002 retains presentation/accessibility remediation ownership.

## Isolated acceptance design

The PostgreSQL 17 harness:

- applies the existing conversation-governance substrate;
- applies the DRULE-004 migration twice for replay/idempotency;
- proves ordinary roles cannot execute the RPCs;
- proves `service_role` can execute them;
- checks SECURITY DEFINER and pinned search paths;
- checks the status signature for forbidden content/evidence fields;
- creates a synthetic governed conversation inside a transaction;
- proves pending status, bounded approval, denial, and latest-state projection;
- proves review evidence remains append-only;
- rolls the synthetic proof back.

The Console tests prove strict request parsing, server-bound reviewer identity, lack of caller-supplied privileged scope, fail-closed runtime configuration, bounded status RPC usage, and route/server-only source contracts.

## Deployment and financial boundary

This lane does not:

- activate `console.comindinc.com`;
- change Cloudflare Access;
- enable Production mutation;
- expose `comind` or `comind_pm` to ordinary browser roles;
- create an OpenAI call, token-count request, paid execution, reservation, or cost receipt;
- authorize egress by itself outside the append-only RuleBook review mechanism.

DEP-C01 remains authoritative for deployed authentication and Production acceptance.

## Acceptance sequence

1. Run dedicated exact-head PostgreSQL and Console CI on a draft PR.
2. Repair any failure without weakening the security boundary.
3. Apply the accepted DDL to Supabase Test only.
4. Run bounded live Test readback and rollback-only review proof.
5. Run Supabase security/performance advisors and inspect new findings.
6. Record live evidence in this provenance file.
7. Run a final exact-head matrix and collision/freshness check.
8. Merge only with an expected-head guard.

DRULE-005 begins only after DRULE-004 reaches this acceptance boundary.
