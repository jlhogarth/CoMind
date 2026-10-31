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

DRULE-005 owns shared RuleBook operational-preflight changes to `MdoOrchestrator.enqueuePlan()` and Foundry execution. MDO-003 is additive to that accepted runtime and does not fork the RuleBook or Foundry control plane.

## Reuse decisions

MDO-003 reuses:

- MDO-001 canonical module, plan, task, contribution schema and phase gates;
- MDO-002 `mdo` adapter, bounded context projection, evidence contract, and planning worker;
- canonical Foundry profiles, grants, authorization, runtime, terminal evidence, recovery, and fenced leases;
- VE-LIFE-002 exact Supabase Test target guard and certificate posture;
- CE-003 `scanMissingness` and `persistMissingnessFindings` for evidence-backed pre-execution missingness review;
- canonical `cm_evidence` and `cm_audit_log` rather than a new acceptance ledger;
- local `ollama_local / qwen3:0.6b` only.

MDO-003 creates no new table and no new provider or authority plane. During persistent Test recovery it adds one bounded compatibility migration that hardens the existing MDO claimant to enforce canonical Foundry exact-plan grant scope.

## Durable Test identities

The harness creates or reuses only explicitly labeled Test identities in the canonical registries:

- one service actor: `mdo003-test-authority`;
- one project: `MDO Persistent Test Acceptance`, source `github:issue:370`;
- one module: `MDO-003 Test Planning Fixture`, source `github:issue:370#module-fixture`;
- five reusable C1 Test worker profiles: analyzer, researcher, reviewer, synthesizer, portfolio coordinator.

The Test module exists to prevent acceptance evidence from being attached to a real product module. Its lifecycle starts at `conceived` and MDO-003 must not change it.

Worker profiles persist as Test identities. Execution authority does not. Every acceptance run creates a new exact-plan C1 isolated grant with a 45-minute expiry and a capability-specific task ceiling of 3, 2, 3, 1, and 1. Foundry evaluates those ceilings against the exact plan target reference, so they are per-plan execution ceilings. The harness revokes all five grants after the proof and verifies zero remain active.

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
- isolated PostgreSQL proof that the exact-plan claimant hardening is idempotent and preserves client-role restrictions;
- live canonical Supabase Test proof on the exact PR head;
- local Ollama only and zero paid-provider cost;
- both negative authorization proofs fail closed at the intended authorization boundaries;
- CE-003 returns `proceed` or `proceed_with_attention` with no blocking finding;
- all ten roles and durable readback invariants pass;
- run grants are revoked after proof;
- No Placeholder, Implementation Integrity, Integrity Governance, Foundry, provider, budget, DRB, and broad CI regressions pass;
- final current-main collision/freshness review is clean;
- Production remains unchanged.

## Recovery evidence 1: persistent Test terminal-alignment drift

The first persistent Supabase Test acceptance run, GitHub Actions run `41044987494` on pre-DRULE MDO-003 head `0c5e9b25d7ace8b4f0632117b6740e78c758f24e`, passed the repository contract job and failed during the live role chain when the first successful Foundry execution attempted to submit its MDO contribution.

The failure was traced to durable Test deployment drift, not to Ollama, Foundry authorization, RuleBook preflight, or lease fencing. Supabase Test still had the MDO-001-era `comind.cm_mdo_submit_contribution(...)` definition requiring `execution_context.closed_at`, while accepted MDO-002 had replaced that gate with canonical terminal evidence in `cm_foundry_execution_outcome` plus the matching `cm_foundry_adapter_operation_result`.

The already-accepted MDO-002 migration `20261029_010_mdo_002_foundry_terminal_alignment.sql` was promoted to the canonical CoMind Supabase Test project only. No Production database was changed. Independent Test readback after migration proved:

- matching adapter-operation-result evidence is required;
- a successful Foundry execution outcome is required;
- the legacy `ec.closed_at IS NOT NULL` requirement is absent;
- `anon` and `authenticated` cannot execute the security-definer contribution function;
- `service_role` retains the intended execution privilege.

