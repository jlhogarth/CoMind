# AUTH-001 — CoMind Authority Hierarchy and Authority Graph

**Date:** 2026-10-26  
**Issue:** #205  
**Status:** Test-verified; repository exact-head CI pending  
**Environment:** CoMind private Test only  
**Production:** Unchanged

## Purpose

AUTH-001 extends the DRULE-003 authority substrate into a first-class, scoped Authority Graph. The graph answers who or what is claiming authority, what durable evidence supports that claim, which scope/environment/capability it covers, which delegation or constraint lineage applies, and whether a concrete request is sufficient, insufficient, inapplicable, or unresolved.

The implementation preserves the foundational distinction:

`source authority/status != rule approval/lifecycle != governing authority != operational permission`

No layer silently implies another.

## Architecture

AUTH-001 adds:

- `db/migrations/20261025_015_auth_001_authority_graph.sql`
- `db/migrations/20261025_016_auth_001_event_ordering_hardening.sql`
- `db/sql/20261026_auth_001_initial_authority_graph_seed.sql`
- `db/verification/20261026_auth_001_authority_graph_verification.sql`
- `scripts/test_auth_001_authority_graph.sh`
- `.github/workflows/auth-001-authority-graph.yml`

The primary migration adds:

- versioned authority scope bindings;
- authority basis/evidence links;
- typed authority relationships;
- append-only relationship decisions;
- versioned operation requirements;
- current-scope/current-requirement/current-relationship projections;
- recursive delegation lineage;
- deterministic authority resolution;
- service-role-only private access with RLS.

The graph extends `pm_rule_authorities`; it does not replace the Rulebook, Development Journal, DRULE-002 reconciliation system, or source census.

## Partial-order model

AUTH-001 deliberately avoids a global numeric authority ranking. Authority is resolved against a concrete request composed of:

- authority subject;
- capability;
- action/operation class;
- resource class;
- environment;
- domain;
- request context.

The resolver evaluates scoped authority, delegation lineage, supersession, stronger constraints, explicit requirements, unresolved reconciliation cases, validity bounds, and authority class.

### Fail-closed behavior

AUTH-001 does not contain a general contextual policy evaluator. If a matching scope or requirement contains a non-empty selector, the resolver returns `unresolved` rather than pretending the condition was evaluated. Contextual policy evaluation is reserved for the Rule Evaluation Engine work in Step 4.

Advisory and evidentiary-only authority classes cannot grant operational permission. Canonical or approved source evidence may support an authority claim but does not promote that claim into permission.

## External implementation patterns adapted

The design reviewed established authorization patterns before custom implementation:

- Cedar authorization request model: principal, action, resource, context — https://docs.cedarpolicy.com/auth/authorization.html
- Cedar guidance that request context should not replace principal/resource facts — https://docs.cedarpolicy.com/bestpractices/bp-using-the-context.html
- OpenFGA relationship tuples and the distinction between relationships and runtime/attribute conditions — https://openfga.dev/blog/conditional-tuples-announcement
- Open Policy Agent separation of policy decision-making from enforcement — https://www.openpolicyagent.org/docs

Decision: adapt the proven modeling separations without introducing Cedar, OpenFGA, or OPA as an AUTH-001 runtime dependency. CoMind/PostgreSQL remains the canonical authority/evidence store. Runtime policy-engine selection remains a Step-4 decision.

Development Journal research event: `c395e1a2-a08b-42da-8f77-384d259a2e25`.

## Cross-lane reconciliation

AUTH-001 began from DRULE-003 merge `a590f8479fc7f941ebd5f4ade96447255b5cb722`. While work was paused, another conversation merged CFR-001G and moved `main` to `0eb804657e9ff232e657cd5559c58b164164ae1e`.

The AUTH branch was 30 commits behind current main. Before any Test execution:

1. the complete AUTH migration was recovered from GitHub as blob `48d87e248b63cc8c3ced25ba4efdc004ba0abc9a`;
2. the AUTH branch was rebuilt on current `main` while preserving that blob;
3. the branch ref was updated with force-with-lease against the exact prior AUTH head;
4. current main was checked for migration-slot and authority-substrate conflicts.

CFR-001G did not alter the DRULE-003 authority tables and did not claim `20261025_015`. It did introduce additional `20261025_012`/`013` filenames in a separate conversation-analytics lane. Therefore AUTH-001 CI applies dependencies by exact filename rather than assuming numeric-prefix uniqueness.

## Live Test deployment

Before deployment, Test was checked for existing AUTH-001 graph objects. None existed.

Applied successfully to private Test:

- `auth_001_authority_graph`
- `auth_001_event_ordering_hardening`

