# MDO-002 Pilot Planning Workforce and Provider-Neutral Execution Adapter

Date: 2026-10-29, acceptance repair 2026-10-30
Issue: #316
PR: #334
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

## Failed proof 1: transaction ownership

The first full local acceptance run reached three successful roles and failed during the fourth role. PostgreSQL rejected insertion into `cm_foundry_adapter_operation_result` with foreign-key error `23503` because the referenced adapter-operation row was no longer present. The subsequent retry-release was also rejected by the lease fence because the rollback had removed the synthetic lease fixture. No inconsistent contribution was accepted.

The failure was traced to the rollback-only test harness rather than the Foundry lifecycle contract. The pilot opened its transaction with `pool.query('BEGIN')` and subsequently used `pool.query(...)` for all work. That pattern does not reserve one PostgreSQL client for a transaction. The local Ollama calls progressively took about 4.7, 6.9, 9.6, and 13.2 seconds. The fourth inference exceeded the pool's default idle-client timeout, allowing the transaction-bearing connection to be closed and the synthetic fixture to roll back. The next database operation used a fresh connection and correctly could not resolve the rolled-back adapter operation.

The repair checks out one `PoolClient` before `BEGIN`, routes every fixture query through that same client, performs `ROLLBACK` on that client, and releases it only after rollback. The pool idle timeout is deliberately set to one second in the pilot so the regression proof depends on explicit client ownership rather than on a forgiving timeout. Foundry authorization, terminal evidence requirements, retry semantics, and lease fencing are unchanged.

## Failed proof 2: bounded model-visible context

The next exact-head proof confirmed the transaction repair by progressing beyond role 4 and completing roles 1 through 7. It failed when role 8, Integration Reviewer, entered the MDO adapter.

The prior implementation copied each complete durable contribution payload into every downstream model prompt. Because each contribution also contains provider provenance, prompt checksums, and other repeated metadata, the model-visible context grew monotonically even though the complete authoritative evidence already existed separately. MDO-001 permits objectives up to 12,000 characters while MDO-002 intentionally limits model-visible prompts to 5,900 characters. Raising that safety ceiling would have hidden the architectural mismatch rather than fixed it.

The repair preserves the full objective, contribution payloads, provider output, and provenance in canonical storage while projecting a bounded inference view:

- objective excerpt plus explicit truncation state;
- prior contribution role and sequence;
- bounded narrative excerpt plus explicit truncation state;
- canonical evidence references;
- no repeated provider-provenance payload in the inference projection.

Sensitive-key scanning runs against the complete raw prior contributions before projection, so compaction cannot conceal credential-like data. The prompt explicitly states that excerpts may be partial and that omitted material must not be inferred or fabricated.

A deterministic regression fixture exercises the schema maximum 12,000-character objective plus nine large prior contributions and requires the final role-10 prompt to remain within the 5,900-character ceiling. It also verifies preservation of evidence references and sensitive-key rejection.

## Successful ten-role diagnostic proof

GitHub Actions run `41020174890`, exact head `9493c6110e2bdad10c6e170d6dcf622a5d368c33`, passed the complete MDO-002 workflow after the bounded-context repair:

- exact-head checkout: passed;
- MDO-001 substrate verification: passed;
- MDO-002 terminal-alignment verification: passed;
- server TypeScript build: passed;
- deterministic adapter, worker, and bounded-context tests: passed;
- zero-cost ten-role local Ollama pilot: passed;
- evidence artifact preservation: passed.

The preserved acceptance artifact reported:

- provider: `ollama_local`;
- model: `qwen3:0.6b`;
- environment: `isolated`;
- contribution count: 10;
- completed lease count: 10;
- inference evidence count: 10;
- done task count: 10;
- plan status: `in_review`;
- module lifecycle stage: `conceived`;
- Production authorization: false;
- paid-provider authorization: false.

