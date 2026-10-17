# Live Foundry LF-3 Security and Compatibility Readiness

Date: 2026-10-16 America/Indiana/Indianapolis
Issue: #133
Branch: `issue-133-live-foundry-lf3-security-readiness`
Accepted starting main: `596cfd23043a94839f5ca29ed9a714d9f177c63c`
Live Supabase project: `sbgfuanxiqepcoboxzcl`
Tier: T3
Live deployment authority: C4 approval required

## Objective

Prepare an evidence-backed deployment decision for `db/migrations/20261008_007_foundry_security_prerequisites.sql` without applying migration 007 live and without activating Agents, Virtual Employees, PM Agents, providers, paid execution, migration 008+, or unrelated lanes.

## Reviewed source

Migration 007 reviewed Git blob:

`461a43037301d121ab46ebda083b740baa04212f`

The migration performs four classes of change:

1. enables RLS on every current ordinary or partitioned table in `comind`;
2. revokes table privileges from `PUBLIC`, `anon`, and `authenticated` across those current tables;
3. drops `comind` policies with unconditional `TRUE` `USING` or `WITH CHECK` expressions;
4. fixes the search path of seven existing `comind` functions to `comind, public, pg_temp`.

It does not change service-role grants, function EXECUTE privileges, function SECURITY INVOKER or SECURITY DEFINER mode, schema USAGE, default privileges, future-table auto-hardening, application authorization policies, Agent authorization, provider configuration, or runtime activation.

## Reverified live predeployment state

The committed LF-3 live preflight was executed in a read-only transaction and returned `lf3_preflight_pass: true` with `c4_authorized: false`.

Verified baseline includes:

- PostgreSQL 17.11;
- exact 13-entry migration ledger ending in `20261017002923 live_foundry_lf2_agent_substrate_v1`;
- migration 007 not deployed;
- 94 current `comind` tables;
- 19 current `comind` tables with RLS enabled and 75 without RLS;
- 12 `comind` policies, all unconditional scaffold policies on conversation/document/message surfaces;
- seven `comind` functions matching the current mutable-search-path Advisor findings;
- all seven migration-007 target functions are SECURITY INVOKER live;
- no effective `comind` table privileges for `anon` or `authenticated`;
- `service_role` SELECT and INSERT on exactly 15 current `comind` tables and no UPDATE, DELETE, TRUNCATE, REFERENCES, or TRIGGER table authority;
- `service_role` and `postgres` retain BYPASSRLS while `anon` and `authenticated` do not;
- `anon` and `authenticated` have no `comind` schema USAGE;
- no custom default ACL entries for `comind` or global scope;
- protected LF-1/LF-2 row counts remain unchanged;
- every LF-2 Foundry substrate table remains empty;
- provider registry remains exactly `local_rtx5090`, `openai`, `google_gemini`, `supabase`, `railway`, `vercel`, `replit`;
- Operator Console registry remains exactly `public.comments`, `public.operator_console_verification_records`, `public.posts`, `public.users` with its existing flags;
- migration 008 runtime-orchestration objects remain absent.

## Security Advisor baseline and expected delta

Refreshed live Advisor baseline before migration 007:

- 7 WARN `function_search_path_mutable`;
- 27 INFO `rls_enabled_no_policy`.

Expected migration 007 result, if the live preflight state remains unchanged:

- `function_search_path_mutable`: 7 to 0, delta -7;
- `rls_enabled_no_policy`: 27 to 106, delta +79.

The expected INFO increase is a consequence of fail-closed RLS coverage, not evidence of security completion or regression by itself. Migration 007 enables RLS on 75 additional `comind` tables and removes the broad policies from four already-RLS-enabled tables. The twelve current public FinOps no-policy tables are unchanged.

## Function and privilege consequences

The seven targeted live functions are SECURITY INVOKER. Migration 007 fixes their search paths but intentionally does not alter function security mode or EXECUTE ACLs. Their existing default function ACL shape therefore remains a residual security consideration, not a hidden change in this milestone.

The target functions that read or write CoMind tables use unqualified relation names. Fixing their search path to `comind, public, pg_temp` makes those references deterministic toward `comind` first and removes the current mutable-search-path warning condition.

The migration's broad table REVOKE is largely defensive against the current live baseline because `anon` and `authenticated` already have no effective table privileges and no `comind` schema USAGE. The material authorization change is broad RLS enablement plus removal of twelve unconditional policies.

## Runtime compatibility

The repository application DB layer uses the role embedded in `DATABASE_URL` for normal application mode and does not currently preflight that role for BYPASSRLS or an expected privilege contract. Therefore migration 007 cannot be considered runtime-compatible with an unknown application database role merely because service_role is safe.

