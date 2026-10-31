# TK-002 - Minimal ThreadKeeper Implementation Design and C2 Proof Plan v0.1

Status: Proposed implementation design  
Classification: Capability implementation design  
Canonical concept: `concept:threadkeeper`  
Governing contract: TK-001 v0.1  
Current canonical maturity: C1 Contracted  
Target evidence gate: C2 Implemented  
Module lifecycle applies: No  
Environment: Design and isolated Test only  
Production change: None  
Schema mutation performed by TK-002: None  
Issue: https://github.com/jlhogarth/CoMind/issues/224  
Date: 2026-10-26

## 1. Decision summary

The smallest defensible ThreadKeeper implementation is a thin continuity control plane built above reusable CoMind primitives, not a new monolithic continuity platform.

ThreadKeeper needs only four new implementation concerns:

1. generic semantic continuity-scope identity,
2. deterministic continuity assessment against an accepted checkpoint,
3. bounded continuity-case and resolution state,
4. accepted checkpoint governance for non-conversation scopes.

ThreadKeeper should reuse rather than duplicate:

- ACP-001 canonicalization, hashing, bounded-envelope, secret rejection, lineage, expiry, authority revalidation, idempotency, and fail-closed recovery patterns;
- SDN event envelope semantics for event identity, correlation, causation, trace correlation, sensitivity, lifecycle/retention classification, ingestion receipt, and provenance edges;
- existing authoritative systems such as Foundry for side-effect and execution outcomes;
- Canonical Development Evidence for development-time proof, decisions, testing evidence, and acceptance history;
- MCTRL for post-change maintenance verification;
- W3C PROV concepts for derivation and responsibility semantics;
- OpenTelemetry trace/span identifiers for observability correlation where already available;
- CloudEvents-style event envelope conventions where an external interoperable envelope is useful;
- auditable policy-decision record patterns without making ThreadKeeper a policy authority.

TK-002 does not authorize a schema mutation or implementation deployment. It defines the minimum implementation boundary and the C2 evidence required before maturity can advance.

## 2. Governing constraints from TK-001

The implementation must preserve these non-negotiable boundaries:

- ThreadKeeper is a Capability, not a Module.
- Continuity governs ThreadKeeper.
- Continuity Watchdog detects and reports continuity gaps; ThreadKeeper assesses continuity impact and owns continuity resolution policy.
- ThreadKeeper does not own raw Conversation History persistence or retention.
- ThreadKeeper does not own Memory Graph storage or retrieval.
- ThreadKeeper does not own Signal Fidelity or Assumption Validator conclusions.
- ThreadKeeper does not own SEAL revision or promotion.
- ThreadKeeper does not decide epistemic truth.
- ThreadKeeper does not execute Foundry work, manage leases, retry operations, or create side effects.
- ThreadKeeper does not own Agent Communication transport or routing.
- ThreadKeeper does not grant authority.
- Accepted continuity history is append-oriented and cannot be silently rewritten.
- Missing evidence remains missing.
- Ambiguous semantic identity must fail closed rather than be guessed.
- Authorized divergence is a legitimate continuity transition and must preserve predecessor lineage.

## 3. Why ACP-001 is reusable but not sufficient

ACP-001 is the strongest current implementation substrate for ThreadKeeper.

It already provides:

- deterministic canonical serialization,
- SHA-256 state and envelope integrity,
- bounded checkpoint payloads,
- secret screening,
- immutable persisted checkpoints,
- parent checkpoint lineage,
- independently supplied authority revalidation,
- logical expiry,
- idempotent checkpoint identity,
- fail-closed identity reuse,
- read-only reconciliation against authoritative Foundry state,
- explicit `READY`, `DEGRADED`, and `BLOCKED` recovery outcomes,
- deterministic successor-state construction,
- isolated PostgreSQL verification and performance evidence.

However, ACP v1 is intentionally conversation/execution scoped. Its persisted identity is based on `conversation_id`, `workflow_id`, and `execution_id`, and its storage uniqueness is `(conversation_id, execution_id)`.

ThreadKeeper must also represent continuity across:

- plans,
- decisions and decision lineage,
- commitments,
- handoffs,
- workstreams,
- governed workflow context,
- conversations when the Conversation History lane supplies a stable reference.

Therefore:

**ACP-001 should remain independently named and operationally intact. ThreadKeeper should extract or wrap reusable ACP primitives rather than reinterpret `conversation_id` as a generic semantic scope.**

