# VE-LIFE-002 Governed VE Lifecycle Test Harness

Date: 2026-10-30
Issue: #369
Environment: Test only
Production activated: false
External provider mutation: false
Paid API used: false

## Objective

Provide a reusable execution surface for `VeLifecycleCoordinator.transition()` so lifecycle acceptance exercises the actual application coordinator instead of substituting direct SQL state changes.

## Development Contract application

The lane was created only after a freshness and collision check against current `main`. It reuses the existing Foundry lifecycle coordinator, authorization tables, audit log, Test Supabase connection secret, exact Test pooler identity check, Supabase CA fingerprint verification, and GitHub Actions evidence pattern.

No new lifecycle registry, authorization system, identity model, provider adapter, or database schema is introduced.

## Separation of duties

The reusable harness consumes an existing authorization decision. It does not mint or approve authority.

Authorization issuance remains a separate governed operation in the existing Foundry authorization substrate. This prevents a lifecycle executor from granting itself the authority it consumes.

The issue #369 acceptance authorization was created separately under Joseph Hogarth's explicit instruction to run the expired negative proof, mint a fresh bounded C2 isolated authorization, and perform the positive proof.

## Safety boundary

The harness refuses any database connection that is not the exact CoMind Test Supabase session pooler target. It verifies PostgreSQL 17 or newer and a writable Test session before execution.

Every invocation requires:

- exact lifecycle action;
- exact Foundry profile UUID;
- exact requesting actor UUID;
- exact existing authorization decision UUID;
- reason;
- idempotency key;
- expected starting state;
- expected ending state or expected governed error code.

The harness independently requires the authorization envelope to be C2, isolated, target `foundry_agent_profile`, and tied to the requested profile and actor before calling the coordinator.

No provider lifecycle adapters are registered. By default, the harness refuses profiles whose canonical actor has any external provider resource. This keeps the generic lifecycle acceptance surface separate from later provider-specific Google acceptance.

## Authorization semantics

The harness deliberately does not pre-judge authorization expiry. Expiration is evaluated by `VeLifecycleCoordinator.assertLifecycleAuthorization(...)`, preserving the application control under test.

For an expected governed rejection, acceptance requires:

- the exact expected `VeLifecycleError` code;
- unchanged profile lifecycle state;
- unchanged lifecycle audit count.

For a successful transition, acceptance requires:

- coordinator result `succeeded`;
- expected ending state;
- exactly one terminal lifecycle audit for the supplied idempotency key;
- terminal audit authorization decision identity equal to the supplied decision.

## Issue #369 bootstrap proof

The synthetic fixture remains provider-free and uses profile:

`57a3f546-2e01-4499-b677-fc59b9ad5412`

The negative proof uses expired decision:

`9867a158-5bcf-4485-813d-ed9ca9682891`

Expected result:

`authorization_expired`, profile remains `draft`, zero lifecycle audit mutation.

The positive proof uses the separately minted bounded authorization decision recorded in the issue #369 acceptance test. Expected result:

`draft -> active`, coordinator status `succeeded`, one `ve.lifecycle.started` event and one `ve.lifecycle.completed` event, with exact authorization and idempotency provenance.

The acceptance script is replay-safe. Once the synthetic profile is active, a rerun verifies the unique accepted terminal audit instead of minting authority or attempting a second activation.

## Reuse for Scout and future VEs

After merge, the `VE Lifecycle Test Acceptance` workflow exposes `workflow_dispatch` inputs for any future provider-free Test VE lifecycle proof. The caller must supply an already-issued authorization decision.

Provider-specific lifecycle testing is intentionally separate. Scout's later Google Workspace test will require a Google lifecycle adapter and its own explicit provider acceptance boundary rather than weakening this provider-free harness.

## Evidence

Each live execution writes a machine-readable JSON artifact containing the authorization snapshot, before/after lifecycle state, coordinator result or governed error, terminal audit evidence, and explicit boundary statements. GitHub Actions retains the artifact for 30 days.

Repository provenance plus durable database audit evidence remain authoritative after the transient workflow artifact expires.