The connected Railway inventory currently contains only the OC-002 acceptance Operator Console service. Its browser relational surface is the public schema and migration 007 does not change the Operator Console registry. No connected Railway core CoMind application service was found during this readiness review.

A Vercel project named `co-mind` was found in the connected Vercel inventory. Project-detail inspection was denied by the current connector scope, so its deployment configuration and database identity were not verified. No secret value was requested or read. This remains an explicit deployment-surface uncertainty, not evidence that the project is or is not connected to this Supabase database.

Deployment activation must fail closed if a current core application runtime using this live database is later identified with a non-BYPASSRLS database role that depends on direct `comind` access without policies.

## Canonical repository versus live schema drift discovered by LF-3 CI

The production-shaped LF-3 workflow established that the current canonical repository build and the accepted live database are not identical even before migration 007. Current canonical `MASTER.sql` produces 95 `comind` tables with 20 RLS-enabled tables, while accepted live LF-2 has 94 and 19.

The extra canonical relation is `comind.cm_assistant_generation`, introduced by Issue #78 for conversation fast-path generation ownership. Its provenance explicitly deferred live Supabase mutation and production deployment. Current server routes reference the table for assistant generation and conversation status, but the table is absent from accepted live Supabase.

The current canonical security SQL also already removes the twelve broad conversation/document/message policies and already fixes the seven target function search paths. Live Supabase still contains those twelve policies and still reports the seven mutable-search-path functions. Migration 007 is therefore a live reconciliation mechanism for those security differences, not a reason to rewrite the current canonical base backward.

A further CI check established function-mode drift: current canonical `comind.set_current_actor(uuid)` is SECURITY DEFINER, while accepted live `comind.set_current_actor(uuid)` is SECURITY INVOKER. Migration 007 does not change function security mode and would therefore preserve the live INVOKER mode. This difference remains a separate compatibility fact rather than being silently folded into migration 007.

Migration 007 does not create `cm_assistant_generation` and does not reconcile the `set_current_actor` security-mode difference. Those are pre-existing canonical/live drift outside LF-3's authorized live mutation scope. They must be reconciled under the appropriate canonical-schema lane or proven irrelevant to any current live core application runtime before LF-3 can make a core-runtime compatibility claim.

The LF-3 isolated test deliberately normalizes only its disposable database back to the exact accepted live pre-007 state: it removes `cm_assistant_generation`, reinstates the twelve accepted live broad policies, resets the seven target functions' search paths, and sets all seven target functions to SECURITY INVOKER. It then requires migration 007 itself to produce the intended postdeployment security state while preserving the live function mode. This preserves the distinction between current canonical implementation and current deployed reality.

## Authority reconciliation

Issue #126 remains a queued canonical-schema scope issue. Its historical statement assigning the shared mutation lane to the older Operator Console PR predates the later Live Foundry authority transfer and the completed LF-1/LF-2 deployments. It is not treated as a competing mutation authorization.

No global runtime lock is claimed. The governing control remains explicit coordination evidence and Joseph's standing assignment of the exclusive live CoMind Supabase schema-mutation lane to Live Foundry until terminal completion, unless revoked or transferred.

Migration 007 still requires fresh C4 approval. Repository readiness work does not consume that approval.

## Verification defects, evidence, and forward repairs

The first execution of the new read-only LF-3 live preflight failed only `target_functions_still_mutable_ok`. Diagnosis showed the verifier joined `pg_proc` by function name before constraining the namespace, allowing same-named functions in other schemas to create a false failure. No production drift or mutation occurred. The verifier was repaired to constrain target functions to `comind` before matching identity arguments, and the repaired committed preflight passed every live gate.

The first dedicated LF-3 CI run failed before migration 007 because the current canonical isolated builder produced 95 `comind` tables with 20 RLS-enabled, not the accepted live 94 and 19. Diagnosis identified repository-only `cm_assistant_generation`. The test was repaired by normalizing only the disposable fixture to the live table and policy shape rather than weakening the 94/19 production contract.

The next LF-3 CI run reached that repaired 94/19/12-policy shape but found zero mutable-search-path functions rather than live's seven. Diagnosis established that the current canonical build already fixes those search paths. The disposable live-shape normalizer was hardened again to reset only the seven migration-007 target function search paths before asserting the predeployment contract. Migration 007 must then restore all seven fixed paths.

A subsequent run showed the pre-existing generic migration-007 verifier had the same cross-schema function lookup defect as the new preflight. Migration 007 itself had executed twice successfully. The generic verifier was hardened to resolve candidate functions inside `comind` before matching identity arguments. This repair changes verification only, not migration 007.

