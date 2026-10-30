# CE-004 Friction and Failure Register workflows

Status: implementation candidate
Issue: #372
Environment: Test-first
Production activation: excluded

## Purpose

CE-004 adds the missing governed disposition lifecycle for existing Continuous Excellence `friction` and `failure` signals.

CE-001 already makes the original signal an immutable observation. CE-004 does not replace that observation and does not turn Continuous Excellence into a second incident-management system. It adds an append-only event history that answers what happened after the signal was captured.

The register can now answer:

- Has the signal been triaged?
- What is its current recurrence risk?
- Who currently owns the review, if anyone?
- Has an explicit recurrence pattern been assigned?
- Was it diagnosed, deferred, resolved, or closed with no action?
- Was a terminal disposition later reopened?
- Is a repeated material pattern already linked to a systemic improvement?
- Should an existing CE improvement workflow be reviewed for creation?

## Ownership boundary

CE-004 owns only the friction/failure signal lifecycle and its deterministic register projection.

It reuses:

- `comind.cm_ce_signal` for immutable signal truth;
- `comind.cm_ce_signal_evidence` for evidence relationships;
- `comind.cm_ce_improvement`, `cm_ce_improvement_signal`, and `cm_ce_improvement_event` for systemic improvement work;
- `comind.cm_evidence` for canonical evidence identity;
- Durable RunBook for operational chronology;
- canonical project/task identity;
- CE-002 for recovery/reorientation;
- CE-003 for Missingness and Forward Reasoning.

It does not own MDO planning, Foundry execution, RuleBook authority, Home/Watchtower presentation, or Implementation Integrity controls.

## New durable object

`comind.cm_ce_signal_event`

Each row is an immutable lifecycle event for one existing signal. Direct UPDATE and DELETE are rejected by the existing CE append-only history trigger.

Fields preserve:

- signal identity;
- actor and current owner identity where supplied;
- lifecycle event type;
- current recurrence risk;
- optional explicit pattern key;
- summary and structured details;
- source system and source reference;
- optional idempotency key;
- database-controlled event time.

The owner, recurrence risk, and pattern key are a classification snapshot for the state produced by that event. A later event can therefore change ownership, change recurrence risk, replace a pattern key, or explicitly clear a mistaken pattern key without rewriting history.

## Lifecycle states

A friction/failure signal with no CE-004 event projects as `untriaged`.

Accepted lifecycle event states:

| Current state | Allowed next state |
| --- | --- |
| `untriaged` | `triaged` |
| `triaged` | `diagnosed`, `deferred`, `resolved`, `closed_no_action` |
| `diagnosed` | `deferred`, `resolved`, `closed_no_action` |
| `deferred` | `triaged`, `diagnosed`, `resolved`, `closed_no_action` |
| `resolved` | `reopened` |
| `closed_no_action` | `reopened` |
| `reopened` | `triaged`, `diagnosed`, `deferred`, `resolved`, `closed_no_action` |

The constrained writer serializes lifecycle mutation per signal with a transaction advisory lock before checking the current state.

## Terminal disposition

`resolved` and `closed_no_action` are terminal states.

Both require an explicit `source_ref`. `closed_no_action` additionally requires `details.disposition_reason`.

A terminal signal can resume active review only through `reopened`. The original signal remains immutable and is never marked false, deleted, or rewritten.

This preserves the distinction between:

- the observation that friction/failure occurred;
- the later decision about what CoMind should do about it.

## Idempotency

`record_ce_signal_event(...)` supports an optional idempotency key unique within a signal.

An exact replay returns the original event identifier. A replay that reuses the key with different semantic content fails closed with a uniqueness violation.

The idempotency check occurs before transition validation so an exact retry remains safe even when later lifecycle events have already advanced the signal.

## Explicit recurrence only

CE-004 does not infer recurrence from similar prose.

A `pattern_key` is authoritative only because a reviewed caller explicitly supplied it. Similar summaries without the same explicit pattern key remain separate.

The register derives `pattern_occurrence_count` from current explicit pattern assignments. A null pattern key has occurrence count zero.

