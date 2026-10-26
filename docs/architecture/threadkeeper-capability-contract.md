# TK-001 - ThreadKeeper Capability Contract v0.1

Status: Specified  
Classification: Capability  
Canonical concept: `concept:threadkeeper`  
Module lifecycle applies: No  
Current capability maturity: C1 Contracted  
Historical implementation evidence: Fragmentary and non-promotional  
Environment impact: Test and documentation only  
Production change: None  
Owner: CoMind  
Date: 2026-10-26  
Issue: https://github.com/jlhogarth/CoMind/issues/222

## 1. Contract statement

ThreadKeeper maintains governed, evidence-backed continuity state for CoMind. It detects and explains continuity breaks across logical threads, plans, decisions, commitments, and handoffs, then routes a bounded resolution recommendation without owning the underlying memory, execution, epistemic verdict, or approval authority.

ThreadKeeper is a continuity capability. It is not a memory store, conversation archive, task executor, agent transport, truth engine, self-modification engine, or general governance authority.

## 2. Why this boundary exists

ThreadKeeper accumulated responsibilities across CoMind history. The oldest credible artifacts center it on continuity monitoring and change oversight. Later designs associated it with memory/thread coherence, plan tracking, contradiction awareness, approvals, helper supervision, and runtime loop detection. Those references are historically meaningful, but they do not prove that every responsibility belonged to one coherent runtime.

The modern contract therefore preserves the stable historical center and separates adjacent responsibilities into explicit collaborators.

The controlling design principle comes from CoMind Continuity Specification v3.1: continuity preserves intent, epistemic standards, decision quality, ethical bounds, and narrative lineage across time. It is not a raw memory feature, selfhood claim, or persistence objective.

## 3. Archaeological reconstruction

### 3.1 Earliest credible lineage

| Period | Evidence | ThreadKeeper meaning | Canonical interpretation |
| --- | --- | --- | --- |
| June 2025 | Early CoMind memory and governance discussions reconstructed in the Architecture Topology | Memory oversight, change tracking, continuity of what was said and how it changed | Historical lineage only. Supports continuity and lineage responsibilities. |
| 2025-06-21 | `Legacy_Beacon_CoMind_Presentation.docx` | ThreadKeeper named as "Temporal coherence monitoring" beside SEAL, SoulPrint/FoundationThoughts, and Legacy Beacon | Direct historical evidence for temporal continuity monitoring. |
| Late June 2025 | Historical ThreadKeeper Protocol references | Memory oversight, review-before-commit, no autonomous memory edits, Integration Log and revision awareness | Strong historical governance constraint. Does not make ThreadKeeper the memory store. |
| 2025-07-08 | `CoMind_Replit_AI_Prompt.txt` | Seeded as a node whose function is "Monitors continuity" | Direct implementation-intent evidence for a narrow continuity role. |
| July-August 2025 | PTSD and early CoMind application work | Memory threads, symbolic layers, Legacy Threads, identity anchors, continuity across evolving memory | ThreadKeeper interacts with these concepts but does not own their storage. |
| November 2025 | Helper Matrix and governance architecture | Helper Matrix placed under ThreadKeeper for continuity-sensitive supervision | Current relationship survives as bounded governance of continuity-sensitive helper use. |
| Late 2025 | Governance Triad | ThreadKeeper associated with present continuity and plan tracking, with Legacy Beacon and Future Continuity handling different horizons | Supports temporal boundary separation. |
| 2026 | Current repository schema and seed data | ThreadKeeper seed trait is "Continuity engine ensuring coherence and approvals"; belief update log defaults auditor label to `ThreadKeeper` | Current code reference exists, but no dedicated unified ThreadKeeper runtime is proven. |
| 2026 | FinOps and runtime notes | Runtime coherence and loop/stall detection references | Adjacent runtime signals may feed ThreadKeeper. They do not establish ownership of execution monitoring. |
| 2026 | ACP-001 | Bounded continuity checkpoints, authority revalidation, immutable lineage, read-only Foundry reconciliation | Reusable implementation substrate. ACP-001 is not ThreadKeeper and remains independently named. |

### 3.2 Historical identities preserved

The following names are not aliases for ThreadKeeper unless a future evidence-backed lineage decision says otherwise:

