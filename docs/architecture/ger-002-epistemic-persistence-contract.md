# GER-002: Epistemic Case and Persistence Contract

Status: Test implementation candidate
Issue: #379
Parent: GER-001
Production activation: false

## 1. Purpose

GER-002 makes the minimum durable runtime persistence required by Governed Epistemic Reasoning real without creating a second evidence repository or absorbing adjacent subsystem ownership.

The persistence contract must make a material epistemic case reconstructable across process loss, conversation loss, retries, concurrent writers, source changes, contradiction, supersession, review, conclusion, action, monitoring, and reopening.

It does not attempt to persist private chain-of-thought. It persists structured, inspectable epistemic artifacts: claims, evidence references, hypotheses, tests, falsifiers, contradictions, uncertainty, conclusions, decisions, actions, authority references, typed relationships, state changes, reviews, and reopening events.

## 2. Architectural decision

GER requires a dedicated runtime control plane, but not a dedicated raw-evidence store.

The minimum physical GER envelope is four immutable tables:

1. `comind.cm_epistemic_case`
2. `comind.cm_epistemic_object`
3. `comind.cm_epistemic_relationship`
4. `comind.cm_epistemic_event`

Current state is derived through:

- `comind.v_epistemic_object_state`
- `comind.v_epistemic_case_status`

This avoids table-per-noun proliferation. A test, falsifier, contradiction, uncertainty assessment, review, conclusion, decision, action, or reopening trigger is a typed epistemic object. Its meaning and links are expressed through typed relationships and append-only events.

## 3. Why existing stores are not reused as GER's primary persistence

### 3.1 `comind_development`

`comind_development.entity`, `relationship`, `artifact`, and `journal_entry` are the canonical development-evidence substrate. They are intentionally generic and development-scoped. Reusing them as the runtime cognition store would collapse development provenance and runtime epistemic state into one responsibility.

GER may reference development evidence, but does not redefine that schema as runtime cognition.

### 3.2 `comind.cm_evidence`

`cm_evidence` is an evidence receipt and registry. It owns evidence identity and evidence metadata where used. GER references canonical evidence rather than copying raw evidence payloads into epistemic objects.

An epistemic object with `object_type='evidence'` therefore requires a `canonical_ref`.

### 3.3 ThreadKeeper

ThreadKeeper provides a proven persistence pattern: identity sequences, append-only transitions, idempotency keys, digests, evidence references, authority references, immutable triggers, same-case constraints, serializable transactions, advisory locks, and constrained runtime roles.

Its tables are continuity-specific. GER reuses the pattern, not the tables.

### 3.4 Legacy belief and decision structures

`cm_belief_state`, `cm_belief_update_log`, legacy decision-tree structures, and ILP hypothesis tables are not promoted into GER merely because their names overlap epistemic concepts. `cm_belief_state` is coupled to the older causal-node model. The historical decision-tree and ILP structures do not provide the required case lineage contract.

No silent migration of those structures occurs in GER-002.

### 3.5 Retention and data governance

GER does not create a second retention system.

The GER control-plane assets are registered in `comind_pm.pm_data_asset_governance` using the existing `DURABLE-EVIDENCE` retention profile and `INTERNAL` classification in Test. Existing legal-hold and evidence-hold controls remain authoritative for disposition governance.

GER rows themselves are immutable. Any future disposition or deletion implementation must be separately governed and must respect the registered retention and hold policy. GER-002 does not implement hard deletion.

## 4. Source-of-truth ownership

| Concern | Authoritative owner | GER behavior |
| --- | --- | --- |
| Epistemic case identity and chronology | GER | Owns |
| Epistemic object identity and state lineage | GER | Owns |
| Epistemic relationships and polarity | GER | Owns |
| Raw/source evidence payload | Source evidence system | References only |
| Development evidence | `comind_development` | References only |
| Evidence receipts | `comind.cm_evidence` and source-specific evidence systems | References only |
| Continuity state | ThreadKeeper | Does not absorb |
| Rules and rule authority | RuleBook | References governing rules/authority |
| Retention/classification/holds | PM data governance | Registers assets and obeys policy |
| Conversation source history | Conversation History / CFR | References source identifiers |
| Implementation-reality evidence | IIC-007 / IIC-008 | Consumes when available, does not duplicate |
| Agent capability and delegated authority | Agent/VE and Foundry authority systems | Records references, never self-grants |
| Digital Twin identity/promotion | Digital Twin governance | GER supplies evidence and status, does not auto-promote identity |

## 5. Physical model

### 5.1 Epistemic case

`cm_epistemic_case` is immutable opening context:

