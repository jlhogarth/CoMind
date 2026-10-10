# CoMind Provider Independence Retrofit Plan

Status: Issue #104 retrofit inventory and execution plan
Date: 2026-10-10
Base main: `8d6bead77ab5064f070b6eb7b2a7abed60ac93c9`

## 1. Objective

Migrate historical and current provider-specific CoMind code toward the canonical provider-neutral architecture without breaking current behavior, duplicating existing authorities, or weakening governance.

The retrofit is intentionally incremental. Existing OpenAI behavior remains valid until a verified replacement path reaches acceptance. Provider-specific code is technical debt to be retired through controlled slices, not deleted merely because a new abstraction exists.

## 2. Migration principles

1. Preserve working behavior before generalizing it.
2. Reuse the immutable provider execution envelope, governed provider execution wrapper, Foundry capability broker, budget authority, telemetry, and provenance systems.
3. Introduce one canonical provider/model registry rather than subsystem-specific registries.
4. Keep secrets behind credential references and a broker boundary.
5. Make model family explicit wherever independent second opinions are claimed.
6. Add deterministic adapter-conformance tests before live provider tests.
7. Do not introduce a second financial ledger, execution identity, authorization authority, memory store, provenance system, supplier inventory, or risk authority.
8. Migrate callers toward capabilities and provider-neutral requests rather than giving them direct provider SDK clients.
9. Preserve the PTSD/private/local requirements as first-class acceptance criteria.
10. Treat external gateways as replaceable adapters.
11. Preserve explicit governed-attempt semantics: no hidden automatic retries or fallback calls behind one provider execution identity.
12. Register material providers/gateways and consequential model/provider changes through the existing AIMS supplier, system, risk, approval, and reassessment controls.
13. Distinguish independent parallel review from critique. A reviewer that sees the primary answer before forming its own opinion is performing critique, not producing an independent second opinion.

## 3. Current coupling inventory

This inventory is based on repository inspection at the Issue #104 base and is not claimed to be exhaustive until the implementation slice performs repository-wide exact searches.

| Area | Current coupling | Target state | Priority |
| --- | --- | --- | --- |
| `server/src/assistant-provider.ts` | Explicit provider selection currently limited to fixture/OpenAI | Provider registry resolves approved adapters from provider-neutral descriptors and policy | P0 |
| `server/src/providers/openai.ts` | OpenAI-specific provider adapter | Retain as first canonical adapter behind shared conformance contract | P0 |
| `server/src/env.ts` | OpenAI/provider-specific environment settings | Preserve compatibility while moving provider configuration into scoped provider descriptors and credential references | P0 |
| Existing provider execution envelope/wrapper | Provider-neutral execution foundation already exists | Extend, do not duplicate; current ordinary assistant traffic is not yet proven converged through the governed wrapper | P0 |
| Existing budget/FinOps/rate-card paths | Current provider accounting has OpenAI-specific assumptions in places | Introduce provider-specific rate sources behind one canonical financial authority | P0 |
| Provider-specific smoke/CI workflows | OpenAI-specific live smoke and configuration | Keep as adapter-specific validation while adding network-free shared conformance suite | P0 |
| AIMS system/supplier/risk inventory | Current governance authority already tracks provider/model/supplier dependencies and change triggers | Provider registry supplies machine-readable identities while AIMS remains the management/governance view | P0 |
| `apps/comind-sovereign-api/main.py` | Direct OpenAI coupling observed | Route through canonical provider capability/request layer | P1 |
| `src/api/agents/ceo/bot.ts` | Direct provider coupling observed | Agent requests governed inference capability, not provider SDK | P1 |
| `src/api/ve/bot.ts` | Direct provider coupling observed | VE requests governed inference capability, not provider SDK | P1 |
| `backend/app/services/chatgpt_service.py` | Provider named in service boundary | Replace provider-specific service contract with provider-neutral inference service or adapter | P2 |
| `src/services/enhanced_assistant/llm_provider.py` | LLM/provider-specific logic | Reconcile with canonical registry rather than maintain parallel provider authority | P2 |
| `src/assumption_engine/evaluator.py` | Direct provider coupling observed | Use provider-neutral evaluator request with optional independent-family policy | P1 |
| PTSD/private/local historical paths | Earlier BYOK/local/private design concepts may be distributed or historical | Reconcile surviving code/docs to common BYOK/BYOM/BYOP contracts | P1 |
| Documentation, examples, install scripts | OpenAI-specific names likely remain | Classify intentional adapter docs versus architectural coupling; update only where provider-neutral behavior is intended | P3 |