- Continuity
- Continuity Watchdog
- Helper Matrix
- SEAL
- Signal Fidelity
- Assumption Validator
- Memory Graph
- Conversation History / conversational event log
- Semantic Thread Layer
- ThreadWeaver / Narrative Cohesion Tracker lineage
- Foundry
- Virtual Employees
- Agent Colony
- Canonical Development Evidence
- Digital Twin
- ACP-001
- Legacy Beacon
- Future Continuity
- Epistemic Integrity Kernel

Historical similarity is insufficient evidence of identity, rename, replacement, or succession.

## 4. Purpose

ThreadKeeper exists to preserve inspectable continuity across time and system boundaries.

Its purpose is to answer, with evidence:

1. What continuity scope are we in?
2. What accepted state, intent, plan, decision, commitment, or handoff is this state descended from?
3. What changed?
4. Is the change authorized, explained, and lineage-preserving?
5. Is there a suspected continuity break, stale assumption, fragmentation, or unresolved conflict?
6. What evidence supports that assessment?
7. Which bounded route should handle the next step?
8. Has an authorized resolution or divergence established a new accepted continuity checkpoint?

## 5. Responsibilities ThreadKeeper owns

ThreadKeeper owns the following responsibilities at the capability boundary.

### 5.1 Continuity scope identity

Maintain stable identifiers for continuity scopes such as:

- logical thread
- workstream
- plan
- decision lineage
- commitment
- handoff
- governed workflow context

A continuity scope is a reference frame, not a duplicate source-of-truth record.

### 5.2 Continuity checkpoints

Maintain or reference immutable, versioned continuity checkpoints representing accepted continuity state.

A checkpoint may include:

- scope identifier
- predecessor checkpoint
- accepted objective or intent reference
- accepted decision references
- unresolved obligations
- authority context reference
- provenance references
- sensitivity and retention metadata
- creation and acceptance time
- integrity digest when technically appropriate

Checkpoint acceptance must be attributable to an authorized external actor or policy decision. ThreadKeeper cannot self-approve a checkpoint.

### 5.3 Continuity assessment

Compare observed state against the accepted continuity checkpoint and classify whether continuity is:

- `INTACT`
- `CHANGED_WITH_LINEAGE`
- `SUSPECTED_BREAK`
- `CONFIRMED_BREAK`
- `UNRESOLVED_CONFLICT`
- `BLOCKED`

The assessment must include evidence, confidence, uncertainty, and the prior state against which the comparison was made.

### 5.4 Break classification

ThreadKeeper may classify continuity problems including:

- context loss
- context decay
- fragmentation
- contradictory accepted states
- narrative overwrite
- broken lineage
- stale assumption
- incomplete handoff
- missing obligation
- unexplained plan divergence
- loop or stalled-progress signal
- identity collision or ambiguous thread binding
- missing provenance

Detection may originate in other systems. ThreadKeeper owns the continuity assessment and resolution policy, not every detector.

### 5.5 Resolution routing

ThreadKeeper may recommend or route a continuity case to one or more bounded handlers:

- restore or rehydrate referenced context
- request evidence or verification
- request Helper Matrix analysis
- request an epistemic assessment
- route to SEAL for governed revision analysis
- request governance review
- request human review
- accept authorized divergence and establish a successor checkpoint
- retain unresolved or blocked state when evidence is insufficient

Routing does not grant the destination new authority.

### 5.6 Continuity evidence

Preserve the provenance of continuity assessments and state transitions, including:

- source references
- evidence references
- prior checkpoint
- current observation
- actor or service
- authority or policy reference
- timestamp
- classification
- confidence and uncertainty
- route selected
- resolution result
- successor checkpoint if one is authorized

### 5.7 Continuity context service

Provide bounded continuity context to authorized consumers such as Helper Matrix, SEAL, GPC, Foundry adapters, Virtual Employees, and other agents.

The context service returns references and compact state. It must not silently replace the authoritative source records.

## 6. Responsibilities ThreadKeeper does not own

### 6.1 Continuity principle

`concept:continuity` is the governing principle. ThreadKeeper implements a bounded continuity capability under that principle. ThreadKeeper does not define CoMind's meaning of continuity by itself.

### 6.2 Continuity Watchdog

Continuity Watchdog detects and reports continuity gaps such as missing context, incompatible state, broken lineage, incomplete handoffs, stale assumptions, and memory gaps.