- stable `case_id`
- idempotent `case_key`
- subject reference and purpose
- environment
- initial rigor class
- GER policy version
- data classification and retention profile reference
- source references
- opening actor and optional authority reference
- canonical digest
- bounded structured payload

Current case status is not mutated on this row. It is projected from lifecycle events.

### 5.2 Epistemic object

`cm_epistemic_object` stores immutable typed epistemic artifacts. The object type set is the GER-001 ontology.

Objects begin only in `unknown`, `observed`, or `suspected`. Later epistemic state is event-derived.

Temporal applicability is represented through `valid_from` and `valid_to`. This is epistemic validity context, not row-deletion time.

### 5.3 Epistemic relationship

`cm_epistemic_relationship` stores typed, immutable edges such as:

- supports
- contradicts
- assumes
- derived_from
- competes_with
- tests
- falsifies
- weakens
- explains
- supersedes
- reopens
- decided_by
- authorized_by
- acted_by
- challenges
- reviews
- monitors
- references

Composite foreign keys require both endpoints to belong to the same epistemic case. Cross-case semantic relationships must be represented by explicit reference objects or future governed federation, not by silently creating a cross-case edge.

### 5.4 Epistemic event

`cm_epistemic_event` is the append-only chronology. It carries:

- globally idempotent event key
- case identity
- prior event identity
- event type
- optional target object/relationship
- from/to epistemic state for transitions
- actor and authority references
- structured rationale
- evidence and source references
- policy version
- event time
- canonical digest
- bounded structured payload

A unique root and unique successor per prior event make each case chronology linear. Concurrent writers cannot silently create forks.

## 6. State and transition integrity

The database transition validator mirrors the GER-001 state transition policy. The application repository invokes `assessTransition` first, and PostgreSQL validates again at persistence time.

This deliberately creates two enforcement layers:

1. application policy rejects an invalid request before persistence;
2. the database rejects stale or invalid state even if a caller bypasses the application layer.

The trigger derives the latest persisted state and rejects stale `from_state` values.

A `connection_candidate` may become investigated and supported, but cannot transition directly to `concluded`. A novel connection must be re-expressed as an examined hypothesis or claim before conclusion.

## 7. Idempotency and replay

Idempotency is semantic, not merely duplicate suppression.

- case keys are unique;
- object keys are unique;
- relationship keys are unique;
- event keys are unique;
- canonical digests bind a key to its content.

The repository treats an exact key plus digest replay as the same operation and returns the existing row. Reusing a key with different material is an integrity error.

This prevents a retry from silently changing what an earlier operation meant.

## 8. Concurrency

The repository uses:

- `SERIALIZABLE` transactions;
- a case-scoped PostgreSQL advisory transaction lock;
- explicit `expectedPriorEventId` optimistic concurrency;
- database uniqueness on each prior-event successor;
- database stale-state validation.

A writer therefore has to possess the current case head. If another transaction advances the case, the stale writer must reread and deliberately reconcile rather than overwrite or fork history.

## 9. Append-only model and supersession

Cases, objects, relationships, and events reject `UPDATE` and `DELETE` through immutable triggers.

The constrained runtime role additionally has no `UPDATE` or `DELETE` privileges, so ordinary runtime mutation fails before reaching the trigger.

Correction is represented by new objects, relationships, and events. Supersession is a relationship, not destructive replacement. Contradictory and rejected artifacts remain reconstructable.

## 10. Security and least privilege

`comind_ger_runtime` is:

- `NOLOGIN`
- `NOSUPERUSER`
- `NOCREATEDB`
- `NOCREATEROLE`
- `NOINHERIT`
- `NOREPLICATION`
- `NOBYPASSRLS`

It receives only:

- schema usage;
- `SELECT` and `INSERT` on GER control-plane tables;
- `SELECT` on GER projections;
- sequence usage;
- execution of the transition and payload validation functions required by the constraints.

RLS is enabled on all four tables. `anon`, `authenticated`, and `service_role` receive no direct GER table access. Where the Supabase `service_role` exists, it may `SET` the constrained GER runtime role without inheriting its privileges.

Views are `security_invoker=true`.

## 11. Payload safety and privacy

GER structured JSON payloads are bounded in size and recursively reject keys associated with:

- private chain-of-thought or reasoning traces;
- raw prompts;
- secrets, passwords, API keys, and tokens;
- credentials and authorization headers;
- raw evidence payloads;
- raw message or conversation content.

This is defense in depth, not a claim that key-name filtering can classify all sensitive information. Callers remain responsible for data minimization and source-system access policy.

The architectural rule is stronger: store references and structured findings, not unrestricted source payloads.

## 12. Conclusion, closure, and reopening

Case conclusion and closure require evidence references.

Reopening is allowed only after conclusion or closure and requires material evidence references. Reopening appends history; it never erases the prior conclusion.

