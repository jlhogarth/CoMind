# DBSEC-001 Supabase Security Advisor Audit

Date: 2026-11-01
Issue: #479
Production change: false
Authority expansion: false

## Scope

This audit classifies the Supabase security findings observed during MP-007 deployment and applies the one low-risk hardening change that is clearly behavior-preserving.

## RLS enabled with no policy

The advisor reported 152 CoMind-owned tables with RLS enabled and no policy.

Live privilege inspection classified all 152 as intentional private deny-by-default surfaces:

- `comind`: 131 tables
- `comind_development`: 5 tables
- `comind_pm`: 1 table
- `public`: 12 tables
- `sdn_test`: 3 tables

Across all 152 tables, direct `anon` table privilege count is zero and direct `authenticated` table privilege count is zero for SELECT/INSERT checks. No permissive policy exists, so RLS blocks direct browser-role row access. Service-role access exists only where explicitly granted for trusted server workflows.

This finding is classified as intentional. Adding permissive policies merely to silence the advisor would weaken the current private posture and is prohibited.

Supabase-managed `auth` and `storage` schemas are platform surfaces and are not modified by this lane.

## Anonymous SECURITY DEFINER RPCs

Four advisor warnings were inspected at the live function-definition and grant level.

### `public.comind_api_approval_get(text)`

Intentional anonymous capability endpoint. The supplied token must be at least 32 characters, is SHA-256 matched to a stored token hash, must be unconsumed and unexpired, and the linked proposal must still be pending. The function has a fixed search path.

Classification: intentional token-authorized public entrypoint.

### `public.comind_api_approval_decide(text,text,text)`

Intentional anonymous capability endpoint. It SHA-256 matches an unconsumed, unexpired approval token, verifies proposal/request pending state, records the authorization decision, updates the proposal, and consumes the approval link. The function has a fixed search path.

Classification: intentional token-authorized public entrypoint.

The same two functions are executable by `authenticated`. This does not widen their effective authorization because both still require the same valid one-time token. Keeping both grants supports the same approval link whether the browser has an authenticated Supabase session or not.

### `public.operator_console_activity_feed(text,text,integer)`

Intentional anonymous capability endpoint. It requires a capability value of at least 32 characters and validates its SHA-256 hash against the enabled, unexpired `activity_hud_v1` capability record before any data is returned. The function has a fixed search path.

Classification: intentional capability-authorized read entrypoint.

### `public.operator_console_l4a_management_plane(text)`

Intentional anonymous capability wrapper. It validates a SHA-256 capability against enabled, unexpired `l4a_management_v1`, then calls the internal no-argument management-plane function. The internal no-argument function itself is not executable by `anon` or `authenticated` and remains service-role only. Both functions have fixed search paths.

Classification: intentional capability-authorized wrapper with private internal implementation.

No unguarded anonymous `SECURITY DEFINER` privilege was identified in these four advisor findings.

## Mutable search path functions

Seven older ordinary SECURITY INVOKER functions lacked an explicit `search_path`:

- `comind.current_actor()`
- `comind.fn_belief_update_beta(uuid,boolean,jsonb)`
- `comind.fn_create_causal_node_from_memory(uuid,text,text)`
- `comind.set_current_actor(uuid)`
- `comind.set_updated_at()`
- `comind.set_updated_at_checklist()`
- `comind_pm.touch_updated_at()`

DBSEC-001 fixes these in place using `ALTER FUNCTION ... SET search_path` only. Function bodies, signatures, volatility, ownership, SECURITY INVOKER status, and grants are unchanged.

`comind` functions use `pg_catalog, comind`. `comind_pm.touch_updated_at()` uses `pg_catalog, comind_pm`.

## Performance advisor findings

The advisor also reported unindexed foreign keys and duplicate permissive RLS policies. Those are performance and policy-hygiene findings, not evidence of an MP-007 or MP-008 security regression. They are explicitly deferred from DBSEC-001 so security hardening is not mixed with broad index and query-plan changes.

A separate performance lane should prioritize foreign keys that are active in high-frequency operational joins and reconcile duplicate permissive policies only after proving their semantic equivalence.

## Verification

The dedicated PostgreSQL 17 proof creates exact-signature isolated function fixtures, applies the hardening migration, and verifies:

- all seven functions have the intended fixed search path
- all seven remain SECURITY INVOKER
- no SECURITY DEFINER authority is introduced
- representative callable behavior remains valid

Live post-deployment verification must rerun the Supabase security advisor and confirm that `function_search_path_mutable` no longer reports these seven functions while the intentionally guarded public endpoints remain unchanged.