Boundary:

- Continuity Watchdog detects and reports.
- ThreadKeeper assesses continuity impact and owns continuity resolution policy.
- Continuity Watchdog does not become ThreadKeeper merely because both concern continuity.

### 6.3 Helper Matrix

Helper Matrix orchestrates bounded helper traits for analysis quality.

Boundary:

- ThreadKeeper may supply continuity context.
- ThreadKeeper may request Helper Matrix assistance.
- ThreadKeeper may govern continuity-sensitive Helper Matrix use.
- ThreadKeeper cannot overwrite helper findings.
- ThreadKeeper does not become the general helper orchestrator.

### 6.4 Signal Fidelity and Assumption Validator

Signal Fidelity owns fidelity-oriented analysis. Assumption Validator owns assumption-oriented analysis.

ThreadKeeper may consume their findings as evidence. It does not determine their analytical conclusions.

### 6.5 SEAL

SEAL owns the governed revision and self-evaluation loop where that loop is applicable.

ThreadKeeper supplies continuity state, lineage, and continuity risk. It does not own SEAL's detect-analyze-propose-review-validate-approve-promote cycle, nor does it authorize promotion.

### 6.6 Epistemic Integrity Kernel

EIK governs epistemic rigor where applicable.

ThreadKeeper consumes epistemic summaries or risk findings and tracks their continuity implications. It does not decide truth.

### 6.7 Memory Graph

Memory Graph owns memory relationship topology and retrieval-oriented graph structures.

ThreadKeeper may reference memory entities and lineage but does not store, retrieve, rank, delete, or rewrite underlying memories.

### 6.8 Conversation History / conversational event log

Conversation History owns high-fidelity conversational event capture, sequencing, raw payload retention, recovery checkpoints, promotion evaluation, and conversation-specific retention rules.

ThreadKeeper may consume event IDs, promoted facts, summaries, or bounded references. It must not duplicate the conversation event log or redefine its retention policy.

This contract does not change the dedicated Conversation History development lane.

### 6.9 Semantic Thread Layer

Semantic Thread Layer is a distinct historical construct concerning meaning-bearing thread structure.

ThreadKeeper may consume semantic thread identifiers or lineage if a modern Semantic Thread Layer contract is accepted. This contract does not declare succession, rename, or identity between the two.

### 6.10 ThreadWeaver

ThreadWeaver, historically linked to Narrative Cohesion Tracker, maintained identity or narrative thread structures.

ThreadKeeper may consume resulting thread identity or lineage. This contract does not collapse ThreadWeaver into ThreadKeeper.

### 6.11 Foundry

Foundry owns task execution mechanics including work ownership, leases, retries, fencing, execution context, outcomes, and permitted side effects.

ThreadKeeper may assess continuity signals from Foundry and provide continuity context to Foundry adapters.

ThreadKeeper must not:

- claim or renew a work lease
- dispatch a task
- execute a task
- retry work
- complete a task
- alter fencing authority
- invent execution state

### 6.12 Virtual Employees

Virtual Employees are governed roles and operating identities. ThreadKeeper may provide continuity context to a VE but does not define the VE's identity, employment role, permissions, transport, or execution authority.

### 6.13 Agent Colony

Agent Colony is a distinct multi-agent concept with persistent identities, interactions, and exploratory behavior. ThreadKeeper may support continuity across Colony interactions, but it does not own Colony membership, communication, coordination policy, or execution.

### 6.14 Agent Communication

Agent Communication owns message transport, routing, addressing, envelopes, delivery semantics, and communication-specific thread correlation.

A communication `thread_id` or transport correlation identifier is not automatically a ThreadKeeper semantic continuity scope.

This contract does not change the dedicated Agent Communication development lane.

### 6.15 Canonical Development Evidence

Canonical Development Evidence is the source of truth for consequential development entities, journal events, relationships, research, artifacts, testing, authority, and provenance.

ThreadKeeper must write consequential ThreadKeeper development evidence through that system. It does not become a competing evidence registry.

At runtime, a future ThreadKeeper implementation may use the same evidence principles without making the development evidence registry a general-purpose runtime store.

### 6.16 Digital Twin

Digital Twin is a governed representation built from identity and evidence.