This creates a clean future integration boundary for agents or humans that may propose a pattern classification. Such a proposal must still become explicit governed input before CE-004 treats signals as recurrent.

## Improvement-review recommendation

The register may recommend review for a systemic CE improvement when all of these are true:

1. the signal still requires action;
2. the lifecycle is not terminal;
3. an explicit pattern key exists;
4. the pattern has at least two current signal occurrences;
5. no signal in that explicit pattern is already linked to an existing CE improvement;
6. the signal severity or recurrence risk is at least moderate.

The result is `improvement_review_recommended=true`.

That flag does not create, approve, implement, deploy, or retain an improvement. Existing CE improvement functions and human/agent authority remain controlling.

## Register projection

`comind.v_ce_friction_failure_register` is a private, security-invoker projection over friction/failure signals and their latest lifecycle event.

It preserves original signal truth plus:

- current state;
- latest lifecycle event metadata;
- owner;
- recurrence risk;
- pattern key;
- pattern occurrence count;
- linked improvement count for the signal;
- linked improvement count across the explicit pattern;
- open-action state;
- improvement-review recommendation.

Historical friction/failure signals require no migration. They immediately project as `untriaged`.

## Legacy attention projection boundary

CE-004 does not change `comind.v_ce_signal_backlog`.

That projection is already consumed by Home/Watchtower as an attention source. Its accepted semantics remain:

- original signal requires action; and
- the signal is not already linked to an improvement.

A CE-004 lifecycle disposition therefore does not silently change the legacy attention contract. Any future decision to replace or refine that projection must be a separately reviewed cross-lane contract change.

## Security boundary

`cm_ce_signal_event` has RLS enabled and forced.

Browser/Data API roles receive no direct mutation grant. `service_role` receives read access plus execution of the constrained writer, but no direct INSERT, UPDATE, or DELETE on the event table.

The writer is `SECURITY DEFINER`, has a fixed search path, validates signal type, validates transitions, validates terminal provenance, and serializes concurrent lifecycle changes.

## Server adapter

`server/src/continuous-excellence/friction-failure.ts` keeps evaluation and mutation separate.

Read path:

- validates project identity;
- reads only `v_ce_friction_failure_register`;
- produces deterministic summary counts and stable recommended signal IDs;
- performs no mutation.

Write path:

- validates bounded explicit inputs before any database call;
- calls only `record_ce_signal_event(...)`;
- reads the authoritative register row after persistence;
- returns the persisted event ID plus current register state.

The adapter never infers a pattern key or root cause.

## Acceptance strategy

Database verification runs against isolated PostgreSQL 17 inside a transaction that rolls back all synthetic fixtures.

It proves:

- historical signal projection;
- signal-type boundary;
- first-event triage requirement;
- recurrence-risk requirement;
- transition validation;
- idempotent replay and conflicting replay rejection;
- explicit recurrence only;
- improvement-link suppression;
- provenance-bearing no-action closure;
- terminal/reopen behavior;
- immutable event history;
- unchanged legacy backlog behavior;
- role privilege isolation.

The dedicated server job proves build, dependency audit, focused adapter behavior, and the full server regression suite.

## Final migration namespace

The merge-authorized freshness review discovered that current `main` already uses repository migration slot `_021` for RLIB-001. CE-004 therefore uses the next verified-unused repository slot:

- `db/migrations/20261030_025_ce_004_friction_failure_register.sql`
- `db/migrations/verify_20261030_025_ce_004_friction_failure_register.sql`

The migration SQL and verifier semantics are unchanged from the accepted CE-004 implementation. This renumbering prevents a repository migration-version collision while preserving the already-applied logical Supabase Test migration `ce_004_friction_failure_register`.

## Forward compatibility

CE-004 deliberately stops before automatic root-cause inference or automatic improvement creation. Later integrations can propose classifications, diagnostics, or improvements through existing governed agent and evidence machinery. The CE-004 substrate remains useful because it stores explicit reviewed state and its history rather than model plausibility.