Using ACP unchanged as ThreadKeeper persistence would create an identity-model error and violate the TK-001 boundary.

## 4. Why SDN is reusable but not ThreadKeeper's control-plane database

SDN already demonstrates an event model with:

- producer and event identity,
- schema version,
- event type registry,
- source timestamp,
- sequence number,
- correlation ID,
- causation event ID,
- trace ID,
- sensitivity classification,
- lifecycle classification,
- retention policy version,
- canonical payload hashing,
- ingestion receipts,
- integrity-conflict detection,
- provenance edges,
- transition ledger,
- append-oriented evidence patterns.

ThreadKeeper should reuse those semantics for high-volume continuity observations and telemetry where SDN is available.

ThreadKeeper must not make SDN the only source of current continuity-control state. The minimum control plane needs compact, transactionally addressable current identities, accepted checkpoints, assessments, and case transitions. High-volume observations can remain in SDN with references from ThreadKeeper.

C2 does not require a live SDN dependency. The ThreadKeeper core must accept opaque observation and evidence references so it can be tested independently. SDN integration is a later C3 integration proof.

## 5. Minimal architecture

### 5.1 Components

The proposed implementation has five small components.

#### A. ThreadKeeper core

A deterministic library containing:

- semantic scope validation,
- checkpoint canonicalization/integrity wrappers,
- continuity comparison,
- break classification,
- confidence and uncertainty handling,
- route-policy selection,
- successor checkpoint proposal generation.

The core performs no external side effects.

#### B. ThreadKeeper repository interface

A storage abstraction for compact control-plane state:

- scopes,
- accepted checkpoints,
- immutable assessments,
- cases and case transitions.

The repository is append-oriented for consequential history.

#### C. Authority validator interface

An externally supplied validator that confirms the caller's current authority evidence before:

- accepting a checkpoint,
- recording an authorized divergence,
- performing any transition whose policy requires authority.

The checkpoint never grants authority by itself.

#### D. Evidence resolver interface

A read-only abstraction capable of resolving evidence references from authorized sources such as:

- Conversation History,
- SDN,
- Foundry,
- canonical policy/evidence stores,
- future Memory Graph interfaces.

The resolver returns evidence availability and metadata. It does not silently copy source-of-truth payloads into ThreadKeeper.

#### E. Observability adapter

An optional adapter for metrics, structured logs, and trace correlation.

The core must work without a specific telemetry vendor.

### 5.2 Deliberately omitted components

C2 does not need:

- a dedicated message broker,
- a new generic event store,
- its own agent transport,
- a new policy engine,
- a new vector store,
- a new memory database,
- a background autonomous repair agent,
- a workflow engine,
- a Foundry dispatcher,
- a Conversation History copy.

## 6. Reuse matrix

| TK-001 requirement | Existing reusable primitive | Gap | Minimal ThreadKeeper addition |
| --- | --- | --- | --- |
| Continuity scope identity | ACP strong identity validation; SDN correlation semantics | ACP identity is conversation-specific | `ContinuityScope` with explicit `scopeType`, opaque `subjectRef`, stable `scopeId` |
| Immutable checkpoints | ACP checkpoint envelope and immutable SQL pattern | ACP schema assumes conversation/workflow/execution | Generic ThreadKeeper checkpoint wrapper and later generic checkpoint table |
| Parent lineage | ACP `parentCheckpointId` | No semantic scope lineage outside conversation | Reuse lineage primitive keyed by `scopeId` |
| Integrity digest | ACP canonical serializer and SHA-256 | None | Extract/wrap without changing ACP behavior |
| Secret rejection | ACP credential screening | None | Reuse shared function |
| Authority revalidation | ACP restore-time current authority check | ThreadKeeper needs accept-time authority evidence too | `AuthorityValidator` interface plus acceptance record reference |
| Evidence references | ACP `sourceRefs` / `evidenceRefs`; SDN provenance edges | Need normalized opaque ref contract | `EvidenceRef` shape and resolver interface |
| Observation envelope | SDN event identity, correlation, causation, trace, sensitivity | TK core must not require SDN for C2 | `ContinuityObservation` DTO compatible with SDN mapping |
| Break classification | Continuity Watchdog findings; ACP recovery reasons | No generic continuity classification engine | Deterministic `assess()` rules and explicit break types |
| Confidence / uncertainty | ACP READY/DEGRADED/BLOCKED | TK contract needs confidence plus uncertainty | bounded confidence and uncertainty fields with reason codes |
| Continuity cases | Existing issue/workflow patterns only | No ThreadKeeper case state | minimal case identity and append-only transition model |
| Resolution routing | Helper/SEAL/Foundry boundaries already defined | No deterministic routing contract | `RouteRecommendation` plus route policy registry |
| Authorized divergence | ACP successor lineage pattern | ACP successor is execution recovery, not semantic change | checkpoint proposal plus external acceptance evidence |
| Current context | ACP restored compact state | conversation-specific | `get_context(scopeId)` projection over accepted checkpoint and unresolved cases |
| Lineage retrieval | ACP parent chain | conversation-specific | generic `get_lineage(scopeId)` |
| High-volume telemetry | SDN | no ThreadKeeper event types registered yet | no C2 schema change; define mapping for C3 |
| Cross-service trace correlation | SDN `traceId`; OpenTelemetry pattern | not universal in current services | optional `traceId` / `spanId` fields, never semantic identity |
| Development evidence | Canonical Development Evidence and MCTRL | None | write TK work through existing system |

