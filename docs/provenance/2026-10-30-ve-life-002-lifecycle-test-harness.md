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

Synthetic profile:

`57a3f546-2e01-4499-b677-fc59b9ad5412`

Expired authorization decision:

`9867a158-5bcf-4485-813d-ed9ca9682891`

Fresh bounded authorization decision:

`97205bf1-20b6-4da6-adc6-aeb2bba14819`

Fresh authorization request:

`c03fa3d3-54d4-4927-807f-11cf62b70b12`

Fresh authorization effective until:

`2026-10-30T11:59:22.444Z`

### Negative proof

Candidate head that performed the proof:

`e23134432dca9a7e326d2efdc80303810a3e1aaf`

GitHub Actions run:

`41041278063`

Result:

- expected error: `authorization_expired`;
- actual error: `authorization_expired`;
- profile before: `draft`;
- profile after: `draft`;
- lifecycle audits before: `0`;
- lifecycle audits after: `0`;
- external provider resources: `0`.

This proves the coordinator rejected the expired authorization before lifecycle mutation or audit-start evidence.

### Positive proof

Coordinator operation:

`9a2103d1-0f78-4081-8e43-bc98df78b931`

Idempotency key:

`ve-life-002-issue369-synthetic-activate-v1`

Result:

- coordinator status: `succeeded`;
- transition: `draft -> active`;
- activated at: `2026-10-30T10:31:13.375365Z`;
- provider reconciliation steps: none;
- external provider resources: `0`.

Durable audit evidence:

- started audit: `d2ffd8d9-ee2f-43cc-9071-9598f71791f0`;
- completed audit: `86d5bbec-b2d4-464e-8ed1-7d0fb7a698ed`;
- both carry idempotency key `ve-life-002-issue369-synthetic-activate-v1`;
- both carry authorization decision `97205bf1-20b6-4da6-adc6-aeb2bba14819`.

Independent Test database readback confirmed exactly two lifecycle audit events for the profile, `ve.lifecycle.started` followed by `ve.lifecycle.completed`, and confirmed the profile is `active`.

### Workflow artifact

Artifact ID:

`12969574699`

Artifact name:

`ve-life-002-issue369-evidence-41041278063`

Artifact digest:

`sha256:a4ce58af810a340a945bee8cbd17dcd72eda1d0c43633eba321f265f027c066b`

Artifact outcome:

`negative_and_positive_proofs_passed`

The workflow artifact is retained for 30 days. Repository provenance and durable database audit evidence remain authoritative after artifact expiry.

## Replay behavior

The issue #369 acceptance script is replay-safe. Once the synthetic profile is active, a rerun does not attempt a second activation and does not mint authority. It verifies the unique terminal audit for the accepted idempotency key and records `replay_verified` evidence.

## Reuse for Scout and future VEs

After merge, the `VE Lifecycle Test Acceptance` workflow exposes `workflow_dispatch` inputs for future provider-free Test VE lifecycle proofs. The caller must supply an already-issued authorization decision.

Provider-specific lifecycle testing is intentionally separate. Scout's later Google Workspace test will require a Google lifecycle adapter and its own explicit provider acceptance boundary rather than weakening this provider-free harness.

## Acceptance status

The candidate that performed the first live proof passed:

- exact-head lifecycle harness contract;
- dependency audit;
- TypeScript build;
- harness syntax checks;
- existing lifecycle coordinator tests;
- live expired-authorization negative proof;
- live fresh-authorization positive proof;
- machine-readable artifact preservation;
- independent Test database readback;
- Implementation Integrity;
- Integrity Governance;
- No Placeholder Policy;
- Foundry Runtime Orchestration;
- Foundry Work Lease Kernel;
- Governed Provider Execution;
- Runtime Budget Authority Adapter;
- Live Foundry LF-2 Readiness;
- Live Foundry LF-3 Readiness;
- Live Foundry Stage 1 Readiness;
- CoMind Repository Configuration;
- Lane Health Sentinel Observe;
- DRB-002 Query Contract.

Broad CI was still completing its devcontainer runtime job at the moment this evidence section was written. Final merge remains gated on exact-head CI and a final freshness/collision check.