## 4. Required repository-wide discovery before code migration

Each implementation slice must search current authoritative main, not rely only on this initial inventory.

Required search classes include:

- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `openai`
- `OpenAI`
- `chatgpt`
- provider-name constants
- provider-specific base URLs
- provider-specific rate-card entries
- provider-specific retry/error types
- direct SDK construction
- Anthropic/Claude references
- Gemini/Google AI references
- Grok/xAI references
- Mistral references
- Llama/local inference references
- TogetherAI references
- Groq references
- BYOK/BYOM/BYOP/provider-routing references

Every result must be classified as one of:

- canonical adapter implementation
- configuration compatibility surface
- provider-neutral code that needs migration
- test fixture
- provider-specific acceptance test
- documentation/example
- historical/dead code
- approved exception

## 5. Target contracts for the retrofit

### 5.1 Provider registry

One registry resolves:

- provider adapter
- provider organization / independence domain
- model descriptor
- model family
- requested and resolved model identity/version where exposed
- acquisition mode
- credential reference
- capability metadata
- policy compatibility
- provider health
- AIMS supplier/governance reference where applicable

Subsystems must not create private competing provider registries.

The runtime registry is not a replacement for the AIMS management view. Machine-readable provider/model identity should feed or reconcile with AIMS supplier/system inventory rather than creating a shadow governance database.

### 5.2 Inference request

Callers should express intent such as:

- task class
- input/context reference
- required capabilities
- risk class
- data classification
- budget ceiling
- latency preference
- privacy constraints
- required/forbidden model families
- required provider-organization diversity where applicable
- arbitration mode
- arbitration role

They should not need to know a raw API key or provider SDK object.

### 5.3 Provider adapter contract

Every provider adapter should support the subset of capabilities it advertises and pass a shared deterministic conformance suite covering at minimum:

- request normalization
- requested/canonical/resolved model identity
- model revision/version/build identity where exposed
- upstream provider organization where known
- usage normalization
- result normalization
- error normalization
- timeout handling
- explicit retry and fallback attempt semantics
- rejection or disabling of hidden automatic retries for governed cost-bearing execution
- cancellation behavior where supported
- provenance emission
- cost/usage emission
- structured output handling where advertised
- tool/function support where advertised

A fallback that creates another external request is another governed attempt. It must not silently share the first attempt's execution identity, monetary authorization, or settlement evidence.

### 5.4 Credential boundary

Provider credentials are opaque references from the caller perspective. Resolution occurs only inside an authorized provider execution boundary.

### 5.5 Arbitration contract

Model arbitration should be a first-class execution plan rather than an ad hoc loop over provider clients. It must record participant role, arbitration mode, actual model family, provider organization where known, resolved identity information available from the provider, and cross-model visibility policy.

A strict independent second opinion requires independent-parallel execution: participants receive materially equivalent authorized task/evidence context but do not receive another participant's answer until their own output is sealed. Critique mode deliberately exposes another model's answer and must not be counted as an independent vote. Synthesis/adjudication occurs only after the relevant independent outputs are sealed.

## 6. Retrofit execution phases

### Phase A: Baseline and tests

- Freeze current provider behavior in deterministic tests.
- Capture current fixture/OpenAI provider contract.
- Establish adapter-conformance test harness with no paid calls.
- Confirm current execution-envelope/budget/provenance integration points.
- Confirm current AIMS provider/supplier/risk records and change-control boundaries that the provider registry must integrate with rather than replace.

Exit criterion: current behavior is reproducible, provider-neutral test expectations exist, and governance integration points are identified.

### Phase B: Provider/model descriptors and registry

- Add provider and model descriptors.
- Add explicit model-family identity.
- Add provider-organization / independence-domain identity.
- Record requested/canonical/resolved model identity and model revision/version where exposed.
- Add acquisition-mode enum/contract: BYOK, BYOM, BYOP, managed.
- Register fixture and OpenAI through the same registry.
- Keep current environment settings as compatibility inputs.
- Add AIMS supplier/governance references without duplicating management-only risk/approval records into the runtime registry.

Exit criterion: existing server behavior works through registry resolution without changing observable behavior, and registry identities can reconcile to current governance records.