## 7. Runtime data model proposal

This is a proposed schema for later authorization. TK-002 does not execute it.

The design intentionally separates compact control-plane state from high-volume observations.

### 7.1 `ContinuityScope`

Logical fields:

```text
scope_id UUID
scope_type ENUM(
  conversation,
  plan,
  decision_lineage,
  commitment,
  handoff,
  workstream,
  governed_workflow
)
subject_ref TEXT
namespace TEXT
status ENUM(active, closed)
sensitivity_class TEXT
retention_class TEXT
created_at TIMESTAMPTZ
created_by_ref TEXT
```

Rules:

- `scope_id` is the ThreadKeeper identity.
- `subject_ref` is opaque and remains owned by the source system.
- uniqueness is `(scope_type, namespace, subject_ref)` for active identity unless the source contract explicitly permits multiple semantic scopes.
- no heuristic merge of scopes.
- ambiguous source identity is rejected or quarantined.

### 7.2 `ContinuityCheckpoint`

Logical fields:

```text
checkpoint_id UUID
scope_id UUID
parent_checkpoint_id UUID NULL
checkpoint_version INTEGER
state_digest CHAR(64)
digest CHAR(64)
state JSONB
proposed_at TIMESTAMPTZ
accepted_at TIMESTAMPTZ NULL
accepted_by_ref TEXT NULL
authority_evidence_ref TEXT NULL
policy_ref TEXT NULL
superseded_by_checkpoint_id UUID NULL
```

State remains compact and reference-oriented:

```text
objective_refs[]
decision_refs[]
commitment_refs[]
obligation_refs[]
context_refs[]
evidence_refs[]
source_refs[]
sensitivity
retention_class
```

Rules:

- accepted checkpoint content is immutable,
- acceptance is separate from proposal creation,
- self-approval is impossible by interface contract,
- one accepted head exists per active scope at a time,
- supersession preserves predecessor lineage,
- state payload has a bounded maximum size,
- credentials and secret material are rejected,
- expiry is optional by scope/policy rather than globally assumed to be 24 hours.

### 7.3 `ContinuityAssessment`

Logical fields:

```text
assessment_id UUID
scope_id UUID
checkpoint_id UUID NULL
observation_ref TEXT
classification ENUM(
  INTACT,
  CHANGED_WITH_LINEAGE,
  SUSPECTED_BREAK,
  CONFIRMED_BREAK,
  UNRESOLVED_CONFLICT,
  BLOCKED
)
break_types[]
confidence NUMERIC
uncertainty NUMERIC
reason_codes[]
evidence_refs[]
trace_id TEXT NULL
created_at TIMESTAMPTZ
assessor_version TEXT
```

Assessments are immutable evidence records.

### 7.4 `ContinuityCase`

Logical fields:

```text
case_id UUID
scope_id UUID
opened_from_assessment_id UUID
opened_at TIMESTAMPTZ
```

No mutable `current_state` is required as an authority record. Current state is derived from append-only case transitions.

### 7.5 `ContinuityCaseTransition`

Logical fields:

