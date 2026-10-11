# CoMind Provider Independence and Model Arbitration Architecture

Status: Architecture baseline for Issue #104
Date: 2026-10-10
Base main: `8d6bead77ab5064f070b6eb7b2a7abed60ac93c9`

## 1. Purpose

CoMind must preserve continuity of cognition, memory, governance, identity, provenance, and user relationship independently of any individual large language model vendor, model family, gateway, or hosting environment.

The model is a replaceable cognitive resource. CoMind is the persistent governed system.

This architecture generalizes provider-independence ideas previously developed for the PTSD infrastructure into the Greater CoMind ecosphere. The earlier PTSD design included user-selectable providers, private/BYOK routing, hosted versus user-funded usage, team-scoped routing, and local/offline model concepts. This document preserves that design intent while moving the provider boundary into a common CoMind architecture that every subsystem can reuse.

This document establishes architecture and migration policy. It does not claim that every legacy provider-specific call has already been migrated.

## 2. Canonical doctrine

The following rules are normative for future CoMind provider work.

1. **CoMind owns continuity of cognition, not the underlying LLM vendor.**
2. **Agents never own credentials. Agents receive governed capabilities.**
3. **No externally consequential action bypasses the Capability Control Plane.**
4. Provider and model selection must remain replaceable, auditable, cost-governed, policy-governed, and provenance-preserving.
5. Provider credentials, API keys, tokens, and service secrets must never enter prompts, model-visible context, durable memory, ordinary application logs, or model arbitration transcripts.
6. Provider fallback must never silently weaken privacy, data-classification, authority, residency, cost, safety, or independence requirements.
7. Actual upstream provider, model, model-family, and available model revision/version identity must be preserved whenever known and material to provenance.
8. A strict second opinion is not independent when it resolves to the same model family as the primary execution or when the reviewer sees the primary model's conclusion before forming its own opinion. Higher-consequence policy may additionally require distinct upstream provider organizations and other known independence dimensions.
9. Consensus is evidence, not truth. Dissent, abstention, unresolved contradiction, insufficient evidence, and human escalation are first-class outcomes.
10. Provider-specific implementation may exist only behind provider-neutral CoMind contracts or as a documented temporary exception with a migration plan.
11. Every retry, fallback, or reroute that can create another provider request is a distinct governed execution attempt. Governed cost-bearing operations must not hide multiple external attempts behind automatic SDK retry behavior.
12. Material provider, model, gateway, supplier, data-use, region, or subprocessor changes must flow through CoMind's existing AIMS inventory, risk, approval, and reassessment controls before consequential use.

## 3. Supported acquisition modes

CoMind must support four explicit acquisition modes.

### 3.1 BYOK: Bring Your Own Key

The user, organization, tenant, or authorized operator supplies credentials for an approved provider. CoMind stores or references the credential through an approved secret-management boundary and never exposes the raw value to an agent or model.

### 3.2 BYOM: Bring Your Own Model

The user or organization supplies or designates a model that may be local, self-hosted, private-cloud hosted, edge-hosted, or exposed through an approved inference endpoint. CoMind applies the same governance, identity, telemetry, privacy, cost, and capability controls as it would to a commercial provider.

### 3.3 BYOP: Bring Your Own Provider

The user or organization supplies an approved provider or gateway endpoint. This may include a direct commercial provider, enterprise inference service, model gateway, private deployment, or compatible API surface.

### 3.4 CoMind Managed

CoMind selects and pays for an approved provider/model under policy. Selection must remain explainable through routing provenance and governed by task, risk, privacy, cost, latency, provider health, and independence requirements.

## 4. Architectural position

The provider layer sits below CoMind cognition and governance.

```text
User / VE / Workflow / CoMind subsystem
                  |
                  v
          CoMind Cognition Layer
      memory, context, identity, task
                  |
                  v
         Provider Routing Policy
                  |
                  v
       Model Arbitration Planning
                  |
                  v
        Capability Control Plane
                  |
                  v
    Governed Provider Execution
                  |
                  v
          Provider Adapter
                  |
          +-------+--------+
          |       |        |
        OpenAI  Claude   Gemini ...
          |       |        |
       gateway / local / private models
```

