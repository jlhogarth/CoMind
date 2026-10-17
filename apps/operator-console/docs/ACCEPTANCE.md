# Operator Console acceptance map

## OC-001

OC-001 was accepted and merged through PR #113 after exact-head verification. It established the schema-driven read foundation and browser credential boundary.

## OC-002 current acceptance state

| Criterion | Implemented in PR #119 | Isolated tested | Live Supabase verified |
| --- | --- | --- | --- |
| Browser uses URL plus publishable key only | Yes | Yes | Application deployment configuration not yet exercised |
| Server privileged key remains outside browser bundle | Yes | Yes | Database-side service-role boundary verified; deployed server secret provisioning not yet exercised |
| Ordinary browser schema fixed to `public` | Yes | Yes | Yes, browser-equivalent `anon` role reads verified on the approved public relations |
| Registry-approved schema metadata RPC | Yes | Yes | Yes |
| Live metadata endpoint with fail-closed behavior | Yes | Yes | Database RPC verified; deployed HTTP route not yet exercised |
| Schema graph from actual metadata | Yes | Yes | Yes, live metadata reports 3 approved relations and 3 foreign keys |
| RLS-bound live relation reads | Yes | Yes | Yes, `anon` role reads returned 4 users, 6 posts, and 8 comments |
| Separate administrative execution route | Yes | Yes | Database administrative boundary verified; deployed HTTP route not yet exercised |
| Registry-gated insert and update | Yes | Yes | Yes |
| Destructive mutation denied for ordinary relations | Yes | Yes | Yes, delete against `public.users` denied with SQLSTATE `42501` |
| Delete restricted to verification-only test relation | Yes | Yes | Yes |
| Primary-key scoped update/delete | Yes | Yes | Yes |
| Request-ID idempotency | Yes | Yes | Yes, replay returned the prior result without duplicating the test row |
| Append-only mutation audit | Yes | Yes | Yes |
| RLS/permission failures remain visible | Yes | Yes | Yes |
| Rollback or compensating test-data cleanup | Yes | Yes | Yes, verification test row was deleted through the delegated test-only path |
| `comind` browser exposure | No, explicitly excluded | Not applicable | No ordinary-role schema usage or table grants observed |
| `comind_pm` browser exposure | No, explicitly excluded | Not applicable | No ordinary-role schema usage or table grants observed |
| General raw SQL administration | No, explicitly excluded | Not applicable | Not authorized |

## Live OC-002 evidence

Live project: `sbgfuanxiqepcoboxzcl`.

The following migrations are recorded in live Supabase migration history:

- `operator_console_live_activation_v0_2`
- `operator_console_service_role_least_privilege_v0_2_1`
- `operator_console_explicit_deny_policies_v0_2_2`

Live execution evidence was reconciled against PR #119 head `6495f16f4361a29334eff46dc3242eb5c315a49e` before this documentation update.

Verified live behavior:

- `service_role` metadata execution returns exactly 3 registered relations and 3 foreign keys.
- Browser-equivalent `anon` role can read only the intended current public relational surface used by OC-002 verification.
- `anon` has no SELECT privilege on the Operator Console registry, verification, or audit support tables.
- `anon` cannot execute the protected metadata or administrative mutation functions.
- A governed verification insert succeeded.
- Reusing the successful insert request ID returned an idempotent replay.
- A governed verification update succeeded.
- Delete against `public.users` was denied with SQLSTATE `42501`.
- Delete of the explicitly test-only verification record succeeded as cleanup.
- Mutation evidence is recorded in `public.operator_console_mutation_audit`.

## Live access inventory and security debt

- `public.users`, `public.posts`, and `public.comments` have RLS enabled and are the current browser-readable OC-002 relational surface.
- `anon` and `authenticated` have no schema USAGE on `comind`.
- `anon` and `authenticated` have no schema USAGE on `comind_pm`; `service_role` has access there.
- Live privilege inspection found no `anon` or `authenticated` table grants in either `comind` or `comind_pm`.
- Supabase security advisory output still flags 75 `comind` tables with RLS disabled. This is security debt and must be addressed before any future ordinary-role exposure. Enabling RLS across those tables is not performed as part of OC-002 because doing so without a complete policy design could break existing runtime access.
- `comind_pm` views are not currently `security_invoker`, but ordinary roles also lack access. They must not be exposed to ordinary roles without a separate hardening review.

## Remaining OC-002 boundary

Database activation and governed live read/write behavior are now evidenced. The remaining acceptance gap is application-layer deployment exercise using the real project URL, publishable browser key, protected server secret, and HTTP routes. Do not report the browser and server application path as fully deployed until those routes are exercised in an actual running Operator Console instance.
