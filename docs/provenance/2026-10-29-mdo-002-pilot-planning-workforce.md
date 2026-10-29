# MDO-002 Pilot Planning Workforce and Provider-Neutral Execution Adapter

Date: 2026-10-29
Issue: #316
Governance tier: T2 bounded cross-agent planning execution in isolated development
Production activation: false
Paid provider authorization: false

## Purpose

MDO-002 connects the accepted MDO-001 governed planning queue to the existing Foundry execution substrate without making MDO dependent on one model vendor. The model remains a replaceable cognitive resource below CoMind identity, authority, evidence, work leasing, and continuity.

## Reuse decisions

MDO-002 composes existing authorities rather than creating parallel systems:

- `comind.cm_module_registry` remains canonical module identity.
- `comind.cm_task` and `comind.cm_foundry_work_lease` remain canonical work and lease identity.
- Foundry profiles, capability grants, authorization requests and decisions, execution contexts, adapter operations, outcomes, and fencing remain canonical execution authority.
- `comind.cm_evidence` stores complete provider output and bounded provider/model provenance.
- `comind.cm_mdo_contribution` remains the accepted planning contribution record.
- `FoundryAdapterRegistry` remains the runtime adapter registry. MDO does not create a second provider registry.
- The existing local Ollama Foundry adapter supplies the zero-cost execution proof.

## Provider-neutral seam

The Foundry capability adapter remains `mdo`. For each execution it:

1. resolves the execution context to the exact profile, task, and project;
2. loads the canonical MDO plan/task context and prerequisite contributions;
3. rejects model-visible context containing credential-like keys;
4. resolves `runtime_defaults.mdo_inference` for the selected inference adapter, provider, and model;
5. rejects runtime prompt/provider/model overrides and recursive `mdo` routing;
6. constructs a bounded role-specific planning prompt;
7. delegates inference through an adapter already registered in `FoundryAdapterRegistry`;
8. records provider output in canonical `cm_evidence` with output checksum, prompt checksum, provider/model identity, upstream result reference, task, plan, module, role, and deliverable lineage;
9. returns only the canonical evidence reference through the Foundry terminal-result contract.

Raw prompts are not copied into evidence metadata. Credentials and governance secrets are not model-visible inputs.

## Contribution and lease ordering

The MDO planning worker enforces this order:

`capability-aware lease -> exact task context -> Foundry execution -> successful terminal outcome -> evidence readback -> MDO contribution -> fenced lease completion -> task done`

A failed or thrown execution submits no contribution. The worker releases the lease as unsuccessful through `cm_foundry_finish_work`, preserving the MDO-001 bounded retry contract. If the lease kernel exhausts the task, the task is marked blocked.

MDO tasks use the MDO-001 retry allowance and are not forced through the separate one-shot terminal helper that requires `max_attempts = 1`.

## Pilot workforce

The full ten-role planning phase chain is exercised with five reusable C1 isolated profiles, each scoped to the exact project and plan:

- analyzer: `mdo.plan.analyze` for Module Planner, Architecture Analyst, and Dependency Analyst;
- researcher: `mdo.plan.research` for External Capability Scout and Lessons-Learned Analyst;
- reviewer: `mdo.plan.review` for Governance Reviewer, Assumption Validator, and Integration Reviewer;
- synthesizer: `mdo.plan.synthesize` for Plan Synthesizer;
- portfolio coordinator: `mdo.plan.portfolio` for Portfolio Coordinator.

This proves role sequencing without creating one permanent agent identity per module.

## Zero-cost provider proof

The acceptance workflow uses local `ollama/ollama:0.40.8` with `qwen3:0.6b`, cloud access disabled, one parallel request, and a bounded 48-token output per planning task. The fixture is synthetic and rollback-only in isolated PostgreSQL 17.

The proof requires all ten planning tasks to:

- pass capability-aware claiming;
- receive exact C1 isolated Foundry authorization;
- execute through the `mdo` adapter;
- delegate to `ollama_local`;
- preserve exact provider/model provenance;
- persist one canonical inference-evidence record;
- submit one evidence-backed MDO contribution;
- complete the exact fenced lease;
- mark the task done.

After all ten contributions, the plan remains `in_review` and module maturity remains `conceived`. MDO-002 does not self-accept a plan or advance module maturity.

## Security and authority boundaries

MDO-002 does not authorize:

- Production execution or mutation;
- autonomous merge or deployment;
- destructive operations;
- capability self-granting or self-escalation;
- paid provider execution;
- credential exposure to an agent or model;
- automatic module maturity promotion.

A later external-model planning run remains subject to the existing paid-call proposal and Founder approval requirements, including model/provider pricing, expected and maximum cost, token/request limits, retries, and stopping conditions.

## Recovery

Provider failure, malformed evidence, target drift, capability mismatch, stale fencing, and context-policy violations fail closed. Failed attempts do not become accepted MDO contributions. Retry remains controlled by the existing lease attempt counter and expiry semantics.

## Acceptance evidence required before merge

- server TypeScript build succeeds on the exact PR head;
- deterministic adapter/worker tests pass;
- MDO-001 isolated substrate verification remains green;
- the zero-cost local Ollama ten-role phase-chain workflow passes;
- the evidence artifact shows 10 contributions, 10 completed leases, 10 inference-evidence records, 10 done tasks, exact `ollama_local / qwen3:0.6b` provenance, plan status `in_review`, and unchanged module maturity;
- relevant broad CI and Foundry regressions remain green;
- no paid provider or Production action occurs.