The provider adapter is intentionally below memory, identity, governance, provenance, and decision policy. Replacing a provider must not replace the user relationship, CoMind memory, VE identity, or governance state.

## 5. Reuse of existing CoMind authorities

Issue #104 must extend existing authorities rather than duplicate them.

### 5.1 Immutable provider execution envelope

The existing provider-neutral immutable execution envelope remains the canonical identity for one governed provider execution. Provider expansion must extend its descriptors and adapters rather than create an alternate execution identity.

### 5.2 Governed provider execution

The existing governed provider execution wrapper remains the target common execution boundary for paid or otherwise controlled provider calls. New adapters must inherit the same retry, fingerprint, role, attempt, provenance, and fail-closed properties.

Current evidence does not establish that ordinary configured assistant traffic is already routed through this wrapper in production. Convergence of current provider paths into the governed execution boundary remains implementation work and must not be represented as an operating control before deployment evidence exists.

For governed provider work, automatic SDK retry authority remains disabled. A legitimate retry, provider failover, or fallback that causes another external request must receive a new immutable attempt identity and, where applicable, a new preflight, quote, reservation, telemetry identity, and settlement identity.

### 5.3 Budget authority and FinOps

The existing durable budget authority, provider telemetry, quotation, settlement, and spending controls remain canonical. Multi-provider support may add provider-specific rate sources and quote adapters, but must not create a second financial ledger.

### 5.4 Foundry capability broker

Virtual Employees and agents must obtain provider use as a governed capability through the existing Foundry authorization model. They do not receive API keys or unrestricted provider clients.

Current Foundry capability and broker evidence is repository/isolated verification, not proof of live deployment or production autonomy. Provider-independent architecture must reuse that authority model without overstating its operating state.

### 5.5 Memory and provenance

Provider replacement must not fragment durable CoMind memory or create provider-owned continuity. Provider execution provenance must remain linked to CoMind conversation, agent-run, workflow, project, and decision lineage as applicable.

### 5.6 AIMS system and supplier governance

Provider independence does not remove supplier governance. Each material direct provider, gateway, managed inference service, or other external model supplier must be represented through the existing AIMS system/supplier inventory and linked risk controls before consequential use.

The provider registry should expose machine-readable identifiers that can support the AIMS governance view without creating a competing manual runtime registry. Governance records may retain management-only fields such as supplier approval, contractual evidence, risk acceptance, review dates, and reassessment triggers.

When a gateway fronts an upstream model provider, both the gateway and material upstream supplier relationship must remain visible where known. Subprocessor/subsupplier opacity is itself a governance fact and may restrict sensitive or high-consequence routing.

Material changes to model/version, terms, data use, training policy, subprocessors, region, availability, security posture, cost exposure, or regulatory applicability must trigger reassessment under the existing AIMS boundary before consequential production use continues.

## 6. Canonical provider-neutral contracts

The implementation phase should converge on the following conceptual contracts. Names are descriptive architecture names, not a claim that these exact types already exist.

### 6.1 ProviderDescriptor

Required characteristics include:

- provider identifier
- provider organization / independence domain
- provider class: direct, gateway, local, self-hosted, enterprise, managed
- supported acquisition modes
- authentication method references
- model discovery capability
- tool/function capability
- streaming capability
- structured-output capability
- input/output modality support
- token counting capability
- cost-reporting capability
- data-retention and training posture where known
- region or residency constraints where applicable
- health and availability metadata
- gateway upstream-identity transparency capability
- AIMS supplier identifier or governance reference where applicable

### 6.2 ModelDescriptor

Required characteristics include:

- requested model identifier
- canonical model identifier when resolvable
- resolved model revision/version/build identifier when the provider exposes one
- model identity observation timestamp when aliases may drift
- model family
- provider
- upstream provider and provider organization when a gateway is used
- known training-lineage or correlation metadata when available and material to independence policy
- context/input/output limits
- reasoning/tool/modality capabilities
- lifecycle status
- cost policy reference
- privacy/data-policy compatibility
- independence class/profile for arbitration

### 6.3 CredentialReference