```text
transition_id UUID
case_id UUID
from_state TEXT NULL
to_state ENUM(
  OBSERVED,
  ASSESSED,
  ROUTED,
  RESOLVED,
  ACCEPTED_DIVERGENCE,
  BLOCKED,
  UNRESOLVED
)
route_code TEXT NULL
actor_ref TEXT
authority_evidence_ref TEXT NULL
evidence_refs[]
resolution_ref TEXT NULL
successor_checkpoint_id UUID NULL
recorded_at TIMESTAMPTZ
```

Transitions are append-only.

### 7.6 Why four logical relations plus transitions are the minimum

A single giant checkpoint JSON record cannot adequately represent:

- stable semantic identity,
- independent immutable assessments,
- unresolved cases,
- multiple route/resolution transitions,
- audit-friendly accepted divergence.

Conversely, ThreadKeeper does not need a table for every observation or telemetry sample. Observation payloads remain in their source systems or SDN and are referenced by ID.

## 8. Core DTOs

### 8.1 `EvidenceRef`

```text
EvidenceRef
  provider
  kind
  ref
  version?
  digest?
  sensitivity?
```

ThreadKeeper treats the reference as opaque until an authorized resolver is used.

### 8.2 `ContinuityObservation`

```text
ContinuityObservation
  observationId
  eventType
  sourceSystem
  observedAt
  scopeBinding
    scopeId?
    scopeType
    namespace
    subjectRef
  priorCheckpointRef?
  currentStateRefs[]
  findingType?
  findingSeverity?
  confidence?
  uncertainty?
  evidenceRefs[]
  actorRef?
  authorityRef?
  policyRef?
  correlationId?
  causationRef?
  traceId?
  spanId?
  sensitivity
  retentionClass
```

A caller may supply `scopeId` only when it is already known. Otherwise ThreadKeeper resolves the exact semantic identity from the explicit scope binding. It must never infer scope identity from natural-language similarity.

## 9. Deterministic assessment rules for C2

C2 needs an explainable, deliberately conservative rule engine rather than an LLM deciding continuity state.

Initial ordered rules:

1. **Invalid or ambiguous scope identity** -> `BLOCKED` / `scope_identity_invalid_or_ambiguous`.
2. **Required evidence reference unavailable or unverifiable** -> `BLOCKED` or `UNRESOLVED_CONFLICT`, depending on whether assessment is impossible or merely incomplete.
3. **Checkpoint integrity or authority invalid** -> `BLOCKED`.
4. **No accepted checkpoint for an established scope** -> `BLOCKED` / `accepted_baseline_missing` unless the operation is explicitly initial checkpoint creation.
5. **Observation references an impossible predecessor or broken lineage** -> `CONFIRMED_BREAK` / `broken_lineage`.
6. **Observation conflicts with two or more accepted authoritative state references** -> `UNRESOLVED_CONFLICT`.
7. **Authorized change evidence proves deliberate divergence** -> `CHANGED_WITH_LINEAGE` and eligible for successor checkpoint proposal.
8. **State differs materially without sufficient authority or explanation** -> `SUSPECTED_BREAK`.
9. **Independent authoritative evidence confirms incompatible state** -> `CONFIRMED_BREAK`.
10. **All required continuity invariants hold** -> `INTACT`.

The rule engine returns reason codes, source/evidence references, confidence, uncertainty, and the exact checkpoint used.

LLM or helper analysis may later contribute evidence or hypotheses, but it cannot directly set a canonical assessment result without the deterministic gate.

## 10. Confidence and uncertainty

Confidence and uncertainty are separate values.

- confidence expresses support for the current classification,
- uncertainty expresses material incompleteness or ambiguity.

C2 uses bounded numeric values from 0 to 1 plus explicit reason codes. Numbers are not treated as calibrated probabilities unless future validation proves calibration.

A high-confidence classification can still carry material uncertainty about secondary facts.

ThreadKeeper must never convert missing evidence into a high-confidence result because an answer appears plausible.

## 11. Interface contracts

The C2 implementation should expose library/service contracts first. HTTP endpoints are optional adapters and are not required for C2.

### 11.1 `observe(input)`

Purpose: validate and register a continuity observation reference.

Must:

- validate explicit scope binding,
- reject ambiguous identity,
- validate reference syntax and bounded payload size,
- preserve sensitivity and retention metadata,
- never duplicate a raw source payload unless specifically authorized.

Returns:

```text
ObservationReceipt
  observationId
  scopeId
  disposition: accepted | duplicate | rejected | quarantined
  reasonCodes[]
```

### 11.2 `assess(scopeId, observationId)`

