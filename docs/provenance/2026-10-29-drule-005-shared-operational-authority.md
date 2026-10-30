# DRULE-005 shared operational RuleBook authority provenance

Date: 2026-10-29 through 2026-10-30
Issue: #331
PR: #371
Environment: repository plus Supabase Test evaluation only
Production activation: false
Paid provider use: none

## Purpose

DRULE-005 makes the Durable RuleBook a shared fail-closed operational authority substrate for consequential execution across Foundry, Virtual Employee lifecycle operations, and MDO plan creation while preserving each subsystem's existing authorization, budget, idempotency, fencing, and recovery controls.

## Recovery and lane provenance

This work was recovered after conversation reasoning/context loss under the canonical CoMind Development Environment Contract. Durable GitHub evidence established that DRULE-004 had already completed and merged as PR #329, while DRULE-005 remained the sole unfinished RuleBook milestone owned by this lane.

The interrupted DRULE-005 branch head was `36962e1dca0a33d24581872e9f7bb036d21747e1`. Recovery preserved that history rather than recreating or overwriting it.

Two ancestry-preserving reconciliation commits were used as main advanced during recovery:

- `8300bd78c6995b936057eb0dcc92892ac9a348b0`, first parent accepted VE-LIFE-002 main and second parent the interrupted DRULE-005 head;
- `3c8b6c7a4b9002ef3564983d87b2af05f749f741`, first parent accepted MDO-002 main and second parent the recovered DRULE-005 line.

No force rewrite discarded the interrupted history. Later HOME-002 changes were file-disjoint and were exercised through the PR merge-ref regression matrix.

## Architectural decision

The accepted Development Environment Contract requires adaptation before invention and discourages destabilizing rewrites of mature kernels. DRULE-005 therefore does not replace or deeply rewrite `FoundryRuntimeOrchestrator`, `VeLifecycleCoordinator`, or `MdoOrchestrator`.

Instead, it adds governed facades that:

1. resolve the subsystem's existing approved exact authorization and authoritative organization/project scope;
2. derive only bounded structured trust observations from untrusted operation input;
3. require RuleBook C11 and C17 before the mature kernel can execute;
4. optionally support C13 through the same shared operational preflight only when a caller declares a registered outbound egress boundary;
5. delegate to the existing kernel, which independently revalidates its existing authorization and safety controls.

Operational source and scripts are guarded against constructing the raw kernels outside the governed facade. Kernel-level unit and integration tests may continue to instantiate raw kernels directly to test their independent contracts.

## Reused RuleBook substrate

DRULE-005 reuses:

- `comind_pm.governance_preflight`;
- the existing `RulebookExecutionPreflightEvaluator`;
- the existing fail-closed decision validation and `RulebookExecutionPreflightError` taxonomy;
- DRULE-C11 structured trust-boundary evaluation;
- DRULE-C17 tenant/project isolation evaluation;
- DRULE-C13 egress evaluation when a real egress binding is declared.

The existing assistant/provider path continues to call the same preflight machinery and retains mandatory C11/C17/C13 enforcement.

## Shared operational preflight

`server/src/rulebook-operational-authority.ts` adds a generic operational adapter over the existing RuleBook evaluator.

For consequential internal operations it sends only:

- `untrusted_input`;
- `asks_for_secrets`;
- `authority_escalation`;
- `side_effect`;
- `human_approved`;
- source/target tenant scope;
- source/target project scope;
- action identifier.

Raw operation input, objective text, lifecycle reason text, credentials, tokens, API keys, and task payloads are not sent to the RuleBook evaluator.

The trust observer is bounded to 1,024 JSON nodes and emits only booleans. It detects secret-disclosure intent, sensitive credential-shaped fields, and common authority-escalation patterns. Unsupported object types or excessive input fail closed before RuleBook evaluation.

## Governed facades

### Foundry

`GovernedFoundryRuntimeOrchestrator` resolves exactly one active Foundry profile, capability, and approved non-expired authorization matching profile, actor, capability, project, task, authority level, environment, target kind, and target reference. It derives tenant scope from the profile organization and project scope from the authorization, requires RuleBook C11/C17, then calls the existing Foundry runtime kernel.

RuleBook denial, review, malformed decision, missing exact authorization, or preflight unavailability occurs before the delegate can create an execution context, recovery checkpoint, adapter operation, or invoke an adapter.

### Virtual Employee lifecycle

`GovernedVeLifecycleCoordinator` resolves exactly one approved non-expired C2 isolated lifecycle authorization for the requested actor/profile/action, derives organization/project scope, observes only the lifecycle reason into structured booleans, requires C11/C17, then calls the existing VE lifecycle kernel.

A RuleBook block therefore occurs before `ve.lifecycle.started` audit evidence, profile/grant mutation, pending-authorization cancellation, or external-resource adapter calls.

### MDO

`GovernedMdoOrchestrator.enqueuePlan` resolves one active project with organization scope plus the exact approved non-expired `mdo.plan.orchestrate` C1 isolated authorization for actor/project/module. It observes only the objective into structured booleans, requires C11/C17, then calls the existing `MdoOrchestrator.enqueuePlan` path.