A provider credential reference identifies a secret without exposing it. It should include only bounded metadata such as:

- credential reference identifier
- owner or authority scope
- provider scope
- project/tenant scope
- acquisition mode
- status
- rotation/revocation metadata
- secret-manager location reference or opaque broker identity

Raw credential material must remain outside this contract.

### 6.4 ProviderExecutionPolicy

The policy binds permitted execution to:

- task class
- risk class
- data classification
- privacy requirements
- approved providers and model families
- prohibited providers/model families
- required independence dimensions
- maximum cost/exposure
- timeout/retry policy
- locality/residency requirements
- capability/tool permissions
- human approval requirements
- supplier approval/risk state where consequential use requires it

### 6.5 ModelArbitrationPlan

The plan describes why more than one model is being used and what constitutes adequate independence. It should include:

- arbitration mode: independent_parallel, critique, synthesis/adjudication, or other explicitly defined mode
- primary participant
- reviewer/critic participants
- excluded model families
- excluded provider organizations where required
- required independent-family count
- required provider-organization diversity when policy requires it
- task/source-context equivalence policy for independent participants
- cross-model visibility policy
- output sealing/order rules
- task-specific prompts or roles
- evidence requirements
- maximum participants
- cost ceiling
- disagreement policy
- escalation policy

## 7. Routing policy

Provider selection must be policy-driven, not hardcoded by convenience.

Routing inputs may include:

- task type
- risk and consequence level
- privacy and data classification
- user/organization provider preference
- BYOK/BYOM/BYOP/managed mode
- model capability requirements
- current model/provider availability
- cost and budget state
- latency target
- context size
- geographic/data residency requirements
- external tool requirements
- required independence dimensions
- supplier approval/risk state
- prior empirical performance for the task class

Routing output must preserve the decision basis as bounded provenance.

A routing decision that falls back, retries, or reroutes to another provider/model does not authorize a hidden second external call. Each external attempt must be independently represented by the existing governed attempt identity and its applicable authorization, budget, telemetry, and settlement evidence.

## 8. Model arbitration and independent second opinion

### 8.1 Independence dimensions

Endpoint diversity, provider-organization diversity, model-family diversity, and training-lineage diversity are different properties.

Examples:

- OpenAI direct plus OpenAI through a gateway is not model-family or provider-organization independent.
- Claude direct plus Claude through a gateway is not model-family or provider-organization independent.
- GPT plus Claude is model-family and provider-organization independent even when both are accessed through one transparent gateway, provided actual upstream identities are known.
- Two different model families from the same upstream provider may satisfy a lower independence policy but should not automatically be treated as provider-organization independent.
- An opaque gateway response whose upstream model/provider cannot be verified cannot be counted as an independent vote for a high-consequence decision when the required independence dimension cannot be proven.

A default strict second opinion requires at least model-family independence. Higher-consequence policy may also require distinct upstream provider organizations and may consider known training-lineage correlation when such evidence exists.

### 8.2 Arbitration modes and cross-model isolation

CoMind must distinguish at least three modes:

1. **Independent parallel review.** Each participant forms its opinion from the task and authorized source/evidence context without seeing another model's answer first. Outputs are sealed before compare/contrast or synthesis. This is the default mode for a strict independent second opinion.
2. **Critique.** A reviewer is deliberately shown another model's proposed answer and asked to challenge, verify, improve, or falsify it. This is useful adversarial review but is not an independent opinion.
3. **Synthesis/adjudication.** A later participant or deterministic CoMind process sees already-sealed outputs and evidence in order to compare disagreements, identify assumptions, and propose resolution. Synthesis must not retroactively convert dependent critiques into independent votes.

Independent participants should receive materially equivalent task definitions, evidence access, policy constraints, and data-classification boundaries unless a documented experimental design intentionally differs. Any asymmetry that could affect the opinion must be preserved in provenance.

### 8.3 Arbitration outcomes

An arbitration process must be able to return:

- agree
- agree_with_qualifications
- disagree
- accepted_with_dissent
- abstain
- insufficient_evidence
- unresolved_contradiction
- blocked
- human_escalation_required

A majority or plurality alone must never establish truth.

