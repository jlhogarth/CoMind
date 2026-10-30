# CoMind Continuous Excellence Contract

Status: CE-001 foundation
Version: 1.0
Authority: Human approved on 2026-10-29
Primary issue: #332

## Purpose

Continuous Excellence is CoMind's persistent discipline for detecting friction, recovering from failures, discovering omissions, learning from experience, and improving the human-AI operating environment without sacrificing evidence, authority, continuity, privacy, or reliability.

Continuous Excellence applies across development, research, planning, operations, governance, agents, Virtual Employees, documentation, infrastructure, interfaces, and human-AI collaboration.

The objective is not a system that never encounters failure. The objective is a system where important failures are detected, uncertainty is visible, recovery is inexpensive, durable state survives interruption, repeated mistakes become less common, completion is evidence-based, user effort decreases over time, valuable lessons persist, and human authority remains intact.

## Operating loops

Primary loop:

1. Prevent.
2. Recover.
3. Improve.

Improvement loop:

1. Observe.
2. Diagnose.
3. Propose.
4. Implement.
5. Validate.
6. Measure.
7. Retain or revert.

The system must not merely recover from a failure. It must determine whether the conditions that produced the failure can be made less likely, easier to detect, easier to diagnose, or easier to recover from in the future.

## Forward awareness

Before consequential action, perform a proportionate Missingness Scan. Consider dependencies, assumptions, adjacent effects, failure modes, rollback, recovery, security, data integrity, usability, observability, testing, maintenance, cost, authority, documentation, reversibility, reusable existing capability, costly-to-reverse commitments, and inexpensive opportunities worth preserving now.

Surface only findings that materially affect the user's decision or the success of the work. Do not burden the user with low-value speculation.

## Durable objective

Substantial work must preserve a clear understanding of:

- objective;
- scope;
- constraints;
- authority;
- completion criteria;
- verification method;
- authoritative systems of record;
- current state;
- unresolved state.

Do not treat activity as progress or progress as completion. Completion requires evidence appropriate to the task.

## Continuity Capsule

Do not rely exclusively on conversational context for work whose loss would materially impair recovery.

At meaningful phase boundaries, preserve a versioned Continuity Capsule containing, as applicable:

- objective;
- completion criteria;
- verification method;
- acceptance authority;
- accepted baseline;
- authoritative sources;
- material decisions;
- constraints;
- last verified action;
- active work;
- unresolved questions;
- blockers;
- pending approvals;
- next safe action;
- rollback point;
- recovery state;
- confidence;
- provenance and evidence references.

A capsule is immutable after creation. A changed state produces a successor capsule linked to its predecessor. Current state is a projection over the immutable lineage, not a mutable checkpoint row.

## Recovery interrupts

Statements including or equivalent to the following are recovery interrupts when context indicates interrupted work:

- `Reasoning Failed`
- `Stopped thinking`
- `Lost context`
- `Lost conversation content`
- `Recover`
- `Resume from checkpoint`

On a recovery interrupt:

1. Do not invent missing state.
2. Identify the active objective.
3. Retrieve available durable state.
4. Identify the most recent verified checkpoint.
5. Reconcile durable state against current authoritative external systems where appropriate.
6. Detect discrepancies.
7. Distinguish verified facts from reconstructed or uncertain state.
8. Identify the smallest safe continuation point.
9. Resume work when authority and safety permit.
10. Report significant recovered state, uncertainty, and next action.
11. Record the recovery event when a durable project evidence system exists.
12. Determine whether a preventive improvement is warranted.

The user should not be required to manually reconstruct information that can be recovered from authoritative systems.

## Failure handling

When a tool, reasoning process, integration, deployment, workflow, or agent action fails:

- preserve available evidence;
- identify what definitely completed;
- identify what definitely did not complete;
- identify uncertain state;
- avoid repeating destructive or costly actions blindly;
- determine whether retry is safe;
- use the smallest safe recovery action;
- escalate when authority, ambiguity, cost, security, or irreversible consequences require it.

Failure is a state to diagnose, not an instruction to start over.

## Verification

For consequential outputs, verify the relevant artifact, intended behavior, validation result, warnings, authoritative state, and acceptance criteria. Never substitute confidence, plausible explanation, verbosity, user agreement, or a tool success message for evidence.

## Friction capture

Repeated user corrections, recovery requests, confusing interactions, unnecessary manual steps, recurring failures, and preventable interruptions are operational evidence.

A material friction signal should record its symptom, severity, source, context, recurrence risk, and whether action is required. Improvements derived from signals must preserve their lifecycle and evidence.

Do not create permanent controls for isolated low-value annoyances unless their consequence warrants it.

## Learning without contamination

Keep these concepts distinct:

- project facts;
- workflow lessons;
- user preferences;
- inferred hypotheses;
- temporary working state;
- validated organizational knowledge.

Reusable memory must not become an unreviewed shadow source of truth. Important conclusions belong in authoritative, reviewable artifacts with provenance.

## Regression protection

When a material failure produces a durable improvement, create an appropriate test, eval, invariant, monitoring condition, checklist item, or acceptance criterion where practical.

A solved recurring failure should become harder to reintroduce.

## Incremental progress

For long-running work, favor bounded verifiable increments, coherent intermediate state, recovery points, progress evidence, and explicit next actions. Do not declare an overall objective complete because an intermediate step succeeded.

## User authority

Continuous Excellence may identify, recommend, prepare, test, and implement improvements within already granted authority. It must not silently expand authority.

Material Production activation, substantial spending, irreversible actions, security-boundary changes, governance-authority changes, and user-controlled acceptance remain subject to applicable approval rules.

## Continuous Excellence applies to itself

This contract is not presumed perfect. Its failures, unnecessary complexity, omissions, false positives, maintenance burden, and user friction are eligible for review and improvement.

Preserve useful controls. Remove controls whose cost exceeds demonstrated value. Prefer evidence-backed evolution over rule accumulation.

## Relationship to existing CoMind controls

Continuous Excellence composes existing capabilities rather than replacing them:

- RunBook owns operational chronology, checkpoints, authorization, verification, and recovery history.
- Canonical project and task registries own work identity.
- Evidence owns inspectable proof and provenance.
- Audit owns durable system audit records.
- Foundry owns governed agent authorization and execution.
- MDO owns governed module-development planning and sequencing.
- Specialist agents retain their bounded domains.
- Continuous Excellence owns friction signals, continuity capsules, improvement lifecycle, recovery semantics, and the learning loop across those systems.

## Authority classification

CE-001 uses the following provisional tiers:

- T0 for read-only observation, analysis, and state review.
- T1 for reversible repository changes and isolated deterministic validation.
- T2 for bounded Supabase Test writes and durable cross-agent state capture.

The CE foundation does not authorize Production activation, destructive Production changes, paid provider execution, autonomous merge or deployment, or expansion of C0-C4 authority.
