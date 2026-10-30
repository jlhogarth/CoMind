# GER-001 Governed Epistemic Reasoning Foundation

Status: implementation candidate
Issue: #378
Environment: Test-first
Production activated: false
Policy version: `ger-001-v1`

## 1. Canonical definition

Governed Epistemic Reasoning, GER, is the CoMind architectural layer that governs how material beliefs and conclusions are formed, challenged, tested, revised, used, monitored, and reopened.

GER does not define truth by decree. It requires CoMind to preserve the evidence and governance conditions needed to justify what is believed, distinguish what remains uncertain, preserve viable alternatives, and separate reasoning quality from authority to decide or act.

Canonical lifecycle:

`Observe -> Preserve -> Connect -> Hypothesize -> Challenge -> Test -> Explain -> Conclude -> Decide -> Act -> Monitor -> Reopen`

The lifecycle is conceptual, not a requirement that every object pass through every state. GER uses governed state families appropriate to the object and preserves append-only transition history.

## 2. Foundational invariants

1. Confidence is not evidence.
2. High confidence does not grant authority.
3. Retrieval relevance does not establish truth.
4. Observation, inference, interpretation, assumption, hypothesis, conclusion, decision, authority, and action remain distinguishable.
5. A novel connection is not a fact.
6. Competing explanations remain visible until evidence justifies disposition.
7. Contradictory, rejected, superseded, failed, and inconclusive evidence is retained with lineage rather than deleted from history.
8. Unknown rigor inputs increase scrutiny rather than reducing it.
9. Material conclusions require provenance, uncertainty basis, and reopening conditions.
10. Private chain-of-thought is not a GER evidence requirement. GER persists inspectable structured rationale, evidence references, tests, decisions, and authority records.
11. A system may abstain, remain inconclusive, or request more evidence. Closure is not mandatory.
12. Production activation remains separately governed.

## 3. Recovered current-state architecture

GER composes existing CoMind capabilities rather than replacing them.

| Capability | Recovered state | GER relationship |
| --- | --- | --- |
| Epistemic Integrity Kernel, EIK | Current concept with boundary under review; no verified runtime under the historical name established by the current Helper Matrix review | GER absorbs the broader architectural responsibility. EIK remains lineage and may become an output-gate component under GER if later runtime evidence supports that boundary. |
| Helper Matrix | Detailed modern specification; current runtime not established under the historical name | GER governs helper findings as advisory epistemic evidence. Helper Matrix remains a possible orchestration component, not the truth authority. |
| Signal Fidelity | Current epistemic helper concept under review | Composed as claim-to-evidence quality analysis. |
| Assumption Validator | Current epistemic helper concept under review | Composed as premise discovery and premise-drift analysis. |
| Continuity Watchdog | Canonical candidate | Supplies continuity contradictions and missing-context findings. ThreadKeeper retains continuity ownership. |
| ThreadKeeper | C4 Operational in bounded Test; explicitly does not own epistemic truth | Supplies accepted continuity context, lineage, branch/merge semantics, and reopening-relevant changes. |
| RPDA | Current governed decision architecture concept | Supplies separation among situation, perception, observation, inference, recommendation, decision, authorization, and action. GER governs epistemic quality upstream and across that chain. |
| Canonical Development Evidence | Current relational evidence architecture | Reused for development evidence, concept identity, typed relationships, and journal lineage. GER does not create a competing development evidence store. |
| `comind.cm_evidence` | Populated operational evidence table | Reused as an operational evidence reference where the owning workflow already writes there. GER does not redefine its authority. |
| Legacy decision-tree tables | Present, currently empty at GER-001 recovery | Historical/narrow substrate only. Not adopted as GER's decision model. |
| Legacy `cm_ilp_hypothesis` | Present, currently empty at GER-001 recovery | Historical/narrow hypothesis substrate only. Not adopted as the GER hypothesis model without a separate lineage decision. |
| CE-003 Missingness and Forward Reasoning | Implemented and accepted | Reused as a development-time missingness scan. GER does not duplicate its operational-control scope. |
| IIC-007 / IIC-008 | Planned integrity evidence envelope and Implementation Reality Graph | GER must interoperate. It must not create a second implementation-claim graph. |
| CP-04 | Active stale-memory and contradiction evaluation proof | Supplies adversarial evaluation evidence for stale and contradictory inputs. GER does not alter the frozen protocol. |
| Foundry and Virtual Employee lifecycle | Operational and active development | GER evaluates reasoning artifacts, but capability and action authority remain Foundry/governance responsibilities. |
| Conversation History | Governed raw and derived history boundaries | GER may reason over attributed historical evidence but cannot silently promote retrieval into memory, identity, or current truth. |
| RuleBook | Governed rule authority and reconciliation | GER consumes applicable rules and records which rule authority shaped a conclusion. It cannot self-authorize exceptions. |