### 8.4 Evidence before consensus

For factual or high-consequence disagreements, the resolution sequence should prefer:

1. identify the exact disputed claim;
2. compare independently formed assumptions and evidence where independent review was requested;
3. retrieve authoritative evidence where available;
4. re-evaluate with required independence dimensions preserved;
5. use CoMind Assumption Validator / contradiction resolution controls;
6. escalate when evidence remains insufficient or authority is required.

### 8.5 Cost-bounded arbitration

Arbitration must be bounded. The router should use the smallest participant set that satisfies the risk and independence policy. Low-risk tasks may use one model. Higher-risk tasks may require one independent critic or one independent parallel reviewer depending on purpose. High-consequence tasks may require multiple independent families/providers plus evidence retrieval and human approval.

## 9. Gateway and aggregator policy

Services such as MyApps/Machine, OpenRouter, or future model gateways may be useful CoMind adapters. They are not CoMind governance authorities.

A gateway may provide model routing, billing aggregation, comparison, managed credentials, or fallback. CoMind must still retain:

- provider policy
- model/provider independence rules
- budget authority
- execution identity
- user/organization authority
- privacy/data classification
- provenance
- audit
- evidence and contradiction resolution
- AIMS supplier inventory and risk ownership

For an independence claim, CoMind must record the actual upstream model, family, and provider organization when available and required by policy. If the gateway cannot reveal or guarantee an identity dimension required by the arbitration plan, that execution may still be useful for ordinary inference but cannot satisfy that strict independence requirement.

A gateway's own retry or fallback behavior must not bypass CoMind attempt identity, budget, provenance, or policy. Hidden multi-provider retries are unacceptable for governed cost-bearing or high-consequence execution unless the gateway can expose each attempt sufficiently for CoMind to preserve its existing controls.

## 10. Credential and capability security

Provider credentials must flow through a secret broker or equivalent protected runtime boundary.

```text
VE / subsystem
      |
      | requests capability
      v
Capability Broker
      |
      | authorizes provider/model/action
      v
Credential Broker
      |
      | resolves secret server-side
      v
Provider Adapter
```

The calling VE or model receives a capability result, not the provider credential.

Required controls include:

- least privilege
- explicit owner/tenant/project scope
- revocation
- rotation
- environment separation
- no secret values in prompts, memory, logs, telemetry, or provenance
- no direct provider credential access by Virtual Employees
- audit of authorization and secret-reference use without recording the secret

## 11. Privacy, data classification, and retention

Provider routing must evaluate whether a provider is allowed to receive the proposed data before execution.

For sensitive modules, including PTSD or other future health-related deployments, policy may require local/private models, approved enterprise endpoints, zero-retention agreements, reduced context, explicit user consent, and any required contractual/legal authorization for the data class involved.

Audit records should store bounded execution metadata rather than automatically copying full prompt context. Appropriate records include:

- CoMind execution identity
- provider/model/model-family identity
- provider organization / independence domain
- model revision/version/build when exposed
- arbitration mode and cross-model visibility policy
- acquisition mode
- policy version
- data classification
- authorization decision
- request fingerprint/hash
- timing and status
- usage/cost metadata
- evidence/result references
- arbitration role and outcome

Full conversational content should remain in its governed source-of-truth store rather than being duplicated into provider audit tables merely for convenience.

## 12. PTSD architecture inheritance

The prior PTSD provider work is treated as an architectural precursor, not discarded historical experimentation.

The Greater CoMind provider architecture must preserve and modernize these prior design goals:

- per-session provider/model selection
- private/BYOK mode
- CoMind-hosted versus user-funded accounting separation
- team-scoped routing
- model/provider overrides under policy
- key validation without secret leakage
- local/offline inference
- Llama/Mixtral-style local model deployment concepts
- privacy-first provider selection for sensitive context

The key generalization is that these capabilities now belong to CoMind core infrastructure rather than one PTSD-specific implementation.

## 13. Migration phases

### Phase 0: Architecture and inventory

Document doctrine, current coupling, prior PTSD lineage, migration sequence, and acceptance rules. Issue #104 owns this phase.

