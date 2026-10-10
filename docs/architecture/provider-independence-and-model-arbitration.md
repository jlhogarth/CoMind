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
6. Provider fallback must never silently weaken privacy, data-classification, authority, residency, cost, safety, or model-family-independence requirements.
7. Actual upstream provider, model, and model-family identity must be preserved whenever they are known and material to provenance.
8. A second opinion is not independent when it resolves to the same model family as the primary execution.
9. Consensus is evidence, not truth. Dissent, abstention, unresolved contradiction, insufficient evidence, and human escalation are first-class outcomes.
10. Provider-specific implementation may exist only behind provider-neutral CoMind contracts or as a documented temporary exception with a migration plan.

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

The existing governed provider execution wrapper remains the common execution boundary for paid or otherwise controlled provider calls. New adapters must inherit the same retry, fingerprint, role, attempt, provenance, and fail-closed properties.

### 5.3 Budget authority and FinOps

The existing durable budget authority, provider telemetry, quotation, settlement, and spending controls remain canonical. Multi-provider support may add provider-specific rate sources and quote adapters, but must not create a second financial ledger.

### 5.4 Foundry capability broker

Virtual Employees and agents must obtain provider use as a governed capability through the existing Foundry authorization model. They do not receive API keys or unrestricted provider clients.

### 5.5 Memory and provenance

Provider replacement must not fragment durable CoMind memory or create provider-owned continuity. Provider execution provenance must remain linked to CoMind conversation, agent-run, workflow, project, and decision lineage as applicable.

## 6. Canonical provider-neutral contracts

The implementation phase should converge on the following conceptual contracts. Names are descriptive architecture names, not a claim that these exact types already exist.

### 6.1 ProviderDescriptor

Required characteristics include:

- provider identifier
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

### 6.2 ModelDescriptor

Required characteristics include:

- requested model identifier
- canonical model identifier when resolvable
- model family
- provider
- upstream provider when a gateway is used
- context/input/output limits
- reasoning/tool/modality capabilities
- lifecycle status
- cost policy reference
- privacy/data-policy compatibility
- independence class for arbitration

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
- required independence
- maximum cost/exposure
- timeout/retry policy
- locality/residency requirements
- capability/tool permissions
- human approval requirements

### 6.5 ModelArbitrationPlan

The plan describes why more than one model is being used and what constitutes adequate independence. It should include:

- primary participant
- reviewer/critic participants
- excluded model families
- required independent-family count
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
- required model-family independence
- prior empirical performance for the task class

Routing output must preserve the decision basis as bounded provenance.

## 8. Model arbitration and independent second opinion

### 8.1 Independence definition

Provider diversity and model-family diversity are distinct.

Examples:

- OpenAI direct plus OpenAI through a gateway is not model-family independent.
- Claude direct plus Claude through a gateway is not model-family independent.
- GPT plus Claude is model-family independent even when both are accessed through one transparent gateway, provided actual upstream identity is known.
- An opaque gateway response whose upstream model cannot be verified cannot be counted as an independent model-family vote for a high-consequence decision.

### 8.2 Arbitration outcomes

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

### 8.3 Evidence before consensus

For factual or high-consequence disagreements, the resolution sequence should prefer:

1. identify the exact disputed claim;
2. compare assumptions and evidence;
3. retrieve authoritative evidence where available;
4. re-evaluate with model-family independence preserved;
5. use CoMind Assumption Validator / contradiction resolution controls;
6. escalate when evidence remains insufficient or authority is required.

### 8.4 Cost-bounded arbitration

Arbitration must be bounded. The router should use the smallest participant set that satisfies the risk and independence policy. Low-risk tasks may use one model. Higher-risk tasks may require one independent critic. High-consequence tasks may require multiple independent families plus evidence retrieval and human approval.

## 9. Gateway and aggregator policy

Services such as MyApps/Machine, OpenRouter, or future model gateways may be useful CoMind adapters. They are not CoMind governance authorities.

A gateway may provide model routing, billing aggregation, comparison, managed credentials, or fallback. CoMind must still retain:

- provider policy
- model-family independence rules
- budget authority
- execution identity
- user/organization authority
- privacy/data classification
- provenance
- audit
- evidence and contradiction resolution

For an independence claim, CoMind must record the actual upstream model and family when available. If the gateway cannot reveal or guarantee upstream identity, that execution may still be useful for ordinary inference but cannot satisfy a strict independent-second-opinion requirement.

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

For sensitive modules, including PTSD or other future health-related deployments, policy may require local/private models, approved enterprise endpoints, zero-retention agreements, reduced context, or explicit user consent.

Audit records should store bounded execution metadata rather than automatically copying full prompt context. Appropriate records include:

- CoMind execution identity
- provider/model/model-family identity
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

### Phase 1: Provider-neutral descriptors and registry

Introduce or generalize provider/model descriptors, model-family identity, acquisition mode, health/capability metadata, credential references, and adapter registration. Preserve existing OpenAI behavior.

### Phase 2: Canonical adapter migration

Move current OpenAI behavior fully behind the canonical provider registry/execution surface. Preserve deterministic fixture support. Add network-free contract tests for provider interchangeability.

### Phase 3: BYOK/BYOM/BYOP secret and policy boundary

Add scoped credential references, secret-broker integration, provider policy, tenant/user authority, rotation/revocation, and private/local provider registration. No raw keys enter CoMind model context.

### Phase 4: Model arbitration

Add explicit arbitration plans, participant identity, model-family independence rules, compare/contrast results, contradiction handling, Assumption Validator integration, and bounded escalation.

### Phase 5: Legacy/provider-coupled retrofit

Migrate every inventoried direct provider dependency to the canonical provider layer or document a justified exception with owner and retirement trigger.

### Phase 6: PTSD/private/local modernization

Restore prior PTSD design goals on the shared Greater CoMind architecture, including private/local execution and per-session user/provider selection under modern governance.

### Phase 7: External gateways and live validation

Evaluate gateway adapters such as MyApps/Machine, direct provider APIs, OpenRouter, local inference servers, and other compatible services. Only perform live paid validation after deterministic tests, privacy review, FinOps controls, and explicit authorization are green.

## 14. Verification strategy

Provider expansion must follow CoMind's existing evidence hierarchy.

1. deterministic unit/contract tests with no network;
2. isolated PostgreSQL and runtime integration where persistence is involved;
3. security/privacy validation;
4. cost and budget validation;
5. provider-adapter conformance with fixtures/mocks;
6. smallest deliberately bounded live provider test only when required;
7. production/live deployment only through a separately authorized lane.

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
- create a competing identity, financial, authorization, provider-execution, memory, or provenance authority.

## 16. Long-term target

The long-term CoMind provider layer should make this possible:

```text
ordinary request
    -> one policy-approved model

architecture challenge
    -> primary model + independent-family critic

research verification
    -> model + evidence retrieval + independent reviewer

sensitive private context
    -> approved private/local model only

high-consequence decision
    -> independent-family quorum + evidence + contradiction resolution
    -> human escalation when authority or evidence is insufficient

provider outage
    -> policy-approved fallback only if all original constraints still hold
```

The user should be able to change the cognitive resource without losing CoMind's memory, identity, provenance, governance, or relationship continuity.

## 17. Canonical statement

**CoMind owns the continuity of cognition, not the underlying LLM vendor.**

This principle applies across chat, Virtual Employees, PTSD/private deployments, research, governance, model verification, external gateways, local inference, and future CoMind subsystems.
