# DRULE-004 RuleBook Operator Console provenance

Date: 2026-10-29
Issue: #321
PR: #329
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

## Failure and repair evidence

The exact-head acceptance process preserved three failures before live Test deployment.

### Failure 1: PUBLIC pseudo-role verification

The first PostgreSQL 17 gate attempted `has_function_privilege('PUBLIC', ...)`, but PostgreSQL treats `PUBLIC` as a pseudo-role rather than a role resolvable by that function. The security assertion therefore failed before evaluating the intended ACL state.

Repair: inspect the function ACL directly using `aclexplode(COALESCE(proacl, acldefault('f', proowner)))` and require no `EXECUTE` entry with grantee OID `0`, while retaining explicit `anon`, `authenticated`, and `service_role` assertions. The migration privilege model did not change.

Repair commit: `addaab7b5a3b0a5c4110b7d482800984774f6d75`.

### Failure 2: typed test environment fixture

The Console unit tests passed, but TypeScript rejected synthetic environment objects that omitted the repository-required `NODE_ENV` field.

Repair: add `NODE_ENV: "test"` only to the typed test fixtures. The runtime configuration contract did not change.

Repair commit: `f015f8042b985cd72120e7f8fc77a5134d4b107f`.

### Failure 3: PL/pgSQL output-column ambiguity

The next PostgreSQL gate found a real runtime defect before Test deployment. The status function returns an output column named `destination_key`; the internal unqualified predicate `destination_key = 'OPENAI-API'` was therefore ambiguous inside PL/pgSQL.

Repair: qualify the egress-destination lookup through table alias `d`. Project and destination remain fixed to `COMIND` and `OPENAI-API`.

Repair commit: `be41335757498db4805eec6476f8d3bd421edec7`.

### Failure 4: UUID aggregate assumption in verification

After the runtime fix, the database proof reached successful pending, approval, and denial behavior, then the append-only verification attempted `min(uuid)`. PostgreSQL 17 does not define that aggregate for UUID.

Repair: preserve the review-count assertion and select one review event deterministically using `ORDER BY reviewed_at, created_at, id LIMIT 1` before attempting the forbidden update.

Repair commit and accepted pre-live candidate: `56413ff934aea49c4d2a4179eae1cae0fa682ea3`.

No failure was bypassed, waived, or converted into a weaker acceptance condition.

## Isolated acceptance

Dedicated workflow `DRULE-004 RuleBook Operator Console`, run `40956803941`, passed both exact-head jobs on `56413ff934aea49c4d2a4179eae1cae0fa682ea3`:

- `database-contract`: passed PostgreSQL 17 two-pass migration replay, ordinary-role denial, `service_role` execution, pinned SECURITY DEFINER configuration, content-minimized status projection, pending state, bounded approval, denial, latest-state projection, append-only evidence, and rollback;
- `console-contract`: passed exact dependency installation, production dependency audit, protected-boundary tests, TypeScript typecheck, and Next.js build with protected RuleBook mode disabled.

The same head also passed the inherited No Placeholder Policy and Implementation Integrity gates before live Test deployment.

## Supabase Test migration and live proof

Preflight confirmed neither proposed operator RPC existed in Supabase Test.

Migration `drule_004_rulebook_operator_console` was then applied successfully to Test project `sbgfuanxiqepcoboxzcl`. No Production database was touched.

Readback proved both functions:

- are `SECURITY DEFINER`;
- have the expected pinned search paths;
- deny execute to `PUBLIC`, `anon`, and `authenticated`;
- grant execute to `service_role` only.

The existing synthetic governed canary conversation `c9a20000-0000-4000-8000-000000000002` resolved through the new status RPC as:

- classification `INTERNAL`, rank 10;
- purpose `assistant-response`;
- destination `OPENAI-API`;
- canonical CoMind tenant/project scope;
- bounded approved state;
- existing reviewer `Joseph Hogarth`;
- original review count 1.

A rollback-only live transaction then executed as `service_role`:

1. append a denial through the operator review RPC and verify status becomes `denied` with `human_approved=false`;
2. append a one-hour bounded approval and verify status becomes `approved` with `human_approved=true` and a future expiry;
3. reset role and roll back the entire transaction.

Post-rollback readback proved:

- the canary's original reviewer, review timestamp, and expiry are unchanged;
- durable review count remains 1;
- rows reviewed by `DRULE-004-LIVE-ROLLBACK` equal 0.

The live proof therefore exercised the actual Test RPC path without leaving synthetic review mutations behind.

## Advisor review

Post-migration Supabase security advisors reported the existing baseline categories only:

- 54 informational RLS-enabled-without-policy findings across existing private/test tables;
- 8 existing mutable-search-path function warnings;
- 2 existing anon-executable SECURITY DEFINER warnings;
- 2 existing authenticated-executable SECURITY DEFINER warnings.

The SECURITY DEFINER warnings remain limited to legacy `public.comind_api_approval_decide(...)` and `public.comind_api_approval_get(...)`. Neither DRULE-004 function appears in those findings.

Post-migration performance advisors reported existing baseline categories only: 155 unindexed foreign-key informational findings, 150 unused-index informational findings, and 2 multiple-permissive-policy warnings. DRULE-004 adds functions only and introduced no table, foreign-key, index, or RLS-policy finding.

Relevant Supabase remediation references:

- https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable
- https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable
- https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable
- https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys
- https://supabase.com/docs/guides/database/database-linter?lint=0006_multiple_permissive_policies

No new advisor regression is attributed to DRULE-004.

## Deployment and financial boundary

This lane does not:

- activate `console.comindinc.com`;
- change Cloudflare Access;
- enable Production mutation;
- expose `comind` or `comind_pm` to ordinary browser roles;
- create an OpenAI call, token-count request, paid execution, reservation, or cost receipt;
- authorize egress by itself outside the append-only RuleBook review mechanism.

DEP-C01 remains authoritative for deployed authentication and Production acceptance.

## Final acceptance sequence

The live Test milestone is complete. Remaining merge gates after this provenance commit are:

1. run the dedicated and broad workflows again on the documentation-complete exact head;
2. confirm no workflow regression, including Implementation Integrity, Console usability, Operator Console CI, DRULE-002, provider, Foundry, and broad CI where triggered;
3. re-read current `main` and inspect branch divergence/file overlap;
4. update PR #329 and Issue #321 with the accepted evidence;
5. mark the PR ready and merge only with the expected-head guard;
6. read back `main` and close #321 only after the merge is authoritative.

DRULE-005 begins only after those gates complete.