ThreadKeeper may protect continuity of Twin-related intent and lineage, but it is not the Twin's source of identity, memory, values, or authority.

### 6.17 Legacy Beacon and Future Continuity

Legacy Beacon owns long-horizon ethical and generational foresight concerns where applicable.

Future Continuity owns migration and successor-continuity safeguards where applicable.

ThreadKeeper owns present and longitudinal continuity state, not every future or legacy concern.

### 6.18 ACP-001

ACP-001 is a separately named continuity checkpoint and recovery substrate.

ACP-001 already demonstrates useful properties:

- bounded checkpoint size
- immutable state
- predecessor lineage
- integrity digest
- expiry semantics
- authority revalidation
- provenance references
- unresolved obligations
- secret scanning
- read-only reconciliation with Foundry
- explicit refusal to execute, claim work, or grant authority

A future ThreadKeeper implementation should adapt ACP-001 interfaces and data-shape patterns where they fit. ACP-001 must not be silently renamed to ThreadKeeper.

## 7. Inputs

ThreadKeeper accepts normalized continuity observations and references.

Minimum logical input:

```text
ContinuityObservation
  observation_id
  event_type
  source_system
  observed_at
  continuity_scope_id
  subject_refs[]
  prior_checkpoint_ref?
  current_state_refs[]
  finding_type?
  finding_severity?
  confidence?
  uncertainty?
  evidence_refs[]
  actor_ref?
  authority_ref?
  policy_ref?
  trace_id?
  span_id?
  sensitivity
  retention_class
```

Input rules:

1. Prefer references over duplicated authoritative payloads.
2. Preserve source identifiers.
3. Carry sensitivity metadata.
4. Reject or quarantine ambiguous scope identity.
5. Missing evidence must remain missing. ThreadKeeper must not fabricate continuity.
6. Transport identifiers are not semantic identities unless explicitly bound.

## 8. Outputs

### 8.1 Continuity assessment

```text
ContinuityAssessment
  assessment_id
  continuity_scope_id
  checkpoint_ref
  classification
  break_types[]
  evidence_refs[]
  confidence
  uncertainty
  explanation_summary
  recommended_routes[]
  policy_ref?
  authority_required?
  trace_id?
  created_at
```

### 8.2 Continuity case

A durable case for suspected or confirmed continuity problems.

```text
ContinuityCase
  case_id
  continuity_scope_id
  observation_refs[]
  assessment_refs[]
  state
  owner_or_route_ref?
  opened_at
  last_transition_at
  resolution_ref?
  successor_checkpoint_ref?
```

### 8.3 Checkpoint proposal

A bounded candidate successor state. It is not accepted until authorized.

### 8.4 Continuity context response

A compact, reference-oriented view for consumers. It may include accepted checkpoint, unresolved cases, obligations, continuity risks, and provenance references.

## 9. State model

### 9.1 Checkpoint state

Checkpoint records are immutable after acceptance.

Lifecycle:

1. `PROPOSED`
2. `ACCEPTED`
3. `SUPERSEDED`

A superseded checkpoint remains historically addressable.

### 9.2 Continuity case state

```text
OBSERVED
  -> ASSESSED
  -> ROUTED
  -> RESOLVED

ROUTED
  -> ACCEPTED_DIVERGENCE

OBSERVED | ASSESSED | ROUTED
  -> BLOCKED

OBSERVED | ASSESSED | ROUTED
  -> UNRESOLVED
```

A case may be reassessed when new evidence arrives. Reassessment creates a new evidence-bearing transition rather than rewriting the prior decision.

### 9.3 Authorized divergence

Not every difference is a defect.

When a competent authority intentionally changes intent, plan, decision, policy, or scope:

1. preserve the predecessor checkpoint,
2. record the authority and evidence,
3. classify the change as authorized divergence,
4. create a successor checkpoint,
5. retain lineage between old and new state.

This prevents continuity from becoming rigidity.

## 10. Interfaces

The contract defines logical interfaces, not a required deployment topology.

### 10.1 `observe`

Accept a continuity observation and bind it to a continuity scope.

### 10.2 `assess`

Compare observations and current references to the accepted checkpoint and produce a continuity assessment.

### 10.3 `open_case`

Open or associate an unresolved continuity case when assessment requires follow-up.

### 10.4 `route`

Return a bounded route recommendation with evidence and required authority.