The failed MDO-003 candidate retained its durable provenance. Its five historical run-scoped capability grants remain recorded, and independent readback confirmed zero active grants after cleanup.

## DRULE-005 reconciliation

DRULE-005 PR #371 merged at `ca6e64179fd60ccdc54087af01abd8b5a4014e16` and is the accepted shared RuleBook operational-authority path for MDO and Foundry execution. MDO-003 was reconciled on top of that accepted runtime without restoring or forking its older runtime view.

The reconciliation used current `main` as first parent and preserved the MDO-003 line as second parent. Shared RuleBook, MDO runtime, MDO orchestrator, Foundry runtime, provider runtime, and other control-plane code all come from accepted `main`.

## Recovery evidence 2: exact-plan work-claim scope

The next persistent acceptance proof, GitHub Actions run `41046681755`, passed the exact-head contract job and reached the first negative authorization proof. The expired authorization was expected to fail as `authorization_expired`, but Foundry returned `grant_not_valid` first.

Forensics showed that the MDO claimant had leased a ready task from an older retained failed plan while the new run's capability grant correctly named only the current plan in canonical Foundry `scope.target_refs`. The later Foundry runtime therefore rejected the old-plan task because it was outside the current grant scope. Safety was preserved, but the claimant had selected work that the canonical execution gate could never authorize.

The stale plan and task were not deleted. Their durable failure evidence remains part of Test provenance.

Root cause: the accepted MDO-001 database claimant enforced project, capability, phase gating, and its historical optional `module_ids` restriction, but it did not enforce Foundry's canonical exact-target `target_refs` restriction during lease selection.

Repair: migration `20261030_024_mdo_003_plan_scoped_claim_hardening.sql` replaces only `comind.cm_mdo_claim_work(...)` and adds fail-closed exact-plan `target_refs` enforcement before a lease can be taken. It preserves the accepted `module_ids` restriction for backward compatibility, preserves phase gating, retries, lease fencing, authority ceilings, and client-role restrictions, and introduces no new authority.

The paired verifier `verify_20261030_024_mdo_003_plan_scoped_claim_hardening.sql` requires:

- canonical `target_refs` scope handling;
- a non-empty array when that restriction is present;
- exact current-plan membership;
- preserved `module_ids` compatibility;
- no `anon` or `authenticated` execute privilege;
- continued `service_role` execution privilege.

GitHub Actions run #7 on head `0bd0b33f0ab5c3544ab2cd0b313ef17f52cd23f3` proved the migration in isolated PostgreSQL 17 after rebuilding the accepted MDO-001 substrate. The migration applied successfully twice and the verifier passed. The same head's MDO harness contract also passed dependency audit, TypeScript build, harness syntax, deterministic MDO runtime/context tests, and CE-003 regression.

After that isolated proof, migration `024` was promoted to canonical Supabase Test only. Direct Test readback proved `target_refs` enforcement, empty-list fail-closed behavior, exact plan membership, legacy `module_ids` compatibility, denied client execution, and intended `service_role` execution. Independent grant readback showed ten historical MDO-003 grants retained and zero active grants before the next acceptance attempt.

No Production database, provider, deployment, or paid service was changed.

## Workflow freshness control

The MDO-003 workflow originally allowed superseded PR heads to remain queued in a non-cancelling concurrency group. That delayed current-head acceptance without adding evidence value. The workflow now uses a PR-scoped concurrency group with `cancel-in-progress: true`. Superseded runs remain visible in GitHub Actions as cancelled evidence, while only the newest exact PR head is eligible to continue through the live Test gate.

Current disposition: RETEST REQUIRED. The next exact-head persistent Supabase Test run must prove the intended `authorization_expired` and `authorization_scope_mismatch` negative paths, then complete all ten local Ollama roles and durable invariants before PR #374 can be accepted or merged.
