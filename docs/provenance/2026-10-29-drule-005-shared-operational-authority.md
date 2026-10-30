# DRULE-005 shared operational RuleBook authority provenance

Date: 2026-10-29
Issue: #331
Environment: repository plus Supabase Test evaluation only
Production activation: false
Paid provider use: none

## Purpose

DRULE-005 makes the Durable RuleBook a shared fail-closed operational authority substrate for consequential execution across Foundry, Virtual Employee lifecycle operations, and MDO plan creation while preserving each subsystem's existing authorization, budget, idempotency, fencing, and recovery controls.

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
2. Existing provider, Foundry, VE, and MDO kernel regressions.
3. Full non-database server regression suite.
4. Broad repository CI and inherited implementation-integrity/no-placeholder gates.
5. Supabase Test read-only/evaluation proof using `record=false`, with before/after RuleBook decision-count reconciliation.
6. No paid execution, cost receipt, or budget reservation change.
7. Final current-main collision review.
8. Expected-head merge only after every returned exact-head workflow is green.
