# DRULE conversation governance binding

Date: 2026-10-29
Status: verified in Supabase Test, pending repository merge
Scope: authoritative static governance binding for assistant conversations
Production authority: false

## Purpose

This milestone provides the missing server-side binding between a `comind.cm_conversation` identity and RuleBook control-plane state. It exists so provider execution can eventually derive classification, tenant scope, project scope, purpose, and human egress approval from controlled state instead of accepting those attributes from request content or guessing defaults.

It does not activate the ordinary assistant provider path. It does not infer or classify existing conversations automatically.

## Data model

Private `comind_pm` adds:

- `pm_conversation_governance_bindings`: one governed RuleBook asset per conversation and governance project;
- `pm_conversation_egress_review_events`: append-only human review evidence for a conversation and registered destination.

The governed asset remains the source for classification, residency, retention, tenant scope, project scope, disposition, and allowed purposes. The binding points to that asset rather than duplicating those values.

A binding is anchored to an actual `comind.cm_conversation` with an `ON DELETE RESTRICT` foreign key.

## Authority and access boundary

The binding and review tables are private, RLS-enabled, and covered by restrictive deny-all policies. `PUBLIC`, `anon`, `authenticated`, and `service_role` receive no table privileges.

Binding and review mutation functions are administrative only. They are not executable by `anon`, `authenticated`, or `service_role`.

The server role receives only `EXECUTE` on `comind_pm.resolve_conversation_execution_governance(text,uuid,text)`. The resolver is `SECURITY DEFINER` in the private `comind_pm` schema with an explicit search path and returns only structured governance attributes.

The `conversation_asset_key(uuid)` helper also pins its `search_path` and is not executable by application roles. This hardening was added after the first live Test advisor pass identified the helper as a new mutable-search-path warning. The follow-up advisor pass returned the mutable-search-path count to the pre-change baseline.

Raw prompts, passwords, tokens, API keys, authorization headers, credentials, key material, and other forbidden governance-context keys are rejected from binding/review metadata by the existing RuleBook sensitive-key guard.

## Binding semantics

`bind_conversation_governance` requires:

- a registered governance project;
- an existing conversation;
- non-null conversation `org_id` and `project_id`;
- an active registered classification;
- registered residency and retention profiles;
- an explicit purpose.

Tenant and project scope are derived from the stored conversation row:

- `tenant_key = org:<org_id>`
- `project_scope_key = project:<project_id>`

They are never accepted from the assistant request.

Rebinding the same conversation with the same authority is idempotent. Conflicting classification, scope, purpose, profiles, or disposition fail closed.

## Egress review semantics

Human egress review is append-only. An approval must have a future expiry. A denial cannot carry an expiry. The latest event for the binding and destination controls the resolved review state.

Resolver states are:

- `pending`: no review exists;
- `approved`: latest event is approved and unexpired;
- `expired`: latest event was approved but has elapsed;
- `denied`: latest event is denied.

Only `approved` resolves `human_approved=true`.

## Runtime resolver contract

The server adapter calls the private database resolver and validates:

- exact conversation identity;
- exact destination identity;
- asset identity `conversation:<conversation_id>`;
- matching source/target tenant scope;
- matching source/target project scope;
- non-negative classification rank;
- review-state and approval consistency;
- mandatory expiry for approved egress;
- absence of undeclared result fields.

It converts the result only into static RuleBook execution context. It intentionally does not manufacture C11 observations such as `untrusted_input`, `asks_for_secrets`, or `authority_escalation`.

## Repository acceptance proof

The exact-head PostgreSQL 17 and Node 24 proof establishes:

1. migrations are idempotent across two passes;
2. both private tables have RLS and restrictive deny-all policies;
3. no client/server table grants leak;
4. only the server resolver is executable by `service_role`;
5. binding requires a real, explicitly scoped conversation;
6. binding is idempotent;
7. an unbound conversation cannot resolve;
8. an unreviewed binding resolves pending and unapproved;
9. a denial resolves denied and unapproved;
10. a time-bounded approval resolves approved and approved;
11. resolved static context passes DRULE-C17 and DRULE-C13 for the registered Test OpenAI destination;
12. unbounded approval is rejected;
13. raw-sensitive metadata is rejected;
14. review evidence is append-only;
15. conversation scope drift after binding causes resolver failure;
16. unscoped conversations cannot be silently bound;
17. the TypeScript server adapter rejects malformed, contradictory, or expanded resolver output;
18. the conversation asset-key helper has a pinned search path and no application-role execute grant.

Broad repository CI and the provider, FinOps/governance, budget-authority, DRB, and Foundry regression workflows also passed on the pre-advisor-hardening candidate. Final exact-head verification is required again after the search-path hardening commit.

## Live Supabase Test proof

The four migration stages were applied to Supabase Test. A rollback-only synthetic proof then used a real CoMind Test organization/project scope and verified the same authoritative lifecycle against the deployed functions:

- unbound resolution fails closed;
- first bind creates the governed asset and binding;
- repeat bind is idempotent;
- pending review resolves `human_approved=false`;
- denial resolves `human_approved=false`;
- bounded approval resolves `human_approved=true` with expiry;
- the resolved tenant/project context passes DRULE-C17;
- the resolved asset/destination/purpose/approval context passes DRULE-C13;
- unbounded approval is rejected;
- raw-sensitive metadata is rejected;
- review evidence cannot be updated;
- changed conversation project scope is detected as drift and rejected;
- a conversation without org/project scope cannot be bound.

The proof transaction was rolled back. Post-proof readback showed zero synthetic conversations, zero synthetic bindings, zero synthetic governed assets, and zero synthetic review events.

Persistent Test readback after rollback:

- both new private tables have RLS enabled;
- two restrictive deny-all policies are present;
- `service_role` can execute only the resolver, not bind or review mutation functions;
- `anon` and `authenticated` cannot execute the resolver;
- conversation FK and approval-expiry constraint are present;
- zero persistent conversation bindings and zero persistent review events exist because no legacy conversation has yet been assigned authoritative scope.

Security advisor comparison after hardening matches the pre-change counts for the relevant findings. No new conversation-governance security finding remains. Performance advisor output contains no unindexed foreign key for either new table. Newly created covering indexes are reported as unused because the authoritative tables are intentionally empty after rollback.

## Existing-data finding

At inspection and post-deployment readback on 2026-10-29, Supabase Test contained 10 `comind.cm_conversation` rows and none had both `org_id` and `project_id` populated. This milestone does not invent scope for those records. They remain unbound until a separate evidence-backed scope/backfill decision is made.

## Activation boundary

This milestone is infrastructure and Test evidence only. The ordinary assistant OpenAI path remains unchanged.

Before assistant activation, CoMind still needs a governed C11 trust-boundary observation mechanism and a deliberate strategy for legacy unscoped conversations. Once activation is enabled, a missing or invalid binding should fail closed rather than fall back to caller-supplied or guessed governance context.
