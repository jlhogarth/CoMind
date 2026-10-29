# DRULE-003 mandatory RuleBook governance for normal assistant execution

Date: 2026-10-29
Issue: #318
Pull request: #319
Environment: repository CI and Supabase Test only
Production activation: false
Paid provider call: none

## Objective

Make the normal configured assistant execution route unable to bypass the Durable RuleBook when `ASSISTANT_PROVIDER=openai`.

The acceptance claim is intentionally stronger than the CGA-002 canary. CGA-002 proved a governed adapter can work. DRULE-003 changes the normal configured provider factory so it can construct only governed OpenAI assistant providers.

## Enforced construction path

`server/src/assistant-provider.ts` no longer imports or calls `createOpenAIAssistantProvider` and does not instantiate `OpenAIAssistantProvider`.

When OpenAI is enabled, the configured provider composes:

1. `GovernedOpenAIAssistantProvider`;
2. authoritative conversation governance resolution;
3. deterministic DRULE-C11 observation;
4. database DRULE-C11, DRULE-C17, and DRULE-C13 preflight;
5. OpenAI input-token preflight only after RuleBook allow;
6. `CurrentRuntimeProviderBudgetAuthority`;
7. `CurrentRuntimePaidApiLedger`;
8. provider execution only after all preceding gates allow/admit.

The metered quality gate uses the same governed construction function for draft, verifier, and repair roles. Each pass retains the original conversation ID, so each pass resolves the same authoritative conversation governance state rather than accepting caller-supplied classification, tenant, project, or egress authority.

## Fail-closed configuration

`server/src/env.ts` now requires, when `ASSISTANT_PROVIDER=openai`:

- `OPENAI_API_KEY`;
- `OPENAI_PAID_API_BINDING_ID` as a UUID;
- `OPENAI_PAID_API_PROPOSAL_ID` as a UUID;
- `OPENAI_MAX_RETRIES=0`.

Missing paid authority identities or nonzero automatic retries prevent normal OpenAI assistant configuration from starting. Configuration references existing paid authority; it does not create or approve paid authority.

`server/.env.example` and README configuration are aligned to this contract.

## Legacy live smoke boundary

The historical `scripts/verify_openai_live.sh` path predated authoritative conversation governance and could create an arbitrary conversation before making a provider request. DRULE-003 disables that script fail-closed rather than preserving an obsolete operational bypass.

A future real-provider proof must be separately reviewed and must use an explicitly governed synthetic conversation, current egress approval, a separately approved paid-access proposal/binding, and zero automatic retries before any token-count or model request.

The paid-test preflight library remains tested as a reusable bounded component. Its former smoke-script integration assertion was deliberately replaced with an assertion that the legacy script is retired, exits nonzero, contains no `/assistant-response` trigger, and does not masquerade as an executable paid-preflight path.

## Normal HTTP route proof

`server/test/configured-assistant-rulebook.test.mjs` exercises the actual normal HTTP endpoint:

`POST /api/conversations/:id/assistant-response`

using a provider produced by `createConfiguredAssistantProvider()` and the real `GovernedOpenAIAssistantProvider` class.

The proof establishes:

- a secret-disclosure request denied by DRULE-C11 returns through the normal provider-failure path with zero token-count calls, zero budget reservations, and zero provider calls;
- an approved benign request that passes C11/C17/C13 reaches a deliberately denying synthetic budget authority with one local token preflight, one budget call, and zero provider calls;
- the configured provider source contains no direct OpenAI assistant provider constructor;
- the metered quality gate constructs only governed `draft`, `verifier`, and `repair` providers.

The first dedicated exact-head DRULE-003 workflow passed these contracts on the implementation branch before live Test evidence was collected.

## Supabase Test live evidence

No DRULE-003 schema migration was required.

Existing synthetic governed conversation:

- conversation ID: `c9a20000-0000-4000-8000-000000000002`;
- classification: `INTERNAL` / rank 10;
- purpose: `assistant-response`;
- destination: `OPENAI-API`;
- canonical CoMind tenant/project scope;
- egress review: `approved`;
- review expiry: `2026-10-30T06:32:23.164775+00:00`.

Authoritative resolver readback succeeded. Evaluation-only RuleBook calls (`record=false`) returned:

- DRULE-C11: `allow`, reason `TRUST_BOUNDARY_ACCEPTABLE`;
- DRULE-C17: `allow`, reason `SAME_SCOPE`;
- DRULE-C13: `allow`, reason `EGRESS_AUTHORIZED`.

No prompt text, token-count API, provider API, or paid execution was used for this live database proof.

### Paid-state before and after

Before live RuleBook evaluation:

- `comind.cm_paid_api_execution`: 0 rows;
- `comind.cm_api_cost_receipt`: 0 rows;
- `comind.cm_budget_authority_reservation`: 0 rows.

After live RuleBook evaluation:

- `comind.cm_paid_api_execution`: 0 rows;
- `comind.cm_api_cost_receipt`: 0 rows;
- `comind.cm_budget_authority_reservation`: 0 rows.

Therefore DRULE-003 live acceptance created no paid-provider state.

## Cross-lane regression found and repaired

The first documentation-complete candidate caused the existing `Foundry Runtime Orchestration` workflow to fail during its broad `server` test suite. Foundry schema/runtime verification had already passed. The single failing test was `server/test/openai-paid-test-preflight.test.mjs`, which still asserted that the retired `scripts/verify_openai_live.sh` contained both the paid preflight invocation and `/assistant-response` provider trigger.

This was a stale test contract, not a Foundry runtime failure. Restoring the provider trigger would have reintroduced the exact obsolete bypass DRULE-003 is intended to remove.

The repair therefore:

- keeps the legacy live smoke script disabled fail-closed;
- updates the stale test to require the disabled state and absence of any assistant provider trigger;
- preserves the reusable paid-preflight library unit tests;
- adds `server/test/openai-paid-test-preflight.test.mjs` to the dedicated DRULE-003 workflow path triggers and exact-head test command.

Fresh exact-head CI after this repair is required before merge, including a successful Foundry Runtime Orchestration run.

## Advisor readback

DRULE-003 introduces no database objects. Supabase Test advisors were still reviewed after the live proof.

Security baseline at review time:

- 54 informational `rls_enabled_no_policy` findings across existing schemas;
- 8 pre-existing mutable-search-path function warnings;
- 2 pre-existing anonymous `SECURITY DEFINER` RPC warnings;
- 2 corresponding authenticated-role RPC warnings.

Performance baseline at review time:

- 155 existing unindexed foreign-key informational findings;
- 153 existing unused-index informational findings;
- 2 existing multiple-permissive-policy warnings on Conversation History reconciliation reads.

No DRULE-003 schema object appears in either advisor set because this slice is application/configuration enforcement only. Advisor remediation remains separately owned; DRULE-003 does not broaden database privileges to hide those findings.

Supabase remediation reference: https://supabase.com/docs/guides/database/database-linter

## Recovery

Repository rollback is the inverse of the DRULE-003 application/configuration commits. No database rollback is required because no schema/data mutation was introduced by this slice.

Rollback must not reactivate the legacy ungoverned paid smoke path as an operational shortcut. If governed assistant execution cannot be maintained, the safe runtime configuration is `ASSISTANT_PROVIDER=disabled`.

## Remaining boundary

DRULE-003 does not authorize Production activation or a real paid provider call. A later Production/C4 review must separately prove identities, secrets, TLS, RLS/grants, operator recovery, policy-version compatibility, monitoring, rollback, and paid execution authority.