## 4. GER responsibility boundary

GER owns or governs:

- epistemic object contracts;
- claim/evidence/provenance relationships;
- uncertainty and confidence basis requirements;
- explicit assumptions;
- competing-hypothesis handling;
- contradiction visibility;
- falsification and discriminating-test requirements;
- conclusion-readiness rules;
- proportional epistemic rigor classification;
- reasoning-review requirements;
- epistemic transition history;
- reopening semantics;
- structured explanation requirements;
- epistemic health and degraded-review signals.

GER does not own:

- raw conversation storage;
- general memory persistence;
- continuity ownership;
- task execution;
- agent identity;
- capability grants;
- financial authorization;
- Production authorization;
- final human decisions;
- security policy ownership;
- RuleBook authority;
- Digital Twin identity truth;
- private chain-of-thought capture.

## 5. Canonical terminology and ontology

GER-001 evaluates the requested object vocabulary and normalizes it into four logical families.

### 5.1 Assertion family

- **Observation:** attributed record of something perceived, measured, reported, or read. Observation status says what was observed, not whether the interpretation is correct.
- **Claim:** proposition that can be supported, contradicted, scoped, tested, or left unresolved.
- **Fact:** not a separate storage primitive. It is a claim whose status meets an applicable domain and rigor policy. The evidence and policy basis remain inspectable.
- **Inference:** proposition derived from other evidence or assertions through an identified reasoning step.
- **Assumption:** premise used without sufficient direct establishment for the current purpose.
- **Hypothesis:** testable or challengeable explanatory proposition.
- **Competing hypothesis:** ordinary hypothesis connected to another by an explicit competition relation. No duplicate physical type is required.
- **Connection candidate:** proposed relationship among previously disconnected items. It is intentionally non-factual until examined and promoted through a separate governed transition.
- **Conclusion:** current epistemic disposition reached after applicable evidence, challenge, testing, alternatives, and uncertainty handling.

### 5.2 Evidence family

- **Evidence:** inspectable material offered for or against a claim or hypothesis.
- **Source:** provenance identity and retrieval/capture context for evidence.
- **Testimony:** attributed statement from a person, system, agent, or external source. Testimony is evidence, not automatic fact.
- **Test:** planned discriminating evaluation with an expected interpretation.
- **Test result:** immutable result, including negative, failed, unsupported, and inconclusive outcomes.

### 5.3 Control and challenge family

- **Contradiction:** explicit incompatibility or material tension between assertions, evidence, states, or predictions. A contradiction is not silently resolved by recency or confidence.
- **Uncertainty:** structured statement of what is not known, bounded, measured, current, or resolved.
- **Confidence assessment:** calibrated assessment with a stated basis. Confidence is not evidence and cannot grant authority.
- **Falsifier:** observation or condition that would materially weaken or reject a claim or hypothesis.
- **Unresolved question:** known information gap with materiality and optional next test.
- **Challenge:** recorded critique of evidence, inference, assumptions, scope, bias, or closure.
- **Review:** role-separated evaluation of a reasoning artifact or transition.
- **Exception:** explicit governed departure from a normal requirement with authority, scope, rationale, expiry/review condition, and preserved dissent.
- **Edge case:** condition that challenges the applicability or boundary of the current reasoning model.
- **Reopening trigger:** future evidence or condition that requires reconsideration of a prior conclusion.

### 5.4 Downstream governance family

- **Decision:** choice by an authorized actor. A conclusion may inform a decision but cannot silently become one.
- **Action:** execution under separate authority and capability. GER may block, warn, require review, or provide evidence, but epistemic confidence does not create permission.

## 6. Logical data architecture

GER-001 intentionally does not add database tables. The recovered repository and Test database already contain overlapping evidence and relationship substrates, while IIC-008 is explicitly evaluating a derived implementation graph. Creating new persistence now would risk a second source of truth.

The future GER persistence model should be implementable through a small logical envelope rather than one table per noun:

1. **Epistemic case**
   - bounded investigation, question, decision-support request, or reasoning context;
   - scope, owner, authority context, applicable policies, rigor class, status.
