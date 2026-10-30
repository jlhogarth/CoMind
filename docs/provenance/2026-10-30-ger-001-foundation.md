# GER-001 Foundation Evidence

Date: 2026-10-30
Issue: #378
Branch: `ger-001-governed-epistemic-reasoning-foundation`
Base main: `9579814e6e86af8af78a7e604d23ab3d8406baad`
Environment: Test-first
Supabase Test project: `sbgfuanxiqepcoboxzcl`
Policy version: `ger-001-v1`
Production activated: false

## Purpose

This record preserves the durable reconstruction, collision review, design decisions, implementation boundary, failures/recovery, and evidence generated while establishing Governed Epistemic Reasoning as a first-class CoMind architectural layer.

## Freshness and collision review

At branch creation and the subsequent pre-PR freshness check, `main` remained exactly `9579814e6e86af8af78a7e604d23ab3d8406baad`. The GER branch was created from that exact revision.

Known adjacent active work reviewed during GER-001 included:

- CE-004 Friction and Failure Register workflows;
- VE-STD-001 Virtual Employee engineering standard;
- IIC-005 no-magic configuration enforcement;
- CP-04 frozen stale-memory and contradiction evaluation;
- planned IIC-007 cross-system integrity evidence envelope;
- planned IIC-008 Implementation Reality Graph;
- active Conversation History and continuity work;
- existing RuleBook, Foundry, MDO, ThreadKeeper, Operator Console, Digital Twin, and Agent/VE architecture.

Disposition: GER-001 is an architecture-foundation and deterministic-policy lane. It does not create a new evidence database, alter CP-04, alter VE-STD-001, duplicate CE-003/CE-004, create an Implementation Reality Graph, mutate Agent authority, promote Digital Twin inferences, or create Console presentation.

## Recovered epistemic capability inventory

### Repository and documentation

Durable source review established:

- EIK exists as a current concept and historical responsibility family, but the current Helper Matrix review did not establish a verified runtime under the historical EIK name.
- Helper Matrix, Signal Fidelity, Assumption Validator, Continuity Watchdog, and related helper traits have detailed design/specification evidence, but the current review did not establish runtime under all historical names.
- ThreadKeeper is operational in bounded Test and explicitly does not own epistemic truth.
- RPDA conceptually separates situation, perception, observation, inference, recommendation, decision, authorization, and action.
- Canonical Development Evidence already provides generic entities, typed relationships, artifacts, and append-only journal lineage.
- IIC-007 and IIC-008 already own planned cross-system evidence-envelope and implementation-reality responsibilities that GER must not duplicate.
- CE-003 already implements deterministic Missingness and Forward Reasoning for development work.
- CP-04 already owns a frozen adversarial stale/contradiction evaluation protocol.

### Supabase Test

Recovered row counts at GER-001 baseline:

- `comind_development.entity`: 275
- `comind_development.relationship`: 153
- `comind_development.journal_entry`: 37
- `comind.cm_evidence`: 56
- `comind_pm.pm_decision_records`: 1
- `comind.cm_decision_tree`: 0
- `comind.cm_decision_node`: 0
- `comind.cm_decision_edge`: 0
- `comind.cm_ilp_hypothesis`: 0

Important physical findings:

- `comind.cm_evidence` is populated and actively used by operational workflows.
- `comind_development.entity`, `relationship`, and `journal_entry` already provide a generalized durable development-evidence substrate.
- legacy decision-tree and ILP-hypothesis tables exist but were empty at recovery. GER-001 therefore does not adopt them merely because their names overlap the new architecture.

## Architecture decisions

1. GER is the governing architecture for epistemic lifecycle, not a new truth database.
2. A fact is not introduced as a free-standing table primitive. It is a claim whose status meets applicable evidence and rigor policy while retaining provenance and reopening conditions.
3. Confidence is an assessment with a basis, not evidence.
4. A competing hypothesis is a hypothesis connected through an explicit competition relation. It does not require a separate physical table solely because it has a different noun.
5. A novel connection begins as `connection_candidate` and cannot be promoted directly to fact or identity.
6. The original conceptual multiplicative rigor formula was rejected. Multiplication can hide a critical factor when another input is zero and creates false precision. GER-001 instead implements a versioned monotonic weighted policy with non-averagable hard floors.
7. Unknown required rigor inputs fail safe to at least R3 rather than lowering scrutiny.
8. Critical consequence, irreversibility, external impact, or named critical triggers force R4.
9. Consequential action is separately gated by authority and capability. High confidence never creates permission.
10. Material conclusions retain competing explanations, contradictions, falsifiers, tests, uncertainty basis, review, and reopening conditions proportionate to rigor.
11. GER auditability requires inspectable structured rationale and evidence references, not private chain-of-thought retention.
12. Physical GER persistence is deferred to GER-002 until existing canonical stores and IIC-007/IIC-008 are reconciled.

## Implemented GER-001 artifacts

- `docs/architecture/ger-001-governed-epistemic-reasoning.md`
- `server/src/epistemic/ger.ts`
- `server/test/ger.test.mjs`
- `.github/workflows/ger-001-governed-epistemic-reasoning.yml`
- this provenance record

The deterministic policy kernel implements:

- versioned epistemic object and state contracts;
- proportional rigor assessment R0 through R4;
- hard-floor and unknown-input handling;
- governed state-transition validation;
- conclusion-readiness evaluation;
- novel-connection anti-promotion guard;
- competing-hypothesis/falsifier/test/review requirements by rigor;
- separate action-readiness authority and capability gates;
- human-approval and monitoring requirements for high-consequence R3/R4 action;
- reopening triggers and materiality handling;
- canonical GER invariants.

No schema migration was performed by GER-001.
No Production capability was activated.

## RunBook registration

GER-001 is registered in `comind_pm.pm_work_items` with work item ID:

`e73285f8-7bef-4bbc-af80-9a5e37dea86a`

The initial RunBook event preserves the issue, branch, base revision, recovered row counts, non-Production boundary, and failed-write recovery evidence.

## Failure and recovery evidence

Two schema-assumption failures were preserved rather than hidden:

1. The first active-work query assumed a `lane` column on `comind_pm.pm_work_items`. PostgreSQL rejected the query because the real schema uses `area`. The actual information-schema columns were then read before retrying.
2. The first GER RunBook insert used `item_type = architecture`. PostgreSQL rejected the row because the governed check constraint allows `epic`, `lane`, `task`, `bug`, `decision`, `risk`, `blocker`, `research`, `milestone`, `audit`, or `document`. The constraint definitions were read explicitly, and GER-001 was correctly registered as `item_type = lane`. The event actor and event type were also aligned with the actual governed checks.

No partial row from either failed transaction survived.

## Successor work created

- #379 GER-002: Epistemic Case and Persistence Contract
- #380 GER-003: Competing Hypothesis and Test Orchestrator
- #381 GER-004: Agent and Virtual Employee Epistemic Enforcement
- #382 GER-005: Digital Twin Epistemic Promotion and Inference Boundaries
- #383 GER-006: Operator Console Epistemic Operations
- #384 GER-007: EIK and Helper Matrix Reconciliation
- #385 GER-008: Adversarial Epistemic Evaluation Suite

Each successor is intentionally separate so persistence, reasoning orchestration, Agent authority, Digital Twin inference, Console operations, historical reconciliation, and adversarial evaluation can be accepted independently under one issue = one branch = one PR.

## Acceptance status at this evidence revision

Implemented foundation artifacts are present on the GER branch. Exact-head CI evidence and pull-request review state are recorded in a later revision of this same provenance record once those GitHub objects exist.