The next run advanced through migration 007 twice, the hardened generic verifier, LF-2 service-role verification, and post-007 structural checks, then failed because the canonical fixture retained SECURITY DEFINER on `set_current_actor` while the exact live postdeployment contract correctly expected all seven targets to remain SECURITY INVOKER. Live read-only catalog evidence confirmed the difference. The disposable fixture now normalizes all seven target functions to the live INVOKER mode before migration 007 and explicitly asserts that live precondition.

After those bounded repairs, the dedicated LF-3 workflow completed successfully through live-shape normalization, migration 007 twice, the generic verifier, LF-2 service-role compatibility, protected-state checks, and the exact LF-3 postdeployment contract.

Each failure was bounded to read-only live inspection or disposable CI. No live database mutation occurred. Each repair preserved the production contract and made the reason for canonical/live normalization explicit rather than lowering an assertion to make CI pass.

## Exact source-head and merge-candidate identity

The original LF-3 workflow inherited the LF-2 pattern of checking the checked-out `GITHUB_SHA`. On a pull-request event, GitHub checks out the synthetic merge candidate, so that guard proves the exact merge candidate but does not independently prove the PR source-head identity.

LF-3 hardens this evidence. The workflow now fetches enough history to verify all three identities on PR events:

1. checked-out `HEAD` equals the exact `GITHUB_SHA` merge candidate;
2. merge parent 1 equals the exact PR base SHA from the event;
3. merge parent 2 equals the exact PR source-head SHA from the event.

This preserves merge-candidate compatibility testing while also proving which source head was incorporated. LF-2 is not modified as part of LF-3.

## Repository readiness package

The LF-3 branch adds or hardens:

- `config/live_foundry_lf3_security_prerequisites_manifest.json`;
- `scripts/verify_live_foundry_lf3_manifest.py`;
- `db/verification/live_foundry_lf3_preflight.sql`;
- `db/verification/live_foundry_lf3_postdeploy.sql`;
- `scripts/test_live_foundry_lf3_security_readiness.sh`;
- `.github/workflows/live-foundry-lf3-readiness.yml`;
- `db/migrations/verify_20261008_007_foundry_security_prerequisites.sql` verifier lookup hardening;
- this provenance record.

The isolated workflow rebuilds the accepted LF-2 governed substrate, normalizes the disposable canonical database to the exact accepted live pre-007 security shape, proves that pre-shape, applies migration 007 twice for idempotency, runs the hardened migration 007 verifier, reruns the LF-2 service-role verifier after 007, checks protected Agent/PM state, and evaluates the exact LF-3 live postdeployment SQL against disposable boundary fixtures.

## Residual gaps deliberately not broadened into LF-3

1. Migration 007 is a one-time sweep. It does not guarantee RLS on future `comind` tables.
2. Migration 007 does not change default privileges.
3. Migration 007 does not change function EXECUTE privileges.
4. Migration 007 does not change target function SECURITY INVOKER or SECURITY DEFINER mode.
5. Migration 007 does not create application or Agent RLS policies.
6. Migration 007 does not create the canonical `cm_assistant_generation` relation that is absent from live Supabase.
7. Migration 007 does not reconcile canonical/live `set_current_actor` security-mode drift.
8. Migration 007 does not prove compatibility for an unidentified core application database role or an uninspected deployment surface.
9. Migration 007 does not activate Agents, Virtual Employees, PM Agents, providers, or paid execution.

These are explicit boundaries, not hidden completion claims.

## Recovery posture

Unexpected live state freezes further LF-3 mutation. Preserve committed evidence, identify the exact applied delta, and prefer reviewed forward repair. Destructive rollback is not the default and is not authorized by this readiness package.

## Human approval boundary

Before T3 merge of the readiness package:

1. the exact PR source-head and exact GitHub merge candidate must be identified and their LF-3 workflow must pass;
2. the repository's other applicable workflows for that candidate must be terminal and successful;
3. current authoritative main must be reverified;
4. live read-only preflight must still pass;
5. live Security Advisor must be refreshed;
6. schema-mutation authority must still belong to Live Foundry;
7. PR review state must have no unresolved blocking review evidence;
8. Joseph must provide the required T3 approval.

Before any live migration 007 execution, the separate C4 gate also requires current deployment-surface and database-role compatibility evidence. The known missing `cm_assistant_generation` canonical relation and `set_current_actor` security-mode drift must be reconciled or proven irrelevant to any operating core runtime. T3 merge approval must not be interpreted as C4 deployment approval.

No live migration 007 execution occurred during this readiness work.
