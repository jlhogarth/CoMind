# MDO-004 Governed Plan Disposition Provenance

Status: acceptance candidate
Issue: #377
PR: #391
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

The persistent Test acceptance uses an explicitly synthetic Test-only `person` actor tied to issue #377. It does not impersonate or expose a real human identity. This fixture proves the person-authority contract while the development lane remains governed by the Founder's explicit instructions and the CoMind Development Contract.

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

MDO-004 began from `main` after GER-001. While implementation was in progress, CE-004 merged and legitimately occupied migration slot `20261030_025` with its friction/failure register migration. The CE-004 file set was otherwise disjoint from MDO-004.

MDO-004 therefore moved forward to migration slot `20261030_026`. No CE-004 file, runtime, schema object, or evidence was overwritten. The MDO branch was reconciled onto CE-004 as first parent while preserving the MDO development history as a second parent. PR #391 then compared as zero commits behind that `main` and exactly eight MDO-owned files before the persistent Test harness was added.

## Isolated PostgreSQL acceptance and recovery

The first PR acceptance candidate reached the behavioral replay path and exposed a real PL/pgSQL defect. The initial acceptance event succeeded, but exact idempotent replay failed because the table column `disposition_event_id` was unqualified inside a function whose output parameter has the same name. PostgreSQL correctly rejected the query as ambiguous.

That failed run is preserved in GitHub Actions. Supabase Test had not been changed at that point.

The repair qualified the replay evidence lookup through alias `de`:

`de.disposition_event_id = v_existing.disposition_event_id`

The structural verifier was strengthened to require that qualified replay contract so the ambiguity cannot silently regress.

On repaired exact head `642aceb043d6bee22c2a9bc78a2e21801ac4b01c`:

- the MDO-004 server contract completed successfully;
- TypeScript build and production dependency audit passed;
- deterministic MDO-004 service tests passed;
- accepted MDO runtime regressions passed;
- isolated PostgreSQL lifecycle verification passed;
- migration `026` applied twice successfully;
- structural verification passed;
- rollback-only behavioral verification passed, including incomplete acceptance rejection, person-only authority, expired authority rejection, block/resume, complete acceptance, exact replay, conflicting replay rejection, duplicate acceptance rejection, append-only history, valid supersession, and unchanged module maturity.

## Supabase Test promotion

After isolated acceptance, migration `mdo_004_governed_plan_disposition` was promoted to canonical Supabase Test project `sbgfuanxiqepcoboxzcl` only. No Production database was changed.

Direct Test readback confirmed:

- `mdo.plan.disposition` exists with target kind `module_plan`, maximum authority `C2`, adapter `mdo`, and `cost_bearing=false`;
- RLS is enabled on both disposition tables;
- `anon` and `authenticated` cannot execute the security-definer disposition function;
- `service_role` has the intended execution privilege;
- the deployed function contains the person-only authority guard;
- the deployed function contains the qualified idempotent replay lookup;
- the deployed function contains no `cm_module_registry` mutation.

## Persistent Test plan readiness

The accepted MDO-003 Test plan was read back after migration promotion and before any MDO-004 disposition mutation.

Canonical plan:

- plan ID: `2b7a4901-48de-45b4-9023-5e37b73da8ac`;
- version: 4;
- project ID: `e9e96ac1-bdf7-4a97-a94f-ddf16218a2cb`;
- module ID: `d371d297-34a0-4150-8a32-64b3aae77594`;
- module code: `MDO3-TEST`;
- plan status: `in_review`;
- target stage: `specified`;
- module lifecycle stage: `conceived`.

Independent completeness readback confirmed:

- 10 tasks;
- 10 done tasks;
- 10 completed leases;
- 10 contributions;
- 10 contributions with canonical evidence linkage;
- 10 contribution execution contexts with successful terminal outcomes.

The plan is therefore structurally eligible for governed MDO-004 acceptance, subject to the new exact C2 person-authority and evidence-bearing disposition path.

## Persistent Test acceptance contract

The final exact-head workflow adds a persistent Supabase Test proof that:

1. verifies the exact canonical Test database and PostgreSQL 17 identity;
2. resolves the canonical MDO-003 Test project, module, and latest plan by their accepted source identities;
3. rechecks all ten completeness invariants before mutation;
4. creates or reuses only an explicit synthetic Test `person` authority fixture;
5. creates or reuses canonical human-review evidence;
6. on the first acceptance, proves an expired C2 authorization creates zero disposition side effects;
7. issues one exact, unexpired C2 isolated authorization for the exact plan;
8. accepts the plan once through `cm_mdo_dispose_plan(...)`;
9. proves exact replay returns `created=false`;
10. proves conflicting replay fails closed;
11. independently reads back exactly one acceptance event, one evidence link, and one acceptance audit record;
12. requires the plan to be `accepted` while the module remains `conceived`;
13. preserves a durable GitHub Actions acceptance artifact;
14. remains replay-safe if the workflow is rerun after the plan has already been accepted.

The persistent proof uses no model provider and no paid API. It creates no capability grant and grants no Production authority.

## Supabase platform review

The current Supabase changelog was reviewed before implementation. The October 30, 2026 Data API exposure change reinforces explicit grants and RLS. MDO-004 objects live in the private `comind` schema, enable RLS as defense in depth, revoke browser-role access explicitly, and expose the security-definer disposition function only to `service_role`.

The announced November 2026 HTTP TLS cipher retirement does not change this migration design because MDO-004 Test acceptance uses the existing pinned direct PostgreSQL/pooler path, not a newly introduced HTTP API dependency.

## Recovery

Repository work remains isolated to issue #377, branch `mdo-004-governed-plan-disposition`, and PR #391. Database work is additive and Test-only. Failed isolated or Test acceptance remains evidence and is repaired forward. No Production activation is authorized.
