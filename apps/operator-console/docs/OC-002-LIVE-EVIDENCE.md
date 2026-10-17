# OC-002 live Supabase activation evidence

Date: 2026-10-15
Issue: #118
Pull request: #119
Environment: live CoMind Supabase project

## Evidence classification

OC-002 has crossed the database activation boundary. The live database substrate, browser authority boundary, privileged database execution path, migration ledger, audit behavior, and recovery-oriented verification are evidence-backed.

The Next.js Operator Console runtime is implemented and CI-verified but is not yet claimed as deployed. Application-layer HTTP routes and runtime secret provisioning remain outside the completed evidence boundary.

## Live migration ledger

The live Supabase migration history contains the following OC-002 migrations:

- `20261015211851 operator_console_live_activation_v0_2`
- `20261015212201 operator_console_service_role_least_privilege_v0_2_1`
- `20261015212719 operator_console_explicit_deny_policies_v0_2_2`

All migration logic is represented in repository-controlled SQL under `db/migrations`.

## Browser authority boundary

Verified live behavior:

- `public.users`, `public.posts`, and `public.comments` are the approved browser-readable relational surface for OC-002.
- Browser-equivalent `anon` reads returned the expected current relation counts during activation verification.
- `anon` and `authenticated` have no schema USAGE on `comind`.
- `anon` and `authenticated` have no schema USAGE on `comind_pm`.
- No ordinary-role table grants were observed in `comind` or `comind_pm` during activation verification.
- Ordinary roles cannot execute the protected Operator Console metadata or mutation RPCs.
- The three Operator Console support tables have RLS enabled plus restrictive `false` policies for `anon` and `authenticated`.

This evidence does not authorize exposing `comind` or `comind_pm` to browser roles.

## Privileged administrative boundary

The administrative database path is registry-gated and caller-rights. It does not use `SECURITY DEFINER` to bypass the caller's database authority.

Verified live behavior under the privileged service role:

- protected schema metadata returned exactly 3 approved relations and 3 foreign keys;
- a governed insert into the verification-only relation succeeded;
- replaying the same successful request ID returned the prior result without a duplicate mutation;
- a primary-key scoped update succeeded;
- delete against `public.users` was denied with SQLSTATE `42501`;
- delete of the verification-only record succeeded as the bounded cleanup action;
- the verification relation was left with no residual activation test row.

General raw SQL administration is not delegated by OC-002.

## Mutation audit and provenance

The live mutation audit captured the consequential activation sequence:

1. successful verification insert;
2. successful verification update;
3. denied destructive delete against `public.users`;
4. successful verification-only cleanup delete.

The idempotent replay did not generate a duplicate successful mutation audit.

A same-statement audit count observed during activation initially returned zero because of PostgreSQL statement-snapshot visibility. A separate post-commit read returned the expected durable audit rows. The post-commit read is the accepted evidence.

## Least-privilege correction discovered during live activation

The first live migration exposed a Supabase-specific default privilege condition that was not reproduced by the initial isolated PostgreSQL model: newly created public tables inherited broader direct `service_role` privileges than intended.

This was treated as a live acceptance defect rather than ignored.

Migration `20261015_002_operator_console_service_role_least_privilege.sql` now explicitly removes those broad privileges and regrants only the required authority:

- relation registry: SELECT, INSERT, UPDATE, DELETE;
- verification records: SELECT, INSERT, UPDATE, DELETE;
- mutation audit: SELECT, INSERT only.

Direct privileged UPDATE, DELETE, and TRUNCATE against the mutation audit are denied. TRUNCATE is explicitly considered because RLS does not protect it.

The isolated lifecycle test was also strengthened to reproduce broad Supabase-style default grants before applying the hardening migration, ensuring the live defect is now covered by repository verification.

## Explicit ordinary-role denial

Migration `20261015_003_operator_console_explicit_deny_policies.sql` added restrictive denial policies to all three Operator Console support tables for `anon` and `authenticated`.

This provides layered failure behavior:

1. ordinary roles have no table grants;
2. RLS is enabled;
3. restrictive `false` policies deny ordinary-role access even if a future permissive policy is accidentally introduced.

After this migration, Supabase security advisor findings specific to the OC-002 support tables were cleared.

## Remaining pre-existing security debt

Seven mutable `search_path` warnings remain in pre-existing `comind` functions. They were not introduced by OC-002 and are not silently treated as resolved.

Broader `comind` RLS and future-exposure governance also remain separate hardening work. OC-002 deliberately does not enable RLS indiscriminately across existing runtime tables without a policy design because doing so could break existing execution paths.

## Repository verification

The Operator Console CI verifies:

- reproducible npm lock installation;
- production dependency audit with high and critical advisories as failures;
- unit tests;
- TypeScript checking;
- production Next.js build;
- isolated PostgreSQL lifecycle verification;
- repeated application of the OC-002 migrations where designed to be idempotent;
- browser-role denial behavior;
- service-role least privilege;
- restrictive support-table policies;
- governed mutation lifecycle and audit immutability.

At the documentation reconciliation point immediately preceding this record, PR #119 exact head `d33374b15c15b81001e4a6ca87d1891284bdf4be` had nine associated workflows complete successfully.

## Recovery and cleanup

Activation testing used the dedicated verification relation. Test data was removed through the same bounded administrative path being verified.

The live migrations are additive and transactional. Administrative request replay is request-ID idempotent. Consequential mutations are written to an append-only audit surface whose direct destructive privileges are removed from `service_role`.

## Remaining OC-002 acceptance gap

The database substrate is live and verified. The remaining milestone work is application runtime activation:

- select and provision a governed Next.js runtime;
- configure the browser publishable-key path;
- provision the Supabase server secret only in the trusted runtime;
- keep administrative execution disabled by default until server authorization is configured;
- deploy the Console;
- exercise the actual deployed `/api/schema` and administrative mutation route against live Supabase;
- verify that browser authority remains unchanged;
- record the resulting runtime evidence before claiming end-to-end live Operator Console acceptance.

## Governance conclusion

OC-002 database activation is evidence-backed, bounded, least-privilege hardened, auditable, and recoverable for its verification writes. It does not establish that the Next.js runtime is deployed, and it does not widen browser authority into CoMind internal schemas.

Never substitute plausibility, confidence, verbosity, convenience, or user agreement for epistemic justification. No Hallucinations. No Lies.

No delegated work should disappear silently.
