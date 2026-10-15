# Operator Console acceptance map

## OC-001

OC-001 was accepted and merged through PR #113 after exact-head verification. It established the schema-driven read foundation and browser credential boundary.

## OC-002 current acceptance state

| Criterion | Implemented in PR #119 | Isolated tested | Live Supabase verified |
| --- | --- | --- | --- |
| Browser uses URL plus publishable key only | Yes | CI pending | Configuration exercise pending |
| Server privileged key remains outside browser bundle | Yes | CI pending | Provisioning pending |
| Ordinary browser schema fixed to `public` | Yes | CI pending | Live read exercise pending |
| Registry-approved schema metadata RPC | Yes | CI pending | Migration pending |
| Live metadata endpoint with fail-closed behavior | Yes | CI pending | Server secret provisioning pending |
| Schema graph from actual metadata | Yes | CI pending | Live metadata exercise pending |
| RLS-bound live relation reads | Yes | CI pending | Live browser-equivalent exercise pending |
| Separate administrative execution route | Yes | CI pending | Server admin provisioning pending |
| Registry-gated insert and update | Yes | CI pending | Live verification pending |
| Destructive mutation denied for ordinary relations | Yes | CI pending | Live verification pending |
| Delete restricted to verification-only test relation | Yes | CI pending | Live verification pending |
| Primary-key scoped update/delete | Yes | CI pending | Live verification pending |
| Request-ID idempotency | Yes | CI pending | Live verification pending |
| Append-only mutation audit | Yes | CI pending | Migration and exercise pending |
| RLS/permission failures remain visible | Yes | CI pending | Live verification pending |
| Rollback or compensating test-data cleanup | Yes | CI pending | Live verification pending |
| `comind` browser exposure | No, explicitly excluded | Not applicable | Not authorized |
| `comind_pm` browser exposure | No, explicitly excluded | Not applicable | Not authorized |
| General raw SQL administration | No, explicitly excluded | Not applicable | Not authorized |

## Live access inventory observed before OC-002 migration

- `public.users`, `public.posts`, and `public.comments` have RLS enabled and browser SELECT policies.
- `anon` and `authenticated` have no schema USAGE on `comind`.
- `anon` and `authenticated` have no schema USAGE on `comind_pm`; `service_role` has access there.
- Many `comind` tables currently have RLS disabled, but ordinary Data API roles also lack the schema and table privileges required to use them. This remains security debt if future grants or API exposure change.
- `comind_pm` views are not `security_invoker`, but only `service_role` currently has schema and view access. They must not be exposed to ordinary roles without a separate hardening review.

No pending item may be reported as live accepted until direct execution evidence exists against the CoMind Supabase project.