### 10.5 `propose_checkpoint`

Produce a successor checkpoint proposal.

### 10.6 `accept_checkpoint`

Record externally authorized acceptance. The caller must supply verifiable authority evidence.

### 10.7 `get_context`

Return compact continuity context for an authorized consumer.

### 10.8 `get_lineage`

Return predecessor and successor continuity lineage using references.

### 10.9 `record_resolution`

Record an externally completed resolution and close or advance the case.

## 11. Authority boundaries

ThreadKeeper has authority to:

- maintain continuity scope identifiers
- compare bounded states
- classify continuity status
- open a continuity case
- recommend a route
- request verification or review
- emit a pause recommendation
- produce a checkpoint proposal
- preserve continuity evidence and lineage

ThreadKeeper does not have authority to:

- approve its own checkpoint
- grant itself or another actor permissions
- mutate durable memory content because continuity appears broken
- rewrite conversation history
- execute a Foundry task
- send agent messages merely because continuity is broken
- change a Digital Twin identity
- decide epistemic truth
- override EIK or human authority
- change a canonical development rule outside the evidence and governance process
- optimize for its own persistence
- silently discard contradictory evidence

Where enforcement is required, an authorized external control plane must enforce the decision.

## 12. Governance rules

1. Human intent remains controlling where human authority applies.
2. No autonomous durable memory edits.
3. No silent rewrite of accepted continuity history.
4. No self-approval.
5. No selfhood or persistence objective.
6. Explicit uncertainty is mandatory when evidence is incomplete.
7. Contradictory evidence is preserved, not flattened into a convenient narrative.
8. Authorized change is allowed and must preserve lineage.
9. Every consequential transition is attributable.
10. Every route preserves the destination system's authority boundary.
11. Fail closed when scope identity, authority, or checkpoint integrity cannot be established.
12. Historical behavior does not automatically become current authority.

## 13. Evidence and provenance obligations

ThreadKeeper evidence should adapt W3C PROV concepts:

- entities for observations, checkpoints, assessments, cases, and resolutions
- activities for assessment and routing transitions
- agents for human, service, policy, or governed actor attribution
- derivation links between predecessor and successor state
- responsibility attribution for acceptance and resolution

Every consequential assessment must reference:

- the observation or source state
- the accepted checkpoint
- supporting evidence
- actor or service
- authority or policy where relevant
- time
- confidence and uncertainty
- resulting transition

ThreadKeeper must not store private chain-of-thought. Explanations should be bounded summaries supported by source references.

For CoMind development, TK-001 changes and research must be written through Canonical Development Evidence.

## 14. Persistence requirements

### 14.1 Control-plane persistence

A future implementation may persist compact continuity control state in managed PostgreSQL, including:

- scope identifiers
- checkpoint metadata
- continuity cases
- assessments
- lineage
- evidence references
- authority references
- transition metadata

### 14.2 High-volume telemetry

High-volume traces, detailed runtime telemetry, and large observational payloads belong in the appropriate data plane such as SDN or existing telemetry stores. ThreadKeeper should retain references where possible.

### 14.3 Conversation payloads

Raw conversation content remains in the Conversation History subsystem. ThreadKeeper should normally persist conversation references, promoted facts, or bounded summaries rather than raw event copies.

### 14.4 Append-oriented history

Accepted state and consequential transitions are append-oriented. Corrections supersede prior records with explicit lineage rather than silently overwriting them.

## 15. Observability

A future implementation should expose at least:

- continuity observations processed
- assessments by classification
- break counts by type
- unresolved case count and age
- mean time to continuity resolution
- accepted-divergence count
- checkpoint age and staleness
- incomplete handoff count
- stale-assumption count
- route outcomes
- evidence completeness
- missing provenance count
- scope identity collision count
- false-positive or dismissed break rate
- dependency degradation
- policy or authority validation failures

OpenTelemetry trace and span correlation may be used across service boundaries. Trace context is correlation metadata, not semantic continuity identity.

## 16. Security and privacy

