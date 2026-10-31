# MDO-001 Governed Module Development Orchestrator Foundation

Date: 2026-10-29
Issue: #313
Governance tier: T2 consequential cross-agent state in isolated development
Production activation: false

## Purpose

MDO-001 creates a thin orchestration layer that turns the existing CoMind module catalog into bounded, evidence-bearing planning work for Foundry agents. It does not create a second agent runtime, second project registry, second work queue, or second evidence store.

The first authority envelope is planning and review only. MDO-001 does not authorize autonomous implementation, merge, deploy, destructive action, paid-provider use, production mutation, or module maturity promotion.

## Composition decisions

MDO-001 reuses:

- `comind.cm_module_registry` as the canonical module identity registry.
- `comind.cm_project` as canonical project identity.
- `comind.cm_task` as canonical work identity.
- `comind.cm_foundry_work_lease` as the fenced work lease kernel.
- `comind.cm_foundry_agent_profile` as canonical agent and VE runtime profiles.
- Foundry capability grants and authorization requests/decisions for authority.
- Foundry execution contexts and outcomes for governed execution lineage.
- `comind.cm_evidence` for evidence identity.
- `comind.cm_audit_log` for durable lifecycle and orchestration audit events.
- The VE lifecycle coordinator merged in PR #301.

The original One-Shot v2 module registry is adopted and hardened instead of replaced. Existing module names remain intact. MDO-001 does not invent module codes for legacy rows.

## Genuine gap and bounded extension

The existing generic work-lease claimant is capability-blind. If MDO tasks were inserted without additional controls, an unrelated service worker could lease a planning task before the Foundry runtime rejected execution.

MDO-001 closes only that gap:

1. MDO tasks are excluded from the legacy generic claimant.
2. `cm_mdo_claim_work` can lease MDO tasks only for an active Foundry profile that has an active, unexpired, isolated, project-compatible grant for the task's required capability.
3. Optional grant scope can restrict the grant to explicit module IDs.
4. Phase gates prevent reviewers and synthesizers from running before prerequisite contributions exist.
5. Existing non-MDO lease behavior is otherwise unchanged.

## Planning colony

The canonical planning roles are:

1. Module Planner
2. Architecture Analyst
3. External Capability Scout
4. Lessons-Learned Analyst
5. Dependency Analyst
6. Governance Reviewer
7. Assumption Validator
8. Integration Reviewer
9. Plan Synthesizer
10. Portfolio Coordinator

Roles map to Foundry capabilities rather than a new agent registry.

The first five roles form the discovery and analysis phase. Governance, assumption, and integration review become lease-eligible only after all first-phase contributions exist. Plan synthesis becomes eligible after all eight prior contributions exist. Portfolio review becomes eligible after synthesis.

## Capability boundaries

MDO-001 registers but does not grant:

- `mdo.plan.orchestrate`
- `mdo.plan.analyze`
- `mdo.plan.research`
- `mdo.plan.review`
- `mdo.plan.synthesize`
- `mdo.plan.portfolio`

Each MDO capability is non-cost-bearing and capped at C1.

MDO-001 also registers the three capabilities required by the merged VE lifecycle coordinator:

- `ve.lifecycle.activate`
- `ve.lifecycle.suspend`
- `ve.lifecycle.retire`

Those lifecycle capabilities are capped at C2 and are not granted by this migration.

## Orchestration authorization

`cm_mdo_enqueue_plan` is a narrow security-definer function with a pinned `pg_catalog` search path. It requires an existing approved Foundry decision with all of these exact properties:

- capability `mdo.plan.orchestrate`
- requesting actor match
- project match
- C1 authority
- isolated environment
- target kind `module`
- target reference equal to the exact module UUID
- active request
- unexpired request and decision

The function is idempotent. A reused idempotency key is accepted only when its full orchestration envelope matches the existing plan.

The function creates one plan, ten canonical `cm_task` rows, ten MDO task mappings, and ten Foundry lease rows. It does not create agent profiles, capability grants, authorization decisions, provider requests, or maturity transitions.

## Contribution lineage

`cm_mdo_submit_contribution` accepts output only when it can prove a succeeded, closed Foundry execution context that matches the exact:

- profile
- task
- project
- required capability
- isolated environment
- C1 authorization request
- module-plan target
- approved decision valid at execution time

Contributions are immutable and idempotent. Evidence links point to existing `cm_evidence` rows rather than copying evidence into a parallel store.

## Maturity boundary

The adopted module lifecycle vocabulary is:

`conceived -> specified -> prototyped -> implemented -> integrated -> operational -> deprecated`

MDO-001 does not implement automatic maturity promotion. Creating a plan or submitting a contribution leaves `cm_module_registry.lifecycle_stage` unchanged. Stage promotion remains a separately governed acceptance operation.

## Security and privacy

Authoritative MDO tables have RLS enabled and client-role privileges revoked. Narrow service-role execution is granted only to the orchestration, capability-aware claim, and contribution functions.

Security-definer functions pin `search_path=pg_catalog` and use fully qualified authoritative objects.

The audit trail stores identifiers, authority, environment, task counts, role codes, and idempotency references. It does not copy raw model prompts, credentials, secrets, or provider payloads into governance telemetry.

## Standards and control traceability

Relevant guidance and controls:

- CoMind RuleBook trust-boundary, scope, egress, and authority controls.
- GOV-001 tiered governance policy.
- ISO/IEC 42001 management-system traceability principles.
- ISO/IEC 23894 AI risk-management principles.
- NIST AI RMF governance and measurement concepts.
- NIST SP 800-53 least privilege and audit principles.
- OWASP agentic security guidance for tool/authority boundaries.
- MITRE ATLAS as applicable to agent misuse and trust-boundary threat review.

This document records engineering alignment only. It does not claim certification or comprehensive standards conformity.

## Failure and recovery

- Missing or conflicting authorization: enqueue fails before mutation.
- Duplicate idempotency key with different inputs: fails closed.
- Missing required MDO capability configuration: the transaction fails and creates no partial plan.
- Unauthorized profile claim: returns no work.
- Generic worker claim: MDO tasks are excluded.
- Worker crash: the existing lease expiry/fencing mechanism remains authoritative.
- Failed execution: contribution submission is rejected.
- Missing evidence reference: contribution transaction fails.
- Provider outage: MDO-001 itself makes no provider call.
- Migration rollback: revert the migration/branch before production consideration. Test acceptance fixtures are rollback-only or explicitly cleaned.
- Module maturity: unchanged unless a future separately governed promotion operation is accepted.

## Expected overhead

Database-only orchestration adds bounded inserts for one plan, ten tasks, ten task mappings, and ten lease rows plus small authorization/claim queries. No paid API or provider cost is introduced by MDO-001. Model/provider cost remains separately governed by existing provider and budget controls.

## Verification contract

Acceptance requires:

- PostgreSQL 17 isolated migration proof.
- migration reapplication proof for idempotency.
- exact 10-role task fanout.
- no migration-created MDO capability grants.
- generic claimant exclusion.
- unauthorized MDO claimant receives no work.
- capability-granted claimant receives only eligible work.
- synthesis blocked before prerequisite contributions.
- governed contribution lineage and immutability.
- durable audit evidence.
- module maturity remains unchanged.
- TypeScript build and unit tests.
- exact-head CI and relevant cross-lane regressions.
- Supabase Test migration/readback and security/performance advisor review before merge.

## Authority and exceptions

Founder direction in the development lane authorizes bounded development and Test changes needed to complete MDO-001 under existing CoMind governance. This does not authorize Production activation, paid-provider calls, autonomous production work, or T3 operations.

No exception is requested by MDO-001.