Purpose: produce an immutable continuity assessment against the accepted checkpoint.

Must:

- resolve the exact accepted checkpoint,
- resolve required evidence read-only,
- apply deterministic rules,
- emit classification, reason codes, confidence, uncertainty, and evidence refs,
- never mutate source systems.

### 11.3 `open_case(assessmentId)`

Purpose: create a bounded follow-up identity for an assessment requiring action.

Allowed source classifications:

- `SUSPECTED_BREAK`,
- `CONFIRMED_BREAK`,
- `UNRESOLVED_CONFLICT`,
- `BLOCKED` when follow-up is actionable.

Opening a case performs no repair.

### 11.4 `route(caseId)`

Purpose: produce an auditable recommendation.

Initial route codes:

- `REQUEST_EVIDENCE`,
- `REQUEST_HELPER_ANALYSIS`,
- `REQUEST_EPISTEMIC_REVIEW`,
- `REQUEST_SEAL_REVIEW`,
- `REQUEST_GOVERNANCE_REVIEW`,
- `REQUEST_HUMAN_REVIEW`,
- `PROPOSE_AUTHORIZED_DIVERGENCE`,
- `RETAIN_UNRESOLVED`,
- `PAUSE_DEPENDENT_ACTION`.

A route is a recommendation. It does not invoke the destination system in C2.

### 11.5 `propose_checkpoint(scopeId, proposal)`

Purpose: create an immutable candidate successor checkpoint.

Must:

- preserve predecessor identity,
- include all evidence supporting change,
- include unresolved obligations,
- calculate integrity digests,
- remain unaccepted until external authority is validated.

### 11.6 `accept_checkpoint(proposalId, authorityEvidence)`

Purpose: record externally authorized acceptance.

Must:

- independently validate current authority,
- fail if proposal lineage no longer points to the current accepted head,
- fail on stale or conflicting authority,
- record actor, policy, evidence, and acceptance time,
- atomically establish the successor accepted head while retaining predecessor history.

ThreadKeeper cannot call this interface using its own authority.

### 11.7 `get_context(scopeId)`

Returns a compact reference-oriented view:

- accepted checkpoint,
- unresolved cases,
- unresolved obligations,
- continuity risks,
- latest assessment references,
- evidence/provenance refs.

It does not return a reconstructed transcript or duplicate an authoritative source record.

### 11.8 `get_lineage(scopeId, checkpointId?)`

Returns checkpoint predecessor/successor lineage and acceptance evidence.

Must detect cycles or broken links and fail closed.

### 11.9 `record_resolution(caseId, resolution)`

Purpose: append an externally completed resolution outcome.

Must:

- identify the resolving actor/system,
- preserve evidence refs,
- record whether a successor checkpoint was proposed or accepted,
- never claim a destination action succeeded without destination evidence.

## 12. Route-policy design

C2 uses a version-controlled static route policy, not an autonomous planner.

Example mapping:

| Break / condition | Default route |
| --- | --- |
| missing evidence | `REQUEST_EVIDENCE` |
| stale assumption | `REQUEST_HELPER_ANALYSIS` or `REQUEST_HUMAN_REVIEW` |
| epistemic conflict | `REQUEST_EPISTEMIC_REVIEW` |
| governed revision candidate | `REQUEST_SEAL_REVIEW` |
| authority ambiguity | `REQUEST_GOVERNANCE_REVIEW` |
| identity ambiguity | `REQUEST_HUMAN_REVIEW` |
| deliberate authorized change | `PROPOSE_AUTHORIZED_DIVERGENCE` |
| dependency unavailable | `RETAIN_UNRESOLVED` |
| dangerous continuity uncertainty for dependent action | `PAUSE_DEPENDENT_ACTION` |

Policy version is stored on each route recommendation.

Changing route policy requires review and test evidence.

## 13. Source-of-truth boundaries

| Data | Source of truth | ThreadKeeper persistence |
| --- | --- | --- |
| Raw conversation events | Conversation History | references only |
| Memory entities/graph | Memory Graph | references only |
| Foundry lease/outcome | Foundry | references and read-only reconciliation results |
| Agent messages | Agent Communication | references only |
| High-volume telemetry/events | SDN where available | references / compact assessment metadata |
| Current authority | external authority/policy source | validation evidence reference |
| Semantic continuity scope | ThreadKeeper | canonical scope identity |
| Accepted continuity checkpoint | ThreadKeeper | compact immutable control state |
| Continuity assessment | ThreadKeeper | immutable assessment record |
| Continuity case transitions | ThreadKeeper | append-only transition record |
| Development evidence | Canonical Development Evidence | development evidence only, not runtime source of truth |