### Phase 1: Behavior baseline, conformance contract, descriptors, and registry

Freeze current fixture/OpenAI behavior in deterministic tests and establish the provider-neutral adapter conformance expectations before changing observable routing behavior. Introduce or generalize provider/model descriptors, model-family identity, provider-organization independence metadata, acquisition mode, health/capability metadata, credential-reference shape, and adapter registration. Preserve existing OpenAI behavior while fixture and OpenAI become the first adapters evaluated against the shared contract.

### Phase 2: Canonical adapter migration

Move current OpenAI behavior fully behind the canonical provider registry/execution surface while preserving deterministic fixture support and the shared network-free contract suite. Do not represent convergence through the governed execution wrapper as deployed until deployment evidence exists.

### Phase 3: BYOK/BYOM/BYOP secret and policy boundary

Add scoped credential references, secret-broker integration, provider policy, tenant/user authority, rotation/revocation, and private/local provider registration. No raw keys enter CoMind model context.

### Phase 4: Model arbitration

Add explicit arbitration plans, participant identity, independence dimensions, independent-parallel versus critique modes, cross-model isolation/sealing rules, compare/contrast results, contradiction handling, Assumption Validator integration, and bounded escalation.

### Phase 5: Legacy/provider-coupled retrofit

Migrate every inventoried direct provider dependency to the canonical provider layer or document a justified exception with owner and retirement trigger.

### Phase 6: PTSD/private/local modernization

Restore prior PTSD design goals on the shared Greater CoMind architecture, including private/local execution and per-session user/provider selection under modern governance.

### Phase 7: External gateways and live validation

Evaluate gateway adapters such as MyApps/Machine, direct provider APIs, OpenRouter, local inference servers, and other compatible services. Only perform live paid validation after deterministic tests, privacy review, AIMS supplier/risk review, FinOps controls, and explicit authorization are green.

## 14. Verification strategy

Provider expansion must follow CoMind's existing evidence hierarchy.

1. deterministic unit/contract tests with no network;
2. isolated PostgreSQL and runtime integration where persistence is involved;
3. security/privacy validation;
4. AIMS system/supplier inventory and risk/change assessment where applicable;
5. cost and budget validation;
6. provider-adapter conformance with fixtures/mocks;
7. deterministic arbitration tests proving that independent-parallel mode does not expose one participant's output to another before sealing and that required independence dimensions fail closed when they cannot be proven;
8. smallest deliberately bounded live provider test only when required;
9. production/live deployment only through a separately authorized lane.

Provider adapters should pass one shared conformance suite so behavior is evaluated against CoMind contracts rather than provider-specific convenience.

## 15. Architectural non-goals for Issue #104

Issue #104 does not:

- enable a new paid provider;
- create or store provider credentials;
- mutate live Supabase;
- change production routing;
- replace the current OpenAI provider;
- activate MyApps/Machine or another gateway;
- claim that prior PTSD concepts were fully production implemented;
- merge or alter ACP-001 / PR #84;
- create a competing identity, financial, authorization, provider-execution, memory, provenance, supplier-governance, or risk authority;
- claim deployed, operating, compliant, certification-ready, or certified provider independence from architecture documentation alone.

## 16. Long-term target

The long-term CoMind provider layer should make this possible:

```text
ordinary request
    -> one policy-approved model

architecture challenge
    -> primary model + independent parallel reviewer
    -> sealed outputs -> compare/contrast synthesis

research verification
    -> model + evidence retrieval + independent reviewer

sensitive private context
    -> approved private/local model only

high-consequence decision
    -> independent-family/provider review + evidence + contradiction resolution
    -> sealed outputs before synthesis
    -> human escalation when authority or evidence is insufficient

provider outage
    -> policy-approved fallback only if all original constraints still hold
    -> new governed attempt identity for each external request
```

The user should be able to change the cognitive resource without losing CoMind's memory, identity, provenance, governance, or relationship continuity.

## 17. Canonical statement

**CoMind owns the continuity of cognition, not the underlying LLM vendor.**

This principle applies across chat, Virtual Employees, PTSD/private deployments, research, governance, model verification, external gateways, local inference, and future CoMind subsystems.