2. **Epistemic assertion**
   - object type from the assertion family;
   - statement/payload, subject, temporal scope, provenance, current epistemic state;
   - no destructive overwrite of prior states.
3. **Epistemic relationship**
   - supports, contradicts, assumes, derived_from, competes_with, tests, falsifies, weakens, explains, supersedes, reopens, decided_by, authorized_by, acted_by;
   - evidence reference and validity interval where meaningful.
4. **Epistemic event**
   - append-only state transition, challenge, review, confidence reassessment, conclusion, reopen, or exception event;
   - actor, authority, timestamp, rationale, evidence references.
5. **Control record**
   - tests/results, falsifiers, unresolved questions, review requirements, reopening triggers, and monitored conditions.

Physical persistence is deferred to GER-002 after reconciliation with Canonical Development Evidence, operational evidence, IIC-007, IIC-008, ThreadKeeper lineage, and Digital Twin storage. GER-002 must prove why specialization is necessary before adding tables.

## 7. Epistemic state model

GER-001 defines these canonical states:

`Unknown -> Observed -> Suspected -> Investigated -> Corroborated -> Challenged -> Tested -> Supported -> Rejected | Inconclusive -> Concluded -> Acted Upon -> Monitored -> Reopened`

This is not one mandatory linear pipeline. GER-001 implements a transition policy that prevents unsupported jumps such as `Suspected -> Concluded` while allowing challenge and reopening from accepted states.

Required transition evidence:

- actor reference;
- rationale;
- supporting evidence reference except for the initial creation of a suspicion;
- authority reference when the transition itself crosses a governed authority boundary;
- preserved previous state and history.

Rejected, inconclusive, superseded, and reopened states remain reconstructable.

## 8. Proportional epistemic rigor

The original conceptual product of consequence, uncertainty, reversibility, authority, scope, and external impact is not used literally. Multiplication can hide a critical dimension when another dimension is zero and creates false precision.

GER-001 instead uses a versioned monotonic policy with six 0 to 4 dimensions:

- consequence;
- uncertainty;
- irreversibility;
- authority sensitivity;
- scope;
- external impact.

A weighted score provides a baseline classification, while hard floors prevent critical dimensions from being averaged away. Unknown required dimensions force at least class 3 review. Critical consequence, irreversibility, external impact, or named critical triggers force class 4.

Initial versioned weights in `ger-001-v1` are:

- consequence 0.30;
- uncertainty 0.20;
- irreversibility 0.20;
- authority sensitivity 0.10;
- scope 0.10;
- external impact 0.10.

These weights are policy configuration, not scientific constants. They must remain versioned, testable, reviewable, and replaceable without rewriting historical assessments.

### Rigor classes

- **R0 Minimal:** low consequence, reversible, informational. Basic attribution and normal capability authority still apply.
- **R1 Basic:** explicit evidence and assumptions, cheap verification where available, material uncertainty exposed.
- **R2 Material:** supporting and contradicting evidence separated, alternatives considered, discriminating test when feasible, falsifier/reopening condition required.
- **R3 High:** strong provenance, independent or role-separated review, meaningful tests where testable, explicit human approval for high-consequence action, monitored reopening owner.
- **R4 Critical:** independent/adversarial validation where feasible, complete evidence/decision/authorization/action lineage, no self-approval of exceptions, explicit human authority, rollback/containment and monitored reopening where applicable.

## 9. Competing hypothesis and falsification model

A GER investigation may contain multiple hypotheses simultaneously. Each hypothesis retains:

- evidence for;
- evidence against;
- observations it explains;
- observations it fails to explain;
- assumptions;
- uncertainty;
- falsifiers;
- predicted observations;
- tests and results;
- confidence assessment and basis;
- status and history.

GER must identify the cheapest useful next test by considering expected discriminatory value, cost, risk, reversibility, time, and authority. Lowest cost alone is not enough if a test cannot distinguish the leading explanations.

Confirmation-bias control requires explicit evidence-against review at R2 and above. Premature-closure control blocks conclusion when material contradictions remain unresolved unless a separately authorized exception records why proceeding is still justified.

Counterfactual reasoning remains labeled as simulation or hypothesis and cannot be written back as observed history.

## 10. Novel connection handling

A detected relationship among observations, historical events, concepts, users, agents, or external information begins as `connection_candidate`.

A connection candidate may be:

- challenged;
- scoped;
- linked to evidence;
- converted into one or more hypotheses;
- tested;
- rejected;
- left unresolved.

It cannot be promoted directly to fact or identity. Promotion requires a separate claim or hypothesis with provenance, evidence, uncertainty, and applicable rigor review.