## 14. Persistence strategy

### 14.1 Control plane

A future authorized implementation should use managed PostgreSQL for compact ThreadKeeper control state.

C2 proof may use disposable isolated PostgreSQL named `comind_ci`, following the ACP test-safety pattern.

### 14.2 Data plane

SDN is the preferred existing high-volume event/telemetry substrate when integration is later authorized.

C2 should not introduce a second high-volume event database.

### 14.3 No silent deletion

Accepted checkpoints, assessments, and case transitions are evidence-bearing records.

Physical retention/deletion policy is a separate governance decision. C2 does not implement deletion.

## 15. Security and privacy design

C2 must prove:

- secret material is rejected before checkpoint persistence,
- evidence references are preferred to raw sensitive payload copies,
- scope sensitivity and retention metadata are mandatory,
- current source-system access controls remain controlling,
- ThreadKeeper never expands access merely because a reference exists,
- authority is independently validated at acceptance time,
- accepted history is immutable,
- raw health, identity, conversation, and Digital Twin payloads are not copied unless explicitly required and authorized,
- logs do not expose sensitive evidence content,
- trace IDs are correlation metadata only,
- unresolved evidence remains unresolved rather than reconstructed from plausibility.

## 16. Failure model and required C2 behavior

| Failure | Expected C2 result |
| --- | --- |
| stale checkpoint | assessment blocked or degraded with explicit reason |
| checkpoint digest mismatch | `BLOCKED` |
| authority mismatch | `BLOCKED` |
| ambiguous scope identity | observation rejected/quarantined; no automatic merge |
| missing required provenance | `BLOCKED` or unresolved, never `INTACT` by assumption |
| evidence resolver unavailable | unresolved/degraded result, no fabrication |
| conflicting authoritative references | `UNRESOLVED_CONFLICT` |
| broken predecessor lineage | `CONFIRMED_BREAK` |
| unproven material state change | `SUSPECTED_BREAK` |
| authorized deliberate change | `CHANGED_WITH_LINEAGE` and successor proposal allowed |
| route destination unavailable | case remains unresolved; no false completion |
| repeated route cycle | escalation-loop reason and human/governance route |
| false-positive break later disproved | append dismissal/resolution evidence; do not delete assessment |
| accepted checkpoint head changed during approval | acceptance fails stale-head check |
| duplicate observation ID with same semantic content | idempotent duplicate receipt |
| duplicate observation ID with conflicting content | integrity conflict / rejection |
| dependency reports success without authoritative evidence | remain unresolved |

## 17. Observability

C2 should expose structured metrics without requiring a vendor-specific stack.

Minimum counters/gauges:

- observations accepted,
- observations rejected,
- observations quarantined,
- assessments by classification,
- assessments with missing evidence,
- scope identity collisions,
- cases opened,
- unresolved cases,
- blocked cases,
- route recommendations by route code,
- repeated route cycles,
- checkpoint proposals,
- checkpoint acceptances,
- stale-head acceptance failures,
- authority validation failures,
- checkpoint integrity failures,
- evidence resolver failures.

Minimum latency measurements:

- observation validation,
- assessment,
- context retrieval,
- checkpoint proposal,
- checkpoint acceptance.

Trace/span IDs may be propagated when supplied but do not determine semantic scope identity.

## 18. C2 implementation package

The smallest implementation package should contain:

```text
server/src/threadkeeper/
  types.ts
  integrity.ts
  scope.ts
  assessment.ts
  routing.ts
  checkpoint.ts
  repository.ts
  service.ts
  observability.ts
```

ACP should either:

A. import shared integrity primitives extracted into a neutral continuity utility module, or
B. remain unchanged while ThreadKeeper initially wraps equivalent exported ACP primitives.

Preferred path: extract only truly generic primitives with regression tests proving ACP behavior remains unchanged.

ThreadKeeper must not import Conversation History internals, Foundry execution internals, or Agent Communication transport internals into its deterministic core.

## 19. Proposed isolated database shape

No migration is executed in TK-002.

If implementation is authorized, the isolated proof migration should create a dedicated ThreadKeeper namespace or clearly prefixed tables, for example:

