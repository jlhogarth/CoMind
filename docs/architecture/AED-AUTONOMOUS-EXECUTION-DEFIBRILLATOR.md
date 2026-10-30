# Autonomous Execution Defibrillator (AED)

Status: AED-001 foundation
Authority: existing CoMind L4A Bounded Autonomous Development Authority
Production change: false

## Purpose

AED is the L4A management-plane liveness and recovery layer. It detects loss of meaningful forward progress in nonterminal development lanes and applies the smallest safe intervention that can restore execution. AED does not create authority and does not replace lane-specific acceptance criteria.

## Core invariant

No nonterminal CoMind development lane may remain indefinitely without one of these outcomes:

1. demonstrated forward progress;
2. an explicitly justified bounded WAITING or BLOCKED state with a concrete wake condition or dependency;
3. an explicit ESCALATED state identifying the smallest human or platform action required.

A controller observation or heartbeat is not progress.

## Control loop

`SENSE -> DIAGNOSE -> CLEAR -> SHOCK -> VERIFY -> ESCALATE`

A successful cycle terminates only when execution has measurably resumed, a bounded legitimate wait/block has been established, or an unavoidable stop boundary has been escalated.

`OBSERVE -> DOCUMENT -> OBSERVE -> DOCUMENT` is an AED failure when the lane is actually stalled.

## Liveness states

- ACTIVE: accepted progress occurred within the lane's expected progress window.
- WAITING: no immediate action is valid because a concrete external event or time condition is pending. A wake condition is required.
- BLOCKED: a named dependency or control prevents the next action. The blocker and responsible owner/controller are required.
- STALLED: the expected progress deadline passed without accepted progress and no valid bounded wait/block explains the lapse.
- ABANDONED: no valid active lease/owner remains and the lane has actionable authorized work.
- ESCALATED: AED reached a mandatory stop boundary and recorded the smallest required intervention.

Lifecycle state and liveness state are separate dimensions.

## Progress semantics

`last_observed_at` and `last_progress_at` MUST be separate.

Accepted progress events are lane-contract-sensitive and may include:

- a new implementation or required evidence commit;
- a PR lifecycle transition;
- exact-head CI execution or completion that advances an acceptance gate;
- an evidence-backed issue/work-item lifecycle transition;
- completion of a dependency;
- creation of a required durable artifact;
- successful authorized mutation or acceptance proof;
- transition into a legitimate bounded WAITING state with a concrete wake condition.

The following never constitute progress by themselves:

- controller heartbeat;
- polling;
- repeated RunBook or GitHub readback;
- conversation activity;
- rewriting an unchanged idle status;
- a recovery attempt that produces no accepted downstream state change.

## AED intervention levels

### AED-0 MONITOR

Healthy or legitimately bounded wait. Observe only.

### AED-1 NUDGE

Reconstruct canonical state and redispatch or reassert the already-authorized next action. No authority expansion.

### AED-2 RECOVER

Perform safe reversible remediation within existing L4A authority. Examples include stale-state reconciliation, expired lease reclamation, safe branch synchronization, and bounded CI recovery.

### AED-3 RESUSCITATE

Perform a qualifying L4A merge, successor activation, or equivalent dependency-valid continuation after every CLEAR gate passes.

### AED-4 ESCALATE

Stop for Production, authority expansion, unresolved collision, consequential ambiguity, credential/connection requirement, cost boundary, or another mandatory RuleBook stop. Record only the smallest required Joseph/platform action.

## CLEAR safety interlock

Before SHOCK, AED MUST verify applicable controls rather than infer them:

- L4A authority and mandatory stop boundaries;
- one issue = one branch = one PR;
- No Placeholder;
- collision and freshness state;
- active lease/claim state;
- dependency validity;
- exact-head CI and mergeability when required by the proposed action;
- cost guardrails;
- Production exclusion unless separately authorized;
- no secrets, credentials, tokens, or raw authorization material in evidence.

If a required value cannot be observed, AED must not invent it. The action must be reduced to one whose safety can be established or escalated.

## Lane liveness projection

For each nonterminal lane, the management plane should expose, when known:

- lane/work-item ID and lifecycle state;
- liveness state and AED level;
- owner/controller and lease/claim;
- issue, branch, PR, exact head SHA, and current main/base SHA;
- exact-head CI counts/status, mergeability, and freshness;
- dependency/blocker and responsible owner;
- canonical next action;
- last_observed_at and last_progress_at;
- expected progress deadline or bounded wait/wake condition;
- last AED intervention and verified outcome;
- Joseph action required;
- Production change flag;
- event timeline and deep links.

This projection is the Operator Console contract. Presentation does not grant write authority.

## Controller integration

Recovery Sweep and Dev Supervisor remain auditable controller identities. AED supplies shared liveness semantics and recovery success criteria. Controller heartbeats update observation state only. They MUST NOT refresh `last_progress_at` unless the same event independently satisfies the progress taxonomy.

Target management-plane loop:

`OBSERVE -> CLASSIFY -> CLAIM -> ACT -> VERIFY PROGRESS -> RELEASE/CONTINUE -> ESCALATE IF REQUIRED`

## Verification rule

A SHOCK is not successful until AED observes an accepted post-intervention progress event or a valid bounded wait/block transition caused by the intervention. Repeated unsuccessful interventions must not masquerade as healthy activity.

## Recovery and evidence

AED preserves append-only diagnosis, safety-gate results, intervention, verification, and outcome evidence. Historical controller evidence is reconciled forward, not erased. All AED repository/schema/Test changes require a reversible path. Production remains unchanged unless separately authorized.