Claiming work and contribution persistence remain delegated to the existing MDO kernel. Actual worker execution remains additionally governed through Foundry, and provider-backed research remains subject to the existing governed provider C13 path.

## Operational adoption

The existing CUX-001 Test usability agent now constructs `GovernedFoundryRuntimeOrchestrator` rather than the raw Foundry runtime. This makes an existing real Test-only operational consumer use the shared RuleBook authority path.

A static acceptance test scans operational `server/src` and `server/scripts` files and rejects direct construction of:

- `FoundryRuntimeOrchestrator`;
- `VeLifecycleCoordinator`;
- `MdoOrchestrator`.

The only allowed construction site is `server/src/rulebook-governed-runtimes.ts`.

## MDO-002 bypass discovered and repaired

The first reconciled DRULE-005 candidate exposed a real freshness regression introduced by the separately accepted MDO-002 lane. `server/src/mdo-planning-runtime.ts` had two new operational defaults that directly constructed `MdoOrchestrator`.

The dedicated DRULE-005 gate failed on that raw construction. Foundry Runtime Orchestration and DRULE-002 also failed because their broad server suites execute the same no-bypass test. The failures were preserved rather than bypassed.

The static rule was not weakened. Repair commit `ed65ba4a98351f543c5aaef8adc15c5a1fe79d99` changed both MDO-002 planning defaults to `GovernedMdoOrchestrator` and converted the raw MDO import to a TypeScript type-only import. MDO prompt construction, local Ollama routing, evidence persistence, work leases, fencing, contribution persistence, and provider-neutral behavior were otherwise unchanged.

After repair:

- DRULE-005 Shared Operational RuleBook Authority passed;
- Foundry Runtime Orchestration passed;
- DRULE-002 Successor Control Plane passed;
- the MDO-002 deterministic adapter/worker/context tests passed;
- the zero-cost ten-role local Ollama planning pilot passed and preserved its evidence;
- broad CI passed at the job level;
- CUX governed adapter, Chromium, Firefox, and WebKit desktop/mobile checks passed;
- provider, budget, Foundry lease/readiness, implementation-integrity, No Placeholder, DRB, and repository configuration checks passed.

No paid provider was used by the MDO pilot.

## Supabase Test evaluation proof

Supabase Test project: `sbgfuanxiqepcoboxzcl`.

Canonical scope used for evaluation:

- organization `CoMind, Inc.`: `997bfcdf-e42f-4757-8d1c-d0da44d26482`;
- project `COMIND`: `8ac9fab3-35df-48fb-b1df-95285fee9dc0`.

All RuleBook calls used `comind_pm.governance_preflight(..., false)`, so runtime decisions were evaluated without recording a durable decision.

Observed results:

- C11 ordinary structured consequential input: `allow`, `TRUST_BOUNDARY_ACCEPTABLE`;
- C11 secret-disclosure request: `deny`, `UNTRUSTED_SECRET_REQUEST`;
- C17 canonical same tenant/project scope: `allow`, `SAME_SCOPE`;
- C17 synthetic cross-project scope: `deny`, `CROSS_SCOPE_DENIED`.

Before and after reconciliation was exact:

- RuleBook runtime decisions: `5 -> 5`;
- paid API executions: `0 -> 0`;
- API cost receipts: `0 -> 0`;
- budget reservations: `0 -> 0`.

No Supabase schema, RLS, role grant, or Production state was changed by DRULE-005.

## Safety boundaries

DRULE-005 does not:

- activate Production;
- change RLS, grants, or schema;
- make a paid provider/model/token-count call;
- replace Foundry capability grants or authorization decisions;
- replace VE lifecycle authorization;
- replace MDO database authorization checks;
- weaken budget authority, fencing, idempotency, recovery checkpoints, or append-only evidence;
- infer an external egress destination where no authoritative destination mapping exists.

C13 remains mandatory on the governed provider path. The shared operational helper supports C13 for future non-provider egress only when an explicit trusted destination/asset binding is supplied. No permissive fallback is introduced.

## Acceptance sequence

1. Dedicated exact-head Node 24 build and shared-authority test.
2. Existing provider, Foundry, VE, MDO-001, MDO-002, and lifecycle regressions.
3. Full non-database server regression suite.
4. Broad repository CI and inherited implementation-integrity/no-placeholder gates.
5. Supabase Test read-only/evaluation proof using `record=false`, with before/after RuleBook decision-count reconciliation.
6. No paid execution, cost receipt, or budget reservation change.
7. Current-main collision review and merge-ref proof against newer accepted lanes.
8. Expected-head merge only after every substantive final-head workflow is green.

## Completion boundary

DRULE-005 is ready for final exact-head acceptance once this documentation-complete head is generated. Production activation remains outside this milestone. Historical DRULE-002 archaeology remains independently open and is not a blocker to successor operational RuleBook adoption.