```text
comind.cm_threadkeeper_scope
comind.cm_threadkeeper_checkpoint
comind.cm_threadkeeper_assessment
comind.cm_threadkeeper_case
comind.cm_threadkeeper_case_transition
```

Required database properties:

- append-only triggers for accepted checkpoints, assessments, and transitions,
- foreign-key lineage,
- uniqueness preventing ambiguous active scope identity,
- deterministic digest checks,
- no public access,
- Test-only privilege model for C2 proof,
- migration re-runnable in isolated CI,
- no live Supabase application until separately authorized.

## 20. C2 test matrix

### 20.1 Pure unit tests

1. exact scope binding succeeds,
2. ambiguous scope binding fails,
3. duplicate scope binding resolves idempotently,
4. canonical checkpoint digest is deterministic,
5. secret material is rejected,
6. tampered checkpoint fails,
7. stale or invalid authority fails,
8. missing accepted baseline blocks assessment,
9. intact observation returns `INTACT`,
10. authorized material change returns `CHANGED_WITH_LINEAGE`,
11. unexplained material change returns `SUSPECTED_BREAK`,
12. proven incompatible state returns `CONFIRMED_BREAK`,
13. contradictory authoritative evidence returns `UNRESOLVED_CONFLICT`,
14. missing required evidence cannot return `INTACT`,
15. route policy returns deterministic route code and policy version,
16. checkpoint proposal preserves predecessor,
17. ThreadKeeper cannot self-approve a checkpoint,
18. stale-head checkpoint acceptance fails,
19. lineage traversal detects cycles/broken links,
20. context projection returns references rather than duplicated payloads.

### 20.2 Isolated PostgreSQL integration tests

1. migration applies twice safely where intended,
2. scope identity uniqueness,
3. accepted checkpoint immutability,
4. assessment immutability,
5. case transition append-only behavior,
6. parent checkpoint foreign-key integrity,
7. atomic accepted-head successor transition,
8. concurrent stale-head acceptance rejection,
9. idempotent duplicate observation handling,
10. conflicting duplicate observation rejection,
11. restart persistence roundtrip,
12. no forbidden schema or privilege exposure.

### 20.3 Boundary-adapter tests

Use fakes or read-only fixtures.

- Conversation History reference resolves without copying raw transcript content.
- Foundry outcome reference remains authoritative outside ThreadKeeper.
- unavailable evidence resolver produces unresolved/degraded state.
- Helper Matrix route is emitted but no helper is executed.
- SEAL route is emitted but no revision is executed.
- Agent Communication is not invoked.

### 20.4 Failure injection

Inject:

- corrupt digest,
- expired/stale checkpoint where policy uses expiry,
- ambiguous identity,
- missing provenance,
- stale authority,
- evidence source timeout,
- conflicting source evidence,
- dependency outage,
- route-cycle repetition,
- concurrent checkpoint acceptance,
- storage write failure.

Every test must prove fail-closed or explicit unresolved behavior.

## 21. C2 evidence bundle

ThreadKeeper may advance from C1 to C2 only when all of the following are present and linked:

1. accepted TK-001 contract,
2. accepted TK-002 implementation design,
3. exact implementation commit,
4. isolated migration and schema evidence,
5. unit-test results,
6. isolated PostgreSQL integration-test results,
7. failure-injection results,
8. ACP regression results if shared primitives are extracted,
9. security/privacy boundary review,
10. authority-boundary tests,
11. evidence that no Conversation History, Agent Communication, Helper Matrix, SEAL, or Foundry execution authority was absorbed,
12. observability baseline,
13. canonical Development Evidence records,
14. CCI/MLC/DPE/EDG reconciliation only if implementation changes their governed claims,
15. post-change MCTRL PASS,
16. explicit journal event promoting capability maturity to C2.

No single artifact satisfies this gate alone.

## 22. MCTRL impact analysis

TK-002 design by itself does not require a maintenance-baseline change because it does not change canonical concept identity, current capability maturity, graph topology, schema, RLS, or production state.

An authorized implementation would require at minimum:

- existing `MCTRL-TK-001` to continue asserting C1 until C2 evidence is complete,
- schema-contract controls for any new ThreadKeeper relations,
- orphan/lineage checks,
- append-only/immutability checks,
- declared Test RLS/privilege posture,
- capability-maturity control updated only in the same governed change that supplies C2 evidence,
- regression controls proving ACP still behaves as accepted if shared primitives are extracted.

