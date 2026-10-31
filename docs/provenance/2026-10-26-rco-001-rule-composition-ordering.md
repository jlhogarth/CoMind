# RCO-001 — Rule Composition and Deterministic Ordering

**Date:** 2026-10-26  
**Issue:** #236  
**Pull request:** #242  
**Status:** Live Test verified; repository verification corrections in progress  
**Environment:** Private Test only  
**Production:** Unchanged

## Purpose

RCO-001 fills the missing runtime layer between REE-001 single-rule evaluation and EDG-002 Rulebook graph integration.

REE-001 evaluates one exact rule/version. RCO-001 combines a complete governed rule-result set into a deterministic final outcome without relying on database row order, recency, a universal numeric rule rank, or model judgment.

EDG-002 / Issue #221 is intentionally held until this layer is merged.

## Composition policy

Named/versioned policy:

`constraint_guarded_composition_v1`

Result-safety precedence:

1. `deny`
2. `unresolved`
3. `not_machine_evaluable`
4. `insufficient_evidence`
5. `require_review`
6. `allow`
7. `not_applicable`

This is result composition, not authority ranking. Final decisions are order-independent. Result arrays are ordered only for deterministic diagnostics.

## External precedents reviewed

- OASIS XACML 3.0: explicit combining algorithms such as deny-overrides, permit-overrides, first-applicable, and ordered variants — https://docs.oasis-open.org/xacml/3.0/xacml-3.0-core-spec-cos01-en.html
- Cedar: default deny and forbid-overrides-permit with determining-policy diagnostics — https://docs.cedarpolicy.com/auth/authorization.html
- Open Policy Agent / Rego: conflicting complete outputs surface as evaluation conflicts rather than silent selection — https://www.openpolicyagent.org/docs/errors/eval-conflict-error/rule-name-produced-conflicting-values

Decision: adapt explicit composition, deny guarding, diagnostics, and fail-closed conflict semantics without adopting first-applicable or a universal numeric rule priority.

Development Journal research event: `628dcd49-638a-4d63-b31f-b4cab7f21e11`.

## Rule relationship semantics

RCO-001 preserves existing Rulebook meanings:

- `specializes`: diagnostic specificity only; it does not silently cancel the generalized rule.
- `supports`: no runtime precedence.
- `predecessor_of`: lineage only.
- `supersedes`: does not erase an independently active governed predecessor merely because an edge exists. Lifecycle and governed-set versioning must explicitly establish replacement.
- confirmed applicable `conflicts_with`: final `unresolved`.
- proposed conflict: diagnostic only.

## Governed composition sets

RCO does not trust a caller-selected arbitrary list of results. Every composition request references an immutable governed set.

### `formalization_ready_domain`

The composer dynamically proves that every currently formalization-ready rule in an explicit domain is represented at its exact current version. A newly formalized rule makes the prior set stale until a new governed set version is created.

Initial real set:

`ARIS-LIFECYCLE-READY` v1

Current members:

- `RULE-ARIS-LC-001` v1
- `RULE-ARIS-LC-002` v1

This set is explicitly bounded to the formalization-ready ARIS subset. It is not a claim that every ARIS or every CoMind rule is machine-evaluable.

### `explicit_governed_membership`

Immutable evidence-backed membership for deliberately governed scopes, including scopes that may contain review-required or otherwise non-formalized rules.

## Authority freshness

RCO re-resolves AUTH-001 at composition time using server-controlled `statement_timestamp()`. It does not treat the authority snapshot recorded by an earlier REE result as current permission.

Unresolved current authority yields `unresolved`. Insufficient or inapplicable current authority yields `deny`.

## Reconciliation behavior

Open cases attached to governed members block allow when case type is:

- `conflict`
- `authority`
- `supersession`
- `activation_review`

or when metadata explicitly says `blocks_evaluation=true`.

Other open archaeology/reconciliation records remain diagnostics unless separately classified as blocking.

## Deterministic diagnostic order

Diagnostic position never creates authority. Stable inspection order is:

1. hard constraint;
2. automated gate;
3. review required;
4. informational/other;
5. confirmed specialization depth, most specific first;
6. stable `rule_key`;
7. result UUID tie-break.

## Schema and security

Final repository migration identity:

`db/migrations/20261026_013_rco_001_rule_composition_ordering.sql`

The SQL body is the same implementation originally verified in Test. The repository filename was renumbered from `_011` to `_013` after CHIST-A02 merged and claimed `20261026_011` and `_012` on `main`.

RCO adds:

- `pm_rule_composition_policies`
- `pm_rule_composition_sets`
- `pm_rule_composition_set_members`
- `pm_rule_composition_requests`
- `pm_rule_composition_results`
- `v_rule_composition_history`
- deterministic composition helpers
- immutable-history triggers
- RLS and controlled service-role grants

Verified security boundary:

- RLS enabled on all five tables;
- public/anon/authenticated have no table access;
- service-role can insert composition requests;
- service-role cannot insert/update/delete composition results;
- only the security-definer composer appends final results.

