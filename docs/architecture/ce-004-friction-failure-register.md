# CE-004 Friction and Failure Register workflows

Status: implementation candidate
Issue: #372
Environment: Test-first
Production activation: excluded

## Purpose

CE-004 adds the missing governed disposition lifecycle for existing Continuous Excellence `friction` and `failure` signals.

CE-001 already makes the original signal an immutable observation. CE-004 does not replace that observation and does not turn Continuous Excellence into a second incident-management system. It adds an append-only event history that answers what happened after the signal was captured.

The register can answer whether a signal has been triaged, its current recurrence risk and owner, whether an explicit recurrence pattern has been assigned, whether it was diagnosed, deferred, resolved, closed with no action, or reopened, whether a repeated material pattern is already linked to an improvement, and whether improvement review is recommended.

## Ownership boundary

CE-004 owns only the friction/failure signal lifecycle and its deterministic register projection. It reuses `comind.cm_ce_signal`, CE evidence and improvement relationships, canonical evidence, Durable RunBook, canonical project/task identity, CE-002 recovery/reorientation, and CE-003 Missingness and Forward Reasoning.

It does not own MDO planning, Foundry execution, RuleBook authority, Home/Watchtower presentation, or Implementation Integrity controls.

## Durable object and lifecycle

`comind.cm_ce_signal_event` stores immutable lifecycle events for existing friction/failure signals. Direct UPDATE and DELETE are rejected by the existing CE append-only history trigger.

A signal with no CE-004 event projects as `untriaged`. Accepted event states are `triaged`, `diagnosed`, `deferred`, `resolved`, `closed_no_action`, and `reopened`.

The constrained writer serializes lifecycle mutation per signal with a transaction advisory lock. First lifecycle state must be `triaged`. Terminal states require provenance and can resume only through explicit `reopened`.

Each event carries the current classification snapshot for owner, recurrence risk, and optional explicit pattern key. Later events can change or clear classification without rewriting history.

## Idempotency and recurrence

`record_ce_signal_event(...)` supports an optional idempotency key unique within a signal. Exact replay returns the original event identifier. Conflicting replay fails closed.

CE-004 does not infer recurrence from prose similarity. Only an explicit reviewed `pattern_key` groups signals. The register derives pattern occurrence count and improvement-link coverage from that explicit identity.

## Improvement review

The register may recommend systemic improvement review when an open action belongs to an explicit repeated pattern, the pattern has at least two current occurrences, no signal in that pattern is already linked to a CE improvement, and severity or recurrence risk is at least moderate.

The recommendation does not create, approve, implement, deploy, or retain an improvement.

## Register projection

`comind.v_ce_friction_failure_register` is a private security-invoker projection preserving original signal truth plus current lifecycle state, latest event provenance, owner, recurrence risk, pattern identity, pattern occurrence count, improvement linkage, open-action state, and improvement-review recommendation.

Historical friction/failure signals require no data rewrite and immediately project as `untriaged`.

`comind.v_ce_signal_backlog` is intentionally unchanged because Home/Watchtower already consume its accepted attention semantics.

## Security boundary

`cm_ce_signal_event` has RLS enabled and forced. Browser/Data API roles receive no direct mutation grant. `service_role` receives read access plus execution of the constrained writer, but no direct INSERT, UPDATE, or DELETE on the event table.

The writer is `SECURITY DEFINER`, has a fixed search path, validates signal type and transitions, validates terminal provenance, and serializes concurrent lifecycle changes.

## Server adapter

`server/src/continuous-excellence/friction-failure.ts` separates read and write paths. Reads validate project identity and use only `v_ce_friction_failure_register`. Writes validate bounded explicit input, call only `record_ce_signal_event(...)`, then read back authoritative register state.

The adapter never infers pattern identity or root cause.

## Acceptance strategy

Database verification runs against isolated PostgreSQL 17 inside a transaction that rolls back all synthetic fixtures. It proves historical projection, signal-type boundary, first-event triage, recurrence-risk requirement, transition validation, idempotency, explicit recurrence, improvement-link suppression, terminal provenance, reopen behavior, immutable event history, unchanged legacy backlog behavior, and role isolation.

The dedicated server job proves build, dependency audit, focused adapter behavior, and full server regressions.

## Migration namespace

The final merge-authorized freshness review found that current `main` already used repository migration slot `_021` for RLIB-001. CE-004 therefore uses the next verified-unused slot:

`db/migrations/20261030_025_ce_004_friction_failure_register.sql`

with verifier:

`db/migrations/verify_20261030_025_ce_004_friction_failure_register.sql`

The migration and verifier semantics are unchanged from the previously accepted CE-004 implementation. The renumbering prevents a repository migration-version collision with RLIB-001.

## Forward compatibility

CE-004 deliberately stops before automatic root-cause inference or automatic improvement creation. Future integrations may propose classifications, diagnostics, or improvements through existing governed agent and evidence machinery. The CE-004 substrate stores explicit reviewed state and its append-only history rather than model plausibility.