The C2 promotion must be the final step, not the first.

## 23. Implementation sequence after authorization

The recommended order is intentionally narrow:

1. extract or wrap generic ACP integrity primitives with zero ACP behavior change,
2. implement pure ThreadKeeper types and exact scope identity,
3. implement deterministic assessment and route policy,
4. implement isolated repository plus migration,
5. implement checkpoint proposal/acceptance with external authority validator,
6. implement case transitions and context/lineage reads,
7. add observability adapter,
8. run unit and isolated PostgreSQL proof,
9. run failure injection and ACP regression suite,
10. reconcile canonical evidence,
11. run MCTRL,
12. only then evaluate C2 promotion.

Do not integrate SDN, Conversation History, Foundry live state, Helper Matrix, SEAL, or Agent Communication until the isolated core contract is proven.

## 24. Smallest implementation decision

The smallest defensible C2 ThreadKeeper is therefore:

> A deterministic, reference-oriented continuity assessment service with generic semantic scopes, immutable accepted checkpoints, append-only assessments/case transitions, externally validated checkpoint acceptance, and read-only evidence resolvers, built by reusing ACP integrity and lineage primitives and existing CoMind evidence/telemetry conventions.

It is not an autonomous agent and it is not a new memory, event, workflow, or messaging platform.

## 25. Open implementation decisions

These decisions are intentionally deferred until the design is reviewed:

1. whether generic ACP integrity functions should be physically extracted into a shared file or wrapped in ThreadKeeper v1,
2. exact maximum ThreadKeeper checkpoint size,
3. which scope types require logical expiry versus indefinite accepted-state validity,
4. exact namespace used for ThreadKeeper runtime tables,
5. exact confidence/uncertainty calculation rules beyond the required deterministic reason-code semantics,
6. whether the first C2 proof exposes HTTP adapters or remains library-level plus repository integration,
7. whether SDN event-type registration belongs in C2 or is deferred to C3.

Default recommendations:

- extract generic primitives only if regression proof is straightforward,
- retain the ACP 64 KiB ceiling as the starting checkpoint maximum unless a test demonstrates need otherwise,
- do not globally expire accepted semantic checkpoints,
- use `comind.cm_threadkeeper_*` names for consistency if the current runtime schema remains `comind`,
- keep confidence conservative and rule-derived,
- C2 should not require public HTTP endpoints,
- defer SDN registration to C3 integration.

## 26. Acceptance criteria for TK-002

TK-002 is complete when:

1. the reuse matrix is accepted,
2. the minimal runtime data model is accepted as a design, not deployed,
3. all nine TK-001 logical interfaces have implementation contracts,
4. source-of-truth boundaries are explicit,
5. authority/security/privacy boundaries are explicit,
6. C2 test and failure-injection requirements are explicit,
7. ACP reuse does not rename or absorb ACP-001,
8. Conversation History and Agent Communication remain separate lanes,
9. no schema mutation or production change has occurred,
10. MCTRL impact is documented,
11. the next step can be a bounded implementation issue rather than another architecture-discovery exercise.

## 27. Evidence sources

Primary current CoMind implementation evidence:

- TK-001 ThreadKeeper Capability Contract v0.1
- `server/src/continuity/checkpoint.ts`
- `server/src/continuity/repository.ts`
- `server/src/continuity/recovery.ts`
- `server/src/continuity/confidence.ts`
- `docs/ACP-001-OPERATIONS.md`
- `db/migrations/20261010_010_acp_continuity_checkpoints.sql`
- `sdn/src/app.mjs`
- `sdn/migrations/001_sdn_foundation.sql`
- current Foundry reconciliation substrate
- Canonical Development Evidence
- MCTRL-001

External patterns already captured in Canonical Development Evidence before TK-001 use:

- `RS-20261026-0001`: W3C PROV-DM
- `RS-20261026-0002`: OpenTelemetry context propagation and tracing
- `RS-20261026-0003`: CloudEvents specification
- `RS-20261026-0004`: Open Policy Agent decision-log pattern

No new external source is required to justify this v0.1 design.

## 28. Provenance statement

TK-002 is derived from the accepted TK-001 boundary and current repository implementations. It does not reinterpret historical ACP, SDN, Conversation History, Foundry, Helper Matrix, SEAL, Agent Communication, or other adjacent systems as ThreadKeeper.

No current maturity advancement is claimed by this document.