1. Apply least privilege to continuity state and interfaces.
2. Carry sensitivity classification with observations and outputs.
3. Do not expose secrets or raw credentials in checkpoint metadata.
4. Do not place sensitive content in clear-text event context attributes when an opaque reference is sufficient.
5. Support masking or redaction for auditable decision records.
6. Preserve access-control boundaries of referenced source systems.
7. Avoid duplicating raw conversation content, health data, identity content, or other sensitive source material without a specific approved need.
8. Separate logical expiry from physical deletion policy.
9. Integrity failures must block restoration or acceptance.
10. Audit access and consequential state transitions.

## 17. Failure modes

ThreadKeeper must explicitly handle:

| Failure mode | Required behavior |
| --- | --- |
| Stale checkpoint treated as current | Detect staleness, lower confidence, require refresh or review. |
| False continuity break | Preserve assessment and dismissal evidence; do not mutate source state. |
| Missed continuity break | Surface through monitoring and evaluation; preserve post-incident evidence. |
| Ambiguous thread or scope identity | Quarantine or block rather than merge scopes by guess. |
| Duplicate authoritative state | Prefer references and canonical ownership; do not create a competing source of truth. |
| Missing provenance | Mark assessment incomplete or blocked. |
| Escalation loop | Detect repeated route cycles and escalate to a bounded higher authority or human review. |
| Dependency unavailable | Return degraded or blocked state, never fabricate successful continuity. |
| Authority unavailable or stale | Do not accept a checkpoint or perform an authority-dependent transition. |
| Sensitive metadata leak | Redact, quarantine, and preserve audit evidence according to security policy. |
| Foundry state conflict | Read authoritative Foundry state; do not modify leases or execution. |
| Conversation reference unavailable | Preserve unresolved reference and do not reconstruct raw history from plausibility. |
| Silent delegated work loss | Keep unresolved obligation visible until disposition is evidenced. |

## 18. Adaptation rather than reinvention

### 18.1 ACP-001

Preferred internal substrate for checkpoint envelope, integrity, expiry, authority revalidation, unresolved obligations, lineage, and read-only Foundry reconciliation.

Adapt, do not rename.

### 18.2 W3C PROV

Use provenance concepts for derivation, activity, entity, agent, and responsibility relationships.

Source: https://www.w3.org/TR/prov-dm/

### 18.3 OpenTelemetry

Use trace and span correlation for cross-service observability.

Source: https://opentelemetry.io/docs/concepts/context-propagation/

### 18.4 CloudEvents

Use CloudEvents-style stable event-envelope attributes where an interoperable event representation is useful. Keep sensitive data out of clear-text context fields when possible.

Source: https://github.com/cloudevents/spec/blob/main/cloudevents/spec.md

### 18.5 Auditable policy decisions

OPA decision-log patterns are useful for recording decision identifiers, policy or bundle revision, inputs/results, trace correlation, and masking.

OPA is optional. Using the pattern does not make OPA or ThreadKeeper the authority source.

Source: https://www.openpolicyagent.org/docs/management-decision-logs

## 19. Dependency relationships

### 19.1 Canonical relationships retained

- GPC `USES` ThreadKeeper.
- Continuity Watchdog `SUPPORTS` ThreadKeeper.
- ThreadKeeper `GOVERNS` Helper Matrix for continuity-sensitive use.
- SEAL `DEPENDS_ON` ThreadKeeper for continuity context.

### 19.2 Canonical relationship added by TK-001

- Continuity `GOVERNS` ThreadKeeper.

Rationale: Continuity Specification v3.1 defines the governing principle and explicitly places ThreadKeeper in the continuity runtime. This relationship was conceptually present in CCI prose but missing from the active typed graph.

Priority weight: 1.0.

### 19.3 Relationships not promoted by this contract

This contract does not automatically promote new active DPE edges between ThreadKeeper and:

- Conversation History
- Memory Graph
- Foundry
- Virtual Employees
- Agent Colony
- Digital Twin
- Semantic Thread Layer
- ThreadWeaver
- ACP-001
- DreamSpace

These interfaces are real boundary statements, but active dependency-graph promotion requires the appropriate relationship evidence and architectural need. DreamSpace remains quarantined.

## 20. Capability evidence maturity

This bounded maturity model applies to non-module concepts. It does not replace the module lifecycle.

- `C0 Recovered`: credible identity and historical lineage exist.
- `C1 Contracted`: current canonical purpose, boundaries, interfaces, governance, and acceptance criteria are approved and registered.
- `C2 Implemented`: an implementation demonstrably satisfies the current contract with test evidence.
- `C3 Integrated`: required cross-system interactions are verified against real contracts.
- `C4 Operational`: target-environment operation, observability, governance, and acceptance evidence are verified.

