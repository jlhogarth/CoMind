# MDO-003 Governed Persistent Test Planning Activation

Date: 2026-10-30
Issue: #370
Predecessor: MDO-002, PR #334, merge `1abc83cf45fc8312b15048d2a14d9a214d25c285`
Environment: canonical CoMind Supabase Test plus local Ollama
Production activation: false
Paid-provider authorization: false

## Purpose

MDO-002 proved the provider-neutral ten-role planning chain in a rollback-only PostgreSQL fixture. MDO-003 moves the same accepted runtime into durable CoMind Test evidence while preserving the existing identity, authority, work, fencing, evidence, provider, Continuous Excellence, and lifecycle control planes.

## Collision boundary

DRULE-005 owns shared RuleBook operational-preflight changes to `MdoOrchestrator.enqueuePlan()` and Foundry execution. MDO-003 is additive and does not modify that runtime seam. If DRULE-005 merges before MDO-003 acceptance, MDO-003 must reconcile to current `main` and reuse the accepted preflight contract rather than fork it.

## Reuse decisions

MDO-003 reuses:

- MDO-001 canonical module/plan/task/contribution schema and phase gates;
- MDO-002 `mdo` adapter, bounded context projection, evidence contract, and planning worker;
- canonical Foundry profiles, grants, authorization, runtime, terminal evidence, recovery, and fenced leases;
- VE-LIFE-002 exact Supabase Test target guard and certificate posture;
- CE-003 `scanMissingness` and `persistMissingnessFindings` for evidence-backed pre-execution missingness review;
- canonical `cm_evidence` and `cm_audit_log` rather than a new acceptance ledger;
- local `ollama_local / qwen3:0.6b` only.

No database schema or Production runtime change is required by the initial MDO-003 implementation.

## Durable Test identities

The harness creates or reuses only explicitly labeled Test identities in the canonical registries:

- one service actor: `mdo003-test-authority`;
- one project: `MDO Persistent Test Acceptance`, source `github:issue:370`;
- one module: `MDO-003 Test Planning Fixture`, source `github:issue:370#module-fixture`;
- five reusable C1 Test worker profiles: analyzer, researcher, reviewer, synthesizer, portfolio coordinator.

The Test module exists to prevent acceptance evidence from being attached to a real product module. Its lifecycle starts at `conceived` and MDO-003 must not change it.

Worker profiles persist as Test identities. Execution authority does not. Every acceptance run creates a new exact-plan C1 isolated grant with a 45-minute expiry and a capability-specific task ceiling of 3, 2, 3, 1, and 1. The harness revokes those five grants after the proof and verifies zero remain active.

## Authorization boundary

Authorization issuance remains separate from worker execution. The harness writes explicit Foundry authorization requests and decisions as Test governance evidence before enqueue or role execution. The worker path receives only a decision identifier and cannot mint authority for itself.

Before positive execution, the live proof must demonstrate two fail-closed paths:

1. an expired exact-task authorization is rejected before any execution context or contribution is created;
2. an approved authorization with a mismatched plan target is rejected before any execution context or contribution is created.

In both cases the lease is released through the existing fenced failure path and becomes claimable again within the existing three-attempt MDO allowance.

## CE-003 preflight

After the governed plan is enqueued and before inference/contribution execution, the harness runs CE-003 against explicit evidence for:

- dependencies and prerequisites;
- authority and approval state;
- assumptions confidence;
- rollback and recovery;
- observability and evidence;
- testing and acceptance;
- security and data integrity;
- reversibility;
- reuse of MDO-002, VE-LIFE-002, and CE-003;
- local-provider and Test-only boundaries.

A blocking CE-003 decision stops the role chain. The scan fingerprint, request, result, finding persistence result, and evidence references are stored in canonical `cm_evidence` with source type `mdo_test_preflight`. CE signals remain owned by CE-003 and are created only through its accepted persistence function when findings exist.

## Durable acceptance chain

The positive run must execute all ten canonical roles through:

`C1 scoped grant -> capability-aware lease -> exact authorization -> Foundry runtime -> mdo adapter -> local Ollama -> canonical inference evidence -> MDO contribution -> fenced lease completion -> task done`

Independent readback must prove:

- 10 contributions;
- 10 contribution-to-evidence links;
- 10 completed leases;
- 10 provider inference-evidence rows;
- 10 done tasks;
- 10 successful execution contexts;
- 10 MDO contribution audit rows;
- exact local provider/model provenance;
- plan status remains `in_review`;
- module lifecycle remains `conceived`;
- replay of the plan idempotency key returns the same plan and changes none of those counts;
- run-scoped grants are revoked afterward.

The two negative authorization decisions are additional provenance and do not create execution contexts.

## Supabase target guard

The live harness refuses any database URL not matching the canonical CoMind Test session pooler target:

- host `aws-0-us-east-1.pooler.supabase.com`;
- user `postgres.sbgfuanxiqepcoboxzcl`;
- database `postgres`;
- port 5432;
- TLS certificate verification enabled.

It also reads back database name, user, PostgreSQL major version, and transaction read/write state before any fixture provisioning.

## Current Supabase compatibility review

Supabase's current breaking-change notices include enforcement that new tables are not automatically exposed to the Data API and a November 2026 removal of outdated TLS 1.2 CBC ciphers. MDO-003 creates no new table and uses a modern Node 24 PostgreSQL TLS client with certificate verification, so neither change requires a new exposure grant or weaker TLS configuration.

## Recovery and retention

MDO-003 never deletes acceptance provenance. Failed candidate plans remain durable Test history. A later accepted run may supersede prior candidate evidence through an explicit governed action, but deletion is not part of this lane.

Run-scoped capability grants are revoked in a `finally` cleanup path. Persistent Test worker identities remain non-cost-bearing, isolated, and powerless to execute MDO work without a new exact-plan grant and a separate authorization decision.

## Acceptance gate

Merge requires:

- one issue, branch, and PR;
- exact-head syntax, TypeScript build, MDO deterministic tests, bounded-context regression, and CE-003 regression;
- live canonical Supabase Test proof on the exact PR head;
- local Ollama only and zero paid-provider cost;
- both negative authorization proofs fail closed;
- CE-003 returns `proceed` or `proceed_with_attention` with no blocking finding;
- all ten roles and durable readback invariants pass;
- run grants are revoked after proof;
- No Placeholder, Implementation Integrity, Integrity Governance, Foundry, provider, budget, DRB, and broad CI regressions pass;
- final current-main collision/freshness review is clean;
- Production remains unchanged.
