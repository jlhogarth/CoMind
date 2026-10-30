# MDO-004 Governed Plan Disposition Provenance

Status: implementation candidate
Issue: #377
Environment: isolated PostgreSQL first, canonical Supabase Test second
Production activated: false
Paid provider authorized: false

## Purpose

MDO-004 closes the lifecycle gap between a completed MDO planning run and an explicitly human-governed plan disposition. MDO-003 proved that the ten-role planning workforce can durably produce an evidence-bearing plan in canonical Test. It intentionally left the plan `in_review` and did not grant the workforce authority to accept its own output.

MDO-004 adds the smallest authority-preserving disposition layer needed to move plans through review states without conflating plan acceptance with module maturity.

## Reuse and ownership

MDO-004 reuses:

- `comind.cm_mdo_plan` as the current plan-status projection;
- MDO tasks, contributions, contribution evidence, Foundry execution outcomes, and fenced work leases as the completeness evidence for acceptance;
- `comind.cm_foundry_authorization_request` and `cm_foundry_authorization_decision` for exact authority;
- `comind.cm_evidence` for canonical evidence identity;
- `comind.cm_audit_log` for system audit;
- `comind.cm_module_registry` as read-only module identity and maturity context.

It does not create a second decision ledger, task queue, evidence store, module registry, agent runtime, or maturity workflow.

## Authority contract

Capability `mdo.plan.disposition` is non-cost-bearing, adapter `mdo`, target kind `module_plan`, and maximum authority `C2`.

A disposition is valid only when:

1. the attributable actor exists and has canonical actor kind `person`;
2. the Foundry authorization decision is approved;
3. the authorization request and decision identify that same person actor;
4. project, target kind, exact plan target, C2 authority, isolated environment, and validity window all match;
5. canonical evidence is linked;
6. the requested transition is legal.

This prevents a service actor, Foundry agent, provider model, planning worker, or portfolio coordinator from accepting its own plan.

## Lifecycle contract

Legal transitions in this increment:

- `in_review -> accepted` through `accept`;
- `queued|in_review -> blocked` through `block`;
- `blocked -> in_review` through `resume_review`;
- `accepted -> superseded` through `supersede` when a later accepted plan for the same module is named.

All other transitions fail closed.

Every successful transition creates an immutable `cm_mdo_plan_disposition_event` and canonical evidence link. `cm_mdo_plan.status` is the mutable current projection of that append-only history.

## Acceptance completeness

Human acceptance is blocked unless all ten canonical MDO tasks exist and each required completion invariant is present:

- 10 tasks;
- 10 tasks with `done` status;
- 10 completed Foundry leases;
- 10 MDO contributions;
- evidence linkage for all 10 contributions;
- successful canonical Foundry execution outcome for all 10 contribution execution contexts.

No confidence score, model output, or planning-role recommendation substitutes for these durable facts.

## Supersession

Supersession requires the source plan to be accepted and the successor to be:

- distinct from the source;
- for the same module;
- a higher plan version;
- already accepted.

Supersession preserves both plan records and all evidence. It does not delete or rewrite the earlier plan.

## Maturity boundary

MDO-004 never updates `comind.cm_module_registry`. Plan acceptance, blocking, resumption, or supersession does not promote module maturity. Any future transition from an accepted plan to module lifecycle advancement requires a separate governed milestone.

## Idempotency and provenance

Every disposition has a unique idempotency key. Exact replay returns the existing event with `created=false`. A conflicting replay using the same key but different plan, actor, authorization, rationale, source, successor, or evidence fails closed.

Disposition events and evidence links reject UPDATE and DELETE through the existing MDO append-only provenance trigger.

## Freshness and migration namespace recovery

MDO-004 began from `main` after GER-001. While implementation was in progress, CE-004 merged and legitimately occupied migration slot `20261030_025` with its friction/failure register migration. The CE-004 file set is otherwise disjoint from MDO-004.

MDO-004 therefore moved forward to migration slot `20261030_026`. No CE-004 file, runtime, schema object, or evidence is overwritten. The MDO branch must be reconciled onto the CE-004 merge before PR acceptance.

## Isolated acceptance strategy

Before canonical Test promotion, the MDO-004 workflow must:

1. rebuild and verify the accepted MDO-001 substrate in isolated PostgreSQL 17;
2. apply accepted MDO-002 terminal alignment and MDO-003 plan-scope hardening;
3. apply migration `20261030_026_mdo_004_governed_plan_disposition.sql` twice;
4. prove schema, permissions, capability, RLS, immutability, C2 exact-plan authority, completeness checks, supersession checks, and the module-maturity boundary;
5. run a rollback-only lifecycle proof covering incomplete-plan rejection, person-only authority, expired authorization, block/resume, complete acceptance, exact replay, conflicting replay rejection, duplicate-acceptance rejection, immutable history, valid supersession, and unchanged maturity;
6. build the server and run deterministic MDO-004 and existing MDO runtime tests.

Only after those gates are green may migration `026` be promoted to canonical Supabase Test.

## Supabase platform review

The current Supabase changelog was reviewed before implementation. The October 30, 2026 Data API exposure change reinforces explicit grants and RLS. MDO-004 objects live in the private `comind` schema, enable RLS as defense in depth, revoke browser-role access explicitly, and expose the security-definer disposition function only to `service_role`.

The announced November 2026 HTTP TLS cipher retirement does not change this migration design because MDO-004 Test acceptance uses the existing pinned direct PostgreSQL/pooler path, not a newly introduced HTTP API dependency.

## Recovery

Repository work is isolated to issue #377, branch `mdo-004-governed-plan-disposition`, and its future PR. Database work is additive and Test-first. Failed isolated or Test acceptance remains evidence and is repaired forward. No Production activation is authorized.