This rule is especially important for Digital Twin personalization because repeated correlation must not silently harden into a user identity claim.

## 11. Conclusion and reopening model

A material conclusion must answer:

1. What is currently believed?
2. What supports it?
3. What contradicts it?
4. Where did the evidence originate?
5. What assumptions are load-bearing?
6. Which competing explanations remain viable?
7. What evidence is missing?
8. What would falsify or materially weaken it?
9. Which tests were performed and what were their outcomes?
10. What tests remain possible?
11. What uncertainty remains and why?
12. What rigor class governed closure?
13. Who reviewed it?
14. Who has authority to decide?
15. What action followed, if any?
16. What conditions reopen it?

Reopening does not overwrite the prior conclusion. It creates a successor state that references the original conclusion and new material evidence.

Canonical reopening reasons include:

- new material evidence;
- new contradiction;
- source invalidation or staleness;
- changed assumption;
- failed prediction;
- failed or reversed test;
- policy change;
- authority change;
- confidence degradation;
- external state change;
- scheduled review.

## 12. Authority and Agent integration

GER enforces this separation:

`knowledge/evidence -> reasoning -> conclusion -> recommendation -> decision -> authority -> action`

An Agent or Virtual Employee may perform reasoning only within the scope, tools, data, and evidence obligations granted to it. GER does not expand those grants.

Every consequential Agent action should eventually be able to link:

- owner;
- actor;
- agent;
- role;
- authority;
- capability set;
- supervisor;
- delegation rules;
- budget;
- evidence obligations;
- Foundry profile;
- lifecycle state;
- external resources;
- external identity where applicable;
- GER case/conclusion that informed the action.

A high-confidence agent conclusion without an authority reference remains non-actionable.

GER-001 does not modify the active VE engineering standard lane. GER-004 will integrate only after the VE standard boundary is accepted or reconciled.

## 13. Digital Twin integration

Digital Twin cognition must retain distinct provenance classes:

- explicitly stated by the user;
- directly observed;
- imported from an attributed source;
- inferred;
- simulated/counterfactual;
- uncertain;
- contradicted;
- superseded;
- prohibited from inference without sufficient evidence or authorization.

Every durable inferred Twin assertion should carry:

- source evidence references;
- inference method/version;
- temporal validity;
- uncertainty/confidence basis;
- contradiction status;
- user correction history where applicable;
- promotion authority;
- reopening conditions.

Inference must not silently become identity. GER-005 will define the persistent promotion contract with the Digital Twin architecture.

## 14. Operational visibility and Operator Console plan

GER should eventually expose only data backed by durable capability. Planned views include:

- active epistemic cases/investigations;
- unresolved contradictions;
- unsupported or load-bearing assumptions;
- competing hypotheses;
- evidence and provenance drill-down;
- uncertainty/confidence basis;
- failed and inconclusive tests;
- conclusions awaiting review;
- reopened conclusions;
- bias and premature-closure findings;
- high-consequence reasoning awaiting human approval;
- degraded-review states where required checks did not run;
- epistemic health metrics such as unresolved contradiction age, evidence coverage, reopen rate, and review latency.

No Console surface is part of GER-001 because persistent runtime state is not yet implemented. GER-006 owns operational projection after GER persistence exists.

## 15. Security, privacy, misuse, and bias analysis

### Evidence poisoning and prompt injection

Retrieved or external content is evidence payload, not instruction authority. Provenance and trust classification must remain separate from content semantics.

### Fabricated provenance

Missing source identifiers cannot be manufactured. GER must abstain or mark evidence unavailable.

### Epistemic laundering

Repeated model outputs, confidence scores, summaries, or derived retrieval chunks cannot become independent corroboration merely by being copied into different stores.

### Sensitive inference

Digital Twin and Agent reasoning must apply data minimization, purpose limitation, retention controls, and explicit restrictions for sensitive inference. A technically plausible inference may still be prohibited.

### Bias

Bias findings are challenge hypotheses, not accusations or proof of motive. GER requires the evidence for the bias concern, an alternative interpretation, and materiality.

### Authority escalation

Reasoning results cannot create capabilities, permissions, budgets, Production access, security exceptions, or self-approval rights.

### Denial of reopening

An actor cannot freeze a conclusion merely because it was once accepted. Applicable governance may require re-review when a material trigger appears.

### Audit privacy

Auditability does not justify retaining private chain-of-thought or unnecessary sensitive payloads. Persist structured rationale, evidence references, outcomes, authority, and relevant model/tool versions.