No production schema, data, RLS, grants, or C4 action was changed.

## Defect discovered during behavioral verification

The first positive delegation proof exposed a real ordering defect.

### Symptom

A delegation relationship was inserted, automatically producing a `proposed` event. A `confirmed` event was then inserted in the same transaction. The resolver still observed the relationship as `proposed` and returned `delegated_authority_has_no_valid_delegation_lineage`.

### Root cause

PostgreSQL `now()` is transaction-stable. The `proposed` and `confirmed` events could therefore share the same timestamp. The original current-state projection ordered events by `occurred_at DESC, id DESC`, which used UUID ordering as an unintended tie-breaker. Governance state could become nondeterministic.

### Repair

Migration `016` adds an identity-backed monotonic `event_seq` and makes relationship current-state and transition enforcement use `event_seq` ordering.

The transition contract is now:

- initial event: `proposed` only;
- `proposed -> confirmed | rejected | revoked`;
- `confirmed -> superseded | revoked`;
- `rejected`, `superseded`, and `revoked` are terminal.

A revoked or rejected authority relationship cannot later be resurrected by appending another `confirmed` event.

The issue originally targeted one additive migration. The verified implementation now contains one primary additive migration plus one narrowly scoped hardening migration because validation exposed a real temporal-ordering defect after the primary migration had been applied to Test. Preserving that repair as an explicit migration is more auditable than rewriting Test history.

## Live behavioral verification

All synthetic verification data ran inside rollback-only transactions. A connector 502 occurred during the first large combined proof; residue was checked immediately and `AUTH-TEST-*` row count was zero. The proof was then split into smaller deterministic slices.

Verified in live Test:

1. scoped delegated authority resolves `sufficient` when a valid confirmed delegation lineage exists;
2. revocation becomes the deterministic current relationship state;
3. a post-revocation confirmation attempt is rejected because revoked is terminal;
4. a delegated C2 agent cannot satisfy a production C4/human requirement;
5. a synthetic human C4 authority can satisfy that requirement;
6. canonical/approved source evidence does not promote an advisory authority into operational permission;
7. expired authority returns `inapplicable` / `authority_not_active`;
8. selector-bearing scope returns `unresolved` / `scope_selector_requires_policy_evaluator`;
9. a confirmed `require_human` constraint rejects a non-human delegated authority;
10. an authority conflict linked to an open reconciliation case returns `unresolved` / `open_authority_conflict`;
11. confirmation of a delegation edge that would create a cycle is rejected.

## Initial real CoMind Authority Graph seed

The Test seed incorporates `AUTH-FOUNDER-001` without silently expanding its authority.

Verified readback:

- `founder_scope_rows = 1`
- `founder_basis_rows = 1`
- `production_c4_requirements = 6`

The founder scope is limited to:

- domain: governance;
- environments: development, test, staging;
- operations: rule activation, Authority Graph management, Rulebook governance;
- resources: rule, Authority Graph, governance record;
- all six DRULE governance capabilities;
- no implied C0-C4 level;
- metadata explicitly marks production excluded and C4 not implied.

The founder authority is linked to the durable authorization event `chat:2026-10-25:seven-step-rulebook-authorization`.

Production is separately protected by six active requirements, one per governance capability. Each requires:

- target environment `production`;
- human subject;
- authority level C4;
- governing rule `RULE-AUTH-001` at its exact current version;
- no automatic authority escalation.

## Repository verification contract

`db/verification/20261026_auth_001_authority_graph_verification.sql` checks:

- required graph tables, views, resolver, RLS, and public-grant boundary;
- monotonic relationship event sequence;
- exact real-seed counts and production exclusion;
- positive delegation;
- terminal revocation and anti-resurrection;
- production C4/human requirement;
- canonical-source non-escalation;
- expiration;
- selector fail-closed behavior;
- human-only constraints;
- unresolved conflicts;
- delegation-cycle prevention.

`scripts/test_auth_001_authority_graph.sh` reconstructs the dependency chain in isolated PostgreSQL using exact migration filenames, creates the minimum governed fixture, replays seeds twice to prove idempotency, and runs the verifier.

`.github/workflows/auth-001-authority-graph.yml` executes that proof against the exact pull-request head.

## Open merge gate

At this provenance checkpoint:

- live Test migration: **passed**;
- live Test behavioral verification: **passed**;
- real Test seed/readback: **passed**;
- production: **unchanged**;
- exact-head GitHub CI: **pending**;
- pull request: **not yet opened**.

AUTH-001 must not merge until the final immutable PR head has a terminal successful exact-head workflow matrix and current `main` has been rechecked for drift.