All ten canonical roles have distinct task, contribution, evidence, and execution-context identifiers in the artifact. This diagnostic proves the substantive lifecycle and bounded-context repairs. Merge still requires the same proof on the final head after the last `main` freshness reconciliation.

## Migration freshness repair

Concurrent CE-001 work occupied migration sequence `20261029_007` through `009`. MDO-002 was resequenced from its earlier `007` filename to `20261029_010_mdo_002_foundry_terminal_alignment.sql` with the paired `verify_20261029_010...` verifier. The prior MDO `007` files were removed so the repository retains one unambiguous migration sequence.

## Freshness and collision reconciliation

The branch has been repeatedly reconciled as parallel development lanes merged. Before final acceptance, the latest inspected `main` was commit `927caa0a69eb7cb2622480d783961549abd93c4d`. Changes since the MDO branch's last reconciliation are confined to Operator Console/ThreadKeeper visibility and Implementation Integrity controls. They do not overlap the MDO runtime, MDO tests, MDO migrations, MDO workflow, or this provenance record.

A final exact-head reconciliation and complete acceptance rerun are required immediately before merge if `main` changes again.

## Security and authority boundaries

MDO-002 does not authorize:

- Production execution or mutation;
- destructive operations;
- capability self-granting or self-escalation;
- paid provider execution;
- credential exposure to an agent or model;
- automatic module maturity promotion.

A later external-model planning run remains subject to the existing paid-call proposal and Founder approval requirements, including model/provider pricing, expected and maximum cost, token/request limits, retries, and stopping conditions.

## Recovery

Provider failure, malformed evidence, target drift, capability mismatch, stale fencing, context-policy violations, transaction-lifetime loss, and model-visible context overflow fail closed. Failed attempts do not become accepted MDO contributions. Retry remains controlled by existing lease attempt and expiry semantics.

## Final acceptance required before merge

- server TypeScript build succeeds on the final exact PR head;
- deterministic adapter/worker and bounded-context tests pass;
- MDO-001 isolated substrate verification remains green;
- the resequenced MDO-002 terminal-alignment migration and verifier pass;
- the zero-cost local Ollama ten-role phase-chain workflow passes;
- the final evidence artifact shows 10 contributions, 10 completed leases, 10 inference-evidence records, 10 done tasks, exact `ollama_local / qwen3:0.6b` provenance, plan status `in_review`, and unchanged module maturity;
- relevant broad CI and Foundry regressions remain green;
- final freshness review shows no unresolved collision with `main`;
- no paid provider or Production action occurs.

## Subsequent acceptance and 97-commit freshness reconciliation

A later exact-head proof at branch head `87d36124306136ab6facbe7a50d360d44a0f2dc4`, GitHub Actions run `41021071168`, passed the complete MDO-002 workflow and all relevant exact-head regressions. Its preserved artifact independently confirmed 10 contributions, 10 completed leases, 10 inference-evidence rows, 10 done tasks, plan status `in_review`, module lifecycle `conceived`, provider `ollama_local`, model `qwen3:0.6b`, Production authorization false, and paid-provider authorization false.

After that proof, parallel lanes advanced `main` by 97 commits from `927caa0a69eb7cb2622480d783961549abd93c4d` to `d238720e83276457ad0a1d544ee83bf269449714`. A full compare found no direct path overlap with the nine MDO-002 files. The intervening work is concentrated in Continuous Excellence, CoMind Home/Operator Console, Activity HUD, Research Library, and implementation-integrity controls. No MDO-002 runtime, test, workflow, migration, or provenance path was modified. The new 2026-10-30 migration sequence begins at `020`, so MDO-002's accepted `20261029_010` migration remains unambiguous.

The branch is therefore being reconciled onto `d238720e83276457ad0a1d544ee83bf269449714` without altering the previously proven MDO implementation blobs. This reconciliation itself is not acceptance. The same exact-head build, database verification, deterministic tests, ten-role zero-cost Ollama proof, artifact invariants, broad CI, Foundry regressions, and final freshness check remain mandatory before PR #334 may merge.