Source status changes must cite a source or evidence reference. Authority changes require an explicit authority reference.

## 13. Recovery and reconstruction

A case can be reconstructed from the immutable rows alone:

1. read `cm_epistemic_case`;
2. read objects and relationships;
3. replay `cm_epistemic_event` by `persistence_seq`;
4. derive current object states and lifecycle status;
5. resolve referenced source evidence from its owning system.

The projections provide deterministic current state without replacing the underlying chronology.

## 14. Test evidence

The live Supabase Test proof established:

- RLS on all four GER tables;
- constrained runtime role with `SELECT` and `INSERT`, but no `UPDATE` or `DELETE`;
- valid inserts through the constrained role;
- append-only owner-path enforcement;
- state transition and stale-state rejection;
- connection-candidate anti-promotion;
- unique event-head lineage and fork rejection;
- exact event-key idempotency conflict detection;
- conclusion and evidence-backed reopening;
- correct current-state projections;
- rollback with zero synthetic residue.

Two issues were discovered during proof and repaired before repository acceptance:

1. the payload-safety CHECK function had been revoked from PUBLIC but not granted to the constrained runtime role, causing valid runtime inserts to fail closed;
2. the performance advisor identified two same-case relationship foreign keys without covering indexes.

Both fixes are preserved as migrations rather than being hidden from the development history.

The post-hardening performance advisor no longer reports GER unindexed foreign keys. The security advisor introduced no GER-specific warnings.

## 15. Retention and deletion boundary

GER-002 does not add deletion endpoints or destructive lifecycle operations.

The `DURABLE-EVIDENCE` governance binding currently disallows hard deletion and supports legal/evidence hold override. If future privacy, legal, or contractual requirements require redaction or disposition, that must be implemented as a separate governed capability that reconciles:

- source-system deletion obligations;
- evidence provenance requirements;
- legal/evidence holds;
- immutable audit requirements;
- minimization and subject rights;
- referential integrity.

A deleted source does not justify fabricating continued availability. GER should append a `source_status_changed` event and preserve only the permitted durable receipt/reference.

## 16. Failure and recovery semantics

Application writes are transactional. Object or relationship creation and its recording event succeed together or roll back together.

A failed transaction does not leave a partial epistemic object without chronology. A failed rollback causes the pooled PostgreSQL connection to be discarded.

The repository does not automatically retry serialization failures. A higher-level caller must reread the latest case state, reassess the proposed operation, and retry explicitly. This prevents a blind retry from bypassing newly material evidence or authority changes.

## 17. Cross-domain pressure test

The four-table envelope remains domain-neutral:

- software debugging: observation, competing root-cause hypotheses, tests, contradictory logs, conclusion, fix, monitoring;
- scientific reasoning: claim, source evidence, competing hypotheses, falsifiers, experiment results, inconclusive outcome;
- cybersecurity: indicators, evidence provenance, hypotheses, authority-gated decisions, source invalidation, reopening;
- business analysis: assumptions, evidence, alternatives, decision, monitoring;
- legal/evidentiary reasoning: testimony and evidence references, contradiction, source status, explicit uncertainty, authority boundary;
- historical research: source provenance, competing interpretation, supersession, unresolved questions;
- Digital Twin: observations and inferences remain distinguishable, with no inference-to-identity shortcut;
- Agent support: reasoning status can inform a recommendation without granting execution authority.

No domain-specific object table is required by these cases.

## 18. Explicit non-goals

GER-002 does not:

- activate Production;
- copy raw evidence into a new evidence warehouse;
- migrate legacy belief, ILP, or decision-tree data;
- grant Agent or VE authority;
- auto-promote Digital Twin inferences;
- implement GER Console UI;
- implement IIC-007 or IIC-008;
- store private chain-of-thought;
- implement destructive retention/disposition.

## 19. Successor effects

GER-002 supplies the persistence boundary required by later GER work:

- GER-003 can persist competing hypothesis and test orchestration without inventing a new store;
- GER-004 can bind Agent/VE epistemic decisions to durable case and authority references;
- GER-005 can persist Digital Twin epistemic distinctions without confusing inference with identity;
- GER-006 can display real durable case state rather than decorative status;
- GER-007 can map EIK and Helper Matrix lineage onto an explicit runtime boundary;
- GER-008 can inject adversarial evidence and verify durable contradiction, stale state, poisoning, authority confusion, and reopening behavior.

## 20. Production boundary

All GER-002 changes are Test-only. Production remains false.

Production activation would require separate authorization and a host-specific proposal covering identities, network boundary, TLS, secret handling, backup/recovery, monitoring, retention/disposition, load characteristics, migration rollout and rollback, security review, and live acceptance evidence.
