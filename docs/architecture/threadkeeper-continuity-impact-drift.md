# TK-009 - Continuity Dependency Impact, Cumulative Drift, and Continuity Debt

Status: Implementation candidate  
Capability: ThreadKeeper  
Issue: #306  
Production activation: false  
Schema change: none in this slice

## 1. Purpose

TK-009 gives ThreadKeeper a thin continuity-analysis layer for three questions:

1. If an accepted continuity scope changes, which explicitly dependent scopes may require reassessment?
2. Has a scope gradually drifted across accepted checkpoint lineage even though no single transition looked catastrophic?
3. Where is continuity risk accumulating as unresolved operational debt?

The capability does not create a second knowledge graph, infer canonical dependencies, mutate downstream scopes, or produce an opaque health score.

## 2. EDG reuse boundary

CoMind already has a private Enterprise Documentation Graph registry whose governing invariant is:

`EDG projection != authority`

EDG-002 also established a strict evidence discipline: similarity, recency, embeddings, or model judgment are insufficient to mint canonical relationships.

TK-009 follows the same rule. Its `ContinuityImpactProjection` consumes explicit dependency-edge records supplied by an owning/evidence system. Each edge must include:

- stable edge identity;
- dependency scope semantic key;
- dependent scope semantic key;
- bounded relationship kind;
- assertion mode exactly `explicit_evidence`;
- one or more evidence references;
- source reference;
- observation timestamp;
- current/retired lifecycle state.

TK-009 does not persist these edges in its own graph store in this slice.

## 3. Dependency semantics

Direction is explicit:

`dependencyScopeSemanticKey -> dependentScopeSemanticKey`

A change to the dependency may require reassessment of the dependent.

Supported relationship kinds are intentionally small:

- `depends_on`
- `constrained_by`
- `governed_by`
- `derived_from`
- `handoff_from`

Retired edges never propagate current impact.

Self-edges, duplicate edge IDs, missing evidence, or non-evidentiary assertion modes fail closed.

## 4. Blast-radius analysis

`analyzeContinuityImpact` performs deterministic bounded traversal over current explicit edges.

Output includes:

- each impacted scope;
- shortest dependency depth;
- exact scope path;
- exact edge IDs used;
- cycle edge IDs encountered;
- whether traversal was truncated by the requested maximum depth;
- the source projection digest.

Traversal is capped at 32 levels and the projection at 4,096 edges. It does not alter any impacted scope. A blast-radius result means **reassessment candidate**, not automatic invalidation.

## 5. Cumulative drift analysis

TK-009 uses accepted `ContinuityCapsule` history from TK-008 rather than raw prose or embedding distance.

Input must be a direct chronological accepted checkpoint lineage for one semantic scope. Discontinuous, duplicate, tampered, or cross-scope history fails closed.

The analyzer compares protected structured semantics through time and emits named indicators such as:

- baseline objective lost;
- baseline decision lost;
- baseline obligation lost;
- baseline prohibition lost;
- baseline evidence/provenance lost;
- baseline authority/policy reference lost;
- repeated semantic change across two or more transitions;
- repeated obligation/prohibition/authority-reference churn;
- sensitivity weakening;
- retention change;
- accumulating unresolved cases.

Classifications are:

- `stable`
- `changed_with_lineage`
- `cumulative_drift_risk`
- `continuity_break_risk`

These are deterministic governance signals, not mathematical semantic-distance claims. Authorized divergence may still be legitimate; ThreadKeeper surfaces the risk and lineage for review rather than reversing the accepted state.

## 6. Continuity debt

Continuity debt is a categorized operator signal, not a numerical quality score.

Supported categories:

- stale checkpoint;
- unresolved conflict;
- incomplete handoff;
- missing provenance;
- expiring authority;
- outdated assumption;
- reassessment required;
- fidelity failure.

Statuses:

- `CLEAR`: no known debt items;
- `ATTENTION`: debt exists but no currently defined blocking category;
- `BLOCKED`: at least one fail-closed category exists.

Blocking categories in v1 are stale checkpoint, unresolved conflict, missing provenance, and fidelity failure.

The report preserves item references and per-category counts. There is deliberately no aggregate score that could imply unsupported precision.

## 7. Ownership boundaries

TK-009 does not own:

- EDG canonical relationship storage;
- source-system identity or data;
- dependency discovery by inference;
- Memory Graph topology;
- task execution or scheduling;
- downstream mutation;
- authority grants;
- policy approval;
- truth determination;
- automatic checkpoint invalidation.

A future adapter may map explicit EDG or other governed relationship records into `ContinuityDependencyEdge`, but that adapter must preserve the originating evidence and lifecycle and must not infer missing edges.

## 8. Security and failure posture

- projection integrity is deterministic;
- edges without evidence fail closed;
- retired edges are excluded from current impact;
- traversal depth and collection sizes are bounded;
- drift requires valid TK-008 capsules and direct lineage;
- risk classifications expose named reasons rather than hidden weighting;
- no raw source payloads, credentials, or private documents are copied into the analysis contract;
- no new schema, RLS, grants, public API, or Production activation is introduced in this slice.

## 9. Acceptance

Repository acceptance requires:

1. deterministic projection construction and integrity verification;
2. rejection of inferred, unevidenced, duplicate, and self dependency edges;
3. deterministic transitive blast-radius paths with retired-edge exclusion, cycle reporting, and bounded traversal;
4. direct-lineage validation for drift history;
5. stable, changed-with-lineage, cumulative-risk, and protected-semantic-loss cases proven;
6. sensitivity weakening and unresolved-case accumulation proven;
7. deterministic debt classification without opaque scores;
8. existing ThreadKeeper/TK-008 and broad server regression tests remain green;
9. exact-head CI passes;
10. no schema/RLS/grant/Production mutation.