## Live Test verification

The RCO migration applied successfully to private Test before repository renumbering. No production change occurred.

Seed state verified:

- one active `constraint_guarded_composition` policy v1;
- one active `ARIS-LIFECYCLE-READY` set v1;
- exactly two ARIS members;
- exactly two currently formalization-ready ARIS rules;
- declared outcome precedence matches implementation.

Rollback-only behavioral proofs passed:

1. real ARIS Specified request: LC-001 `allow` + LC-002 `not_applicable` => `allow`;
2. omitted required member => `unresolved / evaluation_set_incomplete`;
3. missing required evidence => `insufficient_evidence`;
4. all members not applicable => `not_applicable`;
5. hard deny + allow => `deny / deny_overrides`;
6. review + allow => `require_review`;
7. non-machine-evaluable + allow => `not_machine_evaluable`;
8. proposed conflict remains diagnostic;
9. confirmed conflict => `unresolved / confirmed_rule_conflict`;
10. `specializes` changed diagnostic ordering only;
11. `supports` and `predecessor_of` created no runtime precedence;
12. authority changed after REE was re-resolved at composition and changed final result to deny;
13. a new formalization-ready ARIS rule invalidated the older dynamic set;
14. an open blocking reconciliation case => `unresolved / blocking_reconciliation_case`;
15. `supersedes` did not erase an active predecessor from a governed set;
16. once predecessor lifecycle became `superseded`, the old set became stale instead of silently deleting history.

All synthetic live proof data rolled back.

Live Test Journal event: `768894a1-1fa6-4472-adfd-45496ccd992d`.

## Repository verification

Primary verifier:

`db/verification/20261026_rco_001_rule_composition_ordering_verification.sql`

Additional reconciliation/supersession regression:

`db/verification/20261026_rco_001_reconciliation_supersession_verification.sql`

Runner:

`scripts/test_rco_001_rule_composition_ordering.sh`

The runner reuses the merged REE-001 isolated reconstruction, then applies RCO migration `_013` and both RCO verification suites. This reconstructs the complete PM Ledger → Rulebook → DRULE-002 → DRULE-003 → AUTH-001 → REE-001 → RCO-001 chain from blank PostgreSQL 17.

Exact-head workflow:

`.github/workflows/rco-001-rule-composition-ordering.yml`

## CI defect and recovery record

### Verifier defect 1

First isolated RCO run reached the RCO verification after successfully rebuilding the lower governance stack and applying the RCO migration. The verifier used `max(jsonb)` while reading the single seeded `outcome_precedence` value. PostgreSQL does not define `max(jsonb)`.

Runtime impact: none.

Repair: prove exactly one policy row, then select that JSONB value directly.

Development Journal recovery event: `01ae1c2e-d94a-433b-a486-7e7b128188b0`.

### Verifier defect 2

The replacement verifier used `contract_kind='rco_fixture'` when inserting direct REE result fixtures. REE intentionally constrains `contract_kind` to its governed vocabulary, so PostgreSQL rejected the fixture.

Runtime impact: none.

Repair: replace the invalid verifier with a constraint-valid compact verifier. Direct composition fixtures now use the allowed `evidence_requirements_v1` contract kind and identify themselves only with `diagnostics.fixture=true`.

The corrected fixture insertion was independently proven in private Test and rolled back.

Development Journal recovery event: `71c09a5f-e0f4-4a1f-91ea-1f26590c03de`.

All workflow evidence from failed/superseded heads is non-acceptance evidence.

## Cross-lane migration reconciliation

RCO was initially assigned `20261026_011` when that slot was free. While repository verification was underway, CHIST-A02 merged to `main` and introduced:

- `20261026_011_conversation_history_sessionization.sql`
- `20261026_012_conversation_history_sessionization_deployment_reconciliation.sql`

To avoid ambiguous migration ordering, RCO was renumbered to the next unused slot:

`20261026_013_rco_001_rule_composition_ordering.sql`

The RCO SQL body is unchanged. Runner, workflow, and provenance references were updated consistently before branch reconciliation onto the CHIST-A02 main head.

## Repository hygiene note

Two accidental placeholder/scratch issues were created during connector action selection and immediately closed without project content:

- #238: closed duplicate of #236;
- #239: closed not-planned scratch issue.

Canonical RCO work remains Issue #236 only.

## Open merge gate

At this provenance checkpoint:

- live Test migration: **passed**;
- live behavioral verification: **passed**;
- security/RLS boundary: **passed**;
- two CI verifier-only defects: **identified and repaired**;
- migration-number collision: **identified and reconciled to `_013`**;
- production: **unchanged**;
- corrected exact-head isolated CI: **pending after current-main refresh**;
- full repository matrix: **pending**.

RCO-001 must not merge until the branch is refreshed onto current `main`, the final repository package uses `_013`, and a fresh exact-head dedicated proof plus full workflow matrix are terminal green on an immutable final head.