### Phase C: Canonical credential references

- Define scoped credential-reference contract.
- Integrate with existing capability/authority model.
- Add revocation/rotation/state metadata.
- Prohibit raw credential propagation into model-visible context.
- Add tests for secret non-disclosure.

Exit criterion: an adapter can request a credential by reference while callers cannot read the secret.

### Phase D: Migrate first-party callers

Suggested order:

1. canonical server assistant path;
2. Assumption Engine evaluator;
3. VE bot/runtime paths;
4. CEO/agent bot paths;
5. Sovereign API;
6. enhanced assistant service;
7. legacy ChatGPT-named backend service.

For each caller:

- remove direct SDK construction;
- express provider needs through canonical inference/capability request;
- preserve existing tests;
- add provider-substitution test using fixture/fake adapters;
- verify no financial/provenance bypass;
- verify no hidden retry/fallback bypass;
- preserve evidence-state distinctions between repository implementation, isolated verification, deployed controls, and operating controls.

Exit criterion: direct provider SDK use remains only inside approved adapters or explicit transitional exceptions.

### Phase E: Multi-provider adapter expansion

Add adapters one at a time after the registry is stable. Candidate classes include:

- Anthropic direct
- Google Gemini direct
- xAI direct
- Mistral direct
- local/private OpenAI-compatible endpoint
- MyApps/Machine gateway
- OpenRouter gateway

Adapter acceptance must be based on CoMind contracts rather than the provider marketing surface. Before consequential or live use, material external providers/gateways must have the required AIMS supplier/system references, risk assessment, approval state, and reassessment triggers.

Exit criterion: at least two distinct model families can pass deterministic conformance, with live validation separately gated and governance state explicit.

### Phase F: Independent second opinion and arbitration

- Add arbitration-plan object.
- Require model-family identity.
- Support excluding primary family.
- Support provider-organization diversity requirements for higher-consequence policy.
- Implement independent-parallel, critique, and synthesis/adjudication modes.
- Prevent independent-parallel participants from receiving another participant's answer before their own output is sealed.
- Preserve materially equivalent task/evidence context or record deliberate asymmetry.
- Add compare/contrast normalization only after independent outputs are sealed.
- Add Assumption Validator/contradiction integration.
- Add abstain/unresolved/escalation outcomes.
- Add budget-bounded participant selection.
- Add provenance linking primary and reviewer executions.
- Record model revision/version or identity-observation time where available so later re-evaluation can detect model drift.

Exit criterion: CoMind can demonstrate a deterministic independent-parallel two-family arbitration flow, can prove that same-family routing fails a strict-independence requirement, can prove that critique mode is not counted as an independent vote, and can fail closed when a required independence dimension cannot be verified.

### Phase G: PTSD/private/local modernization

Reconcile surviving PTSD artifacts and restore the strongest prior provider-independence concepts on the common architecture:

- per-session provider/model selection
- private/BYOK mode
- user-funded versus CoMind-funded accounting
- team-scoped provider selection
- local/offline models
- private inference endpoints
- policy restrictions for sensitive context
- provider test/validation without secret exposure
- supplier/data-processing approval for any sensitive external provider path

Exit criterion: the PTSD subsystem no longer needs a private provider architecture to achieve these capabilities.

### Phase H: Cleanup and enforcement

- remove obsolete duplicated provider routing;
- remove retired direct SDK clients from callers;
- update documentation and examples;
- add static/repository checks for unauthorized direct provider SDK construction where practical;
- maintain an exception registry for intentional direct adapter code;
- add architecture test preventing fallback from weakening constraints;
- add architecture test or policy check preventing hidden multi-attempt retry/failover where the governed wrapper requires explicit attempts;
- add arbitration tests preventing cross-model answer leakage before sealing in independent-parallel mode.

Exit criterion: provider-specific coupling is bounded to adapters/tests/approved exceptions.

## 7. Model arbitration migration priorities

Not every subsystem needs multiple models. The first useful targets are those where independent critique or independent parallel review materially improves reliability.

Priority candidates:

1. Assumption Validator and contradiction resolution
2. governance/control review
3. code/architecture review
4. research verification
5. high-consequence Virtual Employee decisions
6. sensitive-domain review where policy permits external processing

Ordinary low-risk chat should remain eligible for a single model to avoid unnecessary cost and latency.

## 8. PTSD lineage preservation checklist