ThreadKeeper state after TK-001 acceptance:

- Historical maximum: repeated design, schema, seed, and implementation fragments exist, but no unified historical runtime satisfying TK-001 is proven.
- Current canonical maturity: `C1 Contracted`.
- Module lifecycle: not applicable.

No prose, seed row, auditor label, historical code, or adjacent ACP implementation promotes ThreadKeeper to C2.

## 21. Acceptance criteria for TK-001

TK-001 is accepted only if all of the following are true:

1. ThreadKeeper is registered as a Capability, not a Module.
2. Historical identities remain distinct unless explicit lineage evidence says otherwise.
3. The current purpose and non-ownership boundaries are documented.
4. Continuity governs ThreadKeeper in the canonical typed graph.
5. Continuity Watchdog remains detector/reporter while ThreadKeeper owns continuity assessment and resolution policy.
6. Helper Matrix remains a separate orchestration service and its findings cannot be overwritten by ThreadKeeper.
7. SEAL remains owner of its governed revision loop and promotion authority remains external.
8. Conversation History remains owner of raw conversational event persistence, sequencing, recovery, and retention.
9. Foundry remains owner of task execution, leases, retries, fencing, outcomes, and side effects.
10. Agent Communication remains a separate lane and transport thread IDs are not silently promoted to semantic continuity identities.
11. ACP-001 remains independently named and may be adapted as a checkpoint/recovery substrate.
12. Every consequential ThreadKeeper assessment and transition requires provenance references.
13. Accepted checkpoint changes require external authority evidence.
14. Authorized divergence preserves predecessor lineage rather than being treated automatically as failure.
15. Missing or degraded evidence yields unresolved, degraded, or blocked state rather than fabricated continuity.
16. Security and privacy rules prevent secrets and unnecessary sensitive payload duplication.
17. Current maturity is C1 Contracted only.
18. CCI, EDG, DPE-001, DPE-002, and Canonical Development Evidence are reconciled.
19. MCTRL passes after the consequential canonical changes.
20. No production change occurs.

## 22. Implementation planning gate

Implementation planning may begin only after TK-001 canonical reconciliation and MCTRL verification.

The preferred first implementation-planning question is:

How can ThreadKeeper reuse ACP-001 checkpoint and recovery primitives, Canonical Development Evidence patterns, existing Conversation History references, and existing observability infrastructure while adding the minimum new continuity-specific state and interfaces?

Implementation planning must not absorb:

- Conversation History development
- Agent Communication development
- Helper Matrix implementation
- SEAL implementation
- Foundry execution mechanics
- broad Digital Twin implementation

## 23. Historical and current source set

Primary CoMind sources:

- CoMind Continuity Specification v3.1
- CoMind Architecture Topology Reconstruction v0.1
- CCI-001 CoMind Canonical Concept Index v0.4
- CoMind Helper Matrix and Epistemic Helper Traits Specification v0.1
- CoMind Historical Module Lineage Register v0.1
- CoMind Architecture Library Home
- CoMind Canonical Development Journal and Evidence Registry
- EDG-001
- DPE-001 v0.2
- DPE-002 v0.1
- Legacy_Beacon_CoMind_Presentation.docx, 2025-06-21
- CoMind_Replit_AI_Prompt.txt, 2025-07-08
- current repository `db/sql/v2/11_seed.sql`
- current repository `db/sql/v2/07_schema_security_compliance_auth.sql`
- current repository `db/sql/v2/14_conversational_continuity.sql`
- ACP-001 checkpoint, recovery, integration tests, and operations guide
- Foundry lifecycle and reconciliation code

External adaptation sources were written through to Canonical Development Evidence as `RS-20261026-0001` through `RS-20261026-0004` before this contract used them.

## 24. Reconciliation record

TK-001 does not erase or rewrite historical ThreadKeeper meanings.

It establishes the current canonical boundary while preserving:

- direct historical artifacts,
- reconstructed lineage,
- current code references,
- separate adjacent identities,
- uncertainty where succession is unproven,
- future ability to revise this contract through explicit evidence and supersession.

Any future change to this contract must preserve prior versions and the evidence supporting the change.