## 16. Cross-domain stress cases

| Domain | Stress case | GER invariant under test |
| --- | --- | --- |
| Software engineering | CI passes but deployed runtime differs from tested commit | Test evidence is scoped to revision/runtime and cannot prove a different deployment. |
| Scientific investigation | Attractive hypothesis fits initial observations | Competing hypotheses, falsifiers, negative results, and uncertainty remain explicit. |
| Incident response | First plausible root cause appears quickly | Premature closure is blocked when unexplained observations or contradictory telemetry remain. |
| Cybersecurity | Model reports high confidence that an alert is benign | Confidence does not authorize dismissal; evidence, risk, and security authority determine action. |
| Business analysis | Revenue change correlates with a feature launch | Connection begins as a candidate or hypothesis, not causal fact. |
| Legal/evidentiary reasoning | Two witnesses disagree | Testimony retains attribution and contradiction; GER does not adjudicate guilt or legal rights. |
| Historical research | Later secondary source conflicts with contemporary primary evidence | Recency does not automatically outrank provenance or source authority. |
| Operational troubleshooting | Restart appears to fix a fault | Temporal association does not prove root cause; failed reproduction and alternatives remain visible. |
| Digital Twin personalization | Repeated behavior suggests a preference | Observation and inference remain separate; inferred preference is temporal, correctable, and non-identity by default. |
| Agent decision support | Agent finds strong evidence for an action outside its grant | Reasoning may recommend escalation; it cannot self-expand authority. |

These are architectural stress cases only. GER is not a law-enforcement system, legal adjudicator, medical decision authority, or autonomous rights-determination system.

## 17. Testing and acceptance strategy

GER-001 executable acceptance requires deterministic proof that:

1. rigor classification is monotonic as risk dimensions increase;
2. unknown rigor inputs fail safe;
3. critical hard triggers cannot be averaged down;
4. high confidence without authority remains non-actionable;
5. consequential action at R3+ requires human approval and monitoring ownership;
6. connection candidates cannot silently become conclusions;
7. R3 conclusions require alternatives, falsifiers, tests, and independent review;
8. unresolved material contradiction blocks clean conclusion;
9. unsupported state skipping is rejected;
10. governed reopening from accepted conclusions is allowed;
11. malformed reopening triggers do not pass;
12. TypeScript build and existing server tests remain green.

Future GER acceptance must also include persistence replay, stale-evidence handling, concurrency, idempotency, least privilege, source deletion/retention behavior, privacy boundaries, performance, recovery, and independent Test readback.

## 18. Successor roadmap

GER-001 is the architecture foundation and umbrella issue. Recommended successors are deliberately separate to preserve one issue = one branch = one PR.

- **GER-002 Epistemic Case and Persistence Contract:** reconcile physical persistence with Canonical Development Evidence, `cm_evidence`, IIC-007/IIC-008, ThreadKeeper, and RuleBook. Add schema only if the gap is proven.
- **GER-003 Competing Hypothesis and Test Orchestrator:** implement hypothesis sets, evidence polarity, discriminating tests, falsifiers, conclusion readiness, and reopening runtime.
- **GER-004 Agent and VE Epistemic Enforcement:** integrate GER with accepted Agent identity/authority/capability/delegation/evidence obligations and Foundry execution.
- **GER-005 Digital Twin Epistemic Promotion:** govern stated/observed/inferred/simulated Twin assertions, temporal validity, corrections, sensitive inference, and promotion.
- **GER-006 Operator Console Epistemic Operations:** durable-backed investigations, contradiction queues, review gates, reopened conclusions, and epistemic health.
- **GER-007 EIK and Helper Matrix Reconciliation:** formally decide which historical EIK and Helper Matrix responsibilities become GER components, adapters, or retired lineage after runtime and reuse research.
- **GER-008 Adversarial Epistemic Evaluation Suite:** compose CP-04, stale-source cases, evidence poisoning, contradiction, confirmation bias, premature closure, and cross-domain fixtures into repeatable acceptance evidence.

## 19. GER-001 implementation boundary

GER-001 implements a deterministic policy kernel in `server/src/epistemic/ger.ts` plus tests in `server/test/ger.test.mjs`.

It intentionally performs no schema migration, no Production activation, no Agent authority mutation, no Digital Twin promotion, and no Console presentation. That boundary is a positive architectural result: the foundation becomes executable without forcing unresolved persistence decisions or colliding with neighboring lanes.