Before declaring the retrofit complete, search historical repository and durable documentation for evidence of the earlier PTSD provider design and map each surviving requirement to the Greater CoMind implementation.

Required concepts to preserve if still desired and policy-compatible:

- `/settings/llm-provider` or successor UX
- `llm_session_routing` or successor data contract
- `user_llm_selections` or successor data contract
- `admin_overrides` or successor policy control
- CoMind Default / Research / Creative / Private / Team-scoped routing concepts
- user-key validation
- managed versus user-funded usage accounting
- local Llama/Mixtral or equivalent private model support
- offline/private execution pathway

Historical names do not have to survive. The capabilities and governance intent do.

## 9. External gateway evaluation checklist

Before adopting MyApps/Machine, OpenRouter, or another gateway as a CoMind adapter, verify:

- API availability and authentication model
- exact upstream model identity availability
- upstream provider organization identity availability
- resolved model revision/version identity availability where exposed
- ability to pin/exclude model families and provider organizations where required
- privacy/data retention terms
- training/use-of-data terms
- regional/residency controls
- provider failover behavior
- whether retries/failover are visible and controllable per external attempt
- request/response logging behavior
- prompt/context retention
- ability to prevent cross-model answer sharing during independent-parallel review
- usage/cost precision
- latency and rate limits
- outage/fallback semantics
- service-account support
- revocation/rotation support
- audit/export capability
- OpenAI-compatible behavior differences
- model deprecation/change-notification policy
- vendor lock-in and direct-provider escape path
- AIMS supplier identifier, owner, approval state, linked risk records, and reassessment triggers
- upstream/subsupplier visibility where a gateway fronts other model providers

A gateway that cannot prove an identity dimension required by the arbitration policy may be useful for inference but must not satisfy that strict independence requirement. A gateway that hides retries or upstream fallback may be unsuitable for governed cost-bearing execution unless CoMind can preserve distinct attempt, budget, telemetry, and settlement evidence.

## 10. Acceptance evidence for each retrofit PR

Every implementation PR should include:

- exact base and head commit
- changed provider-coupling inventory
- deterministic tests
- evidence that raw credentials were not introduced
- evidence that budget/provenance controls remain in path
- evidence that governed attempt/retry/fallback semantics remain in path
- AIMS system/supplier/risk impact and whether reassessment is required
- arbitration mode and independence dimensions when multi-model behavior changes
- evidence that independent-parallel participants do not receive another model's answer before sealing
- migration/compatibility impact
- live-call status: none, bounded, or explicitly authorized
- evidence state: repository, isolated, deployed, operating, or other explicitly supported state
- known exceptions and next retirement step

Paid provider calls remain unnecessary unless the implementation specifically reaches a live adapter acceptance milestone.

## 11. Proposed follow-on issue sequence

Do not open all of these simultaneously. Create each only when its dependency is accepted to avoid parallel competing provider foundations.

1. Provider behavior baseline and network-free adapter conformance harness
2. Provider/model descriptors, model-family and provider-organization identity, acquisition mode, and canonical registry with fixture/OpenAI registration
3. Credential-reference and BYOK/BYOM/BYOP policy boundary
4. First caller migrations and convergence toward governed provider execution
5. Independent second-opinion/model-arbitration runtime
6. PTSD/private/local modernization
7. External gateway adapter evaluation and bounded live validation
8. Remaining legacy cleanup and architecture enforcement

## 12. Completion definition

The Greater CoMind retrofit is complete when:

- CoMind can change providers/models without losing durable cognitive continuity;
- every model-backed execution has provider/model-family provenance and the best available resolved model identity;
- Virtual Employees receive inference capabilities rather than credentials;
- user/provider choice is governed through BYOK/BYOM/BYOP/managed modes;
- strict second-opinion requests enforce independent-parallel formation before synthesis, genuine model-family independence, and any additional provider-organization independence required by policy;
- critique is recorded as critique rather than miscounted as an independent vote;
- sensitive/private routing can require private or local inference;
- external gateways remain replaceable;
- material providers/gateways and consequential changes are governed through the existing AIMS supplier/system/risk process;
- retries and provider failovers cannot silently create untracked external attempts;
- direct provider coupling is confined to adapters, tests, or documented exceptions;
- all existing budget, authorization, provenance, recovery, supplier-governance, and risk authorities remain singular and canonical.
