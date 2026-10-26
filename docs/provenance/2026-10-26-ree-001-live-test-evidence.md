# REE-001 Live Test Evidence

**Date:** 2026-10-26  
**Issue:** #211  
**Branch:** `ree-001-rule-evaluation-engine`  
**Environment:** CoMind private Test  
**Production:** Unchanged

## Test deployment

Applied successfully to private Test:

- migration `ree_001_rule_evaluation_engine`
- repository migration: `db/migrations/20261026_001_ree_001_rule_evaluation_engine.sql`

Before migration execution, Test was checked for REE-001 residue. `pm_rule_evaluation_requests`, `pm_rule_evaluation_results`, and `ree_evaluate_request_rule(uuid,uuid,integer)` were absent.

## Formalization-readiness classification

After migration, the live 157-rule Rulebook classified as:

| Readiness | Reason | Count |
| --- | --- | ---: |
| ready | `supported_contract` | 2 |
| not_ready | `empty_formal_rule` | 77 |
| not_ready | `rule_not_machine_checkable` | 22 |
| not_ready | `rule_not_active` | 56 |

The only two ready rules are:

- `RULE-ARIS-LC-001`
- `RULE-ARIS-LC-002`

Both classify as `evidence_requirements_v1`.

This proves that REE-001 does not equate `machine_checkable=true` with executable policy. 155 of 157 normalized rules remain non-executable under the current bounded evaluator.

## Live behavioral verification

A rollback-only Test transaction successfully verified:

1. canonical `RULE-ARIS-LC-001` with approved specification evidence returns `allow`;
2. re-evaluating the same request/rule/version reuses the exact immutable result;
3. canonical ARIS gate without required evidence returns `insufficient_evidence`;
4. a hard-constraint evidence requirement without required evidence returns `deny`;
5. a review-required rule routes to `require_review` rather than manufacturing an automated answer;
6. an unsupported formal expression returns `not_machine_evaluable`;
7. a request whose domain does not match the canonical ARIS rule returns `not_applicable / rule_domain_mismatch` when authority itself permits the domain;
8. selector-bearing AUTH-001 authority remains `unresolved`;
9. a delegated C2 agent requesting a production action is denied by the existing production C4/human requirement;
10. direct mutation of an evaluation result is rejected by append-only history enforcement.

All synthetic Test rows rolled back.

## Access-control verification

Live Test grants confirm:

`pm_rule_evaluation_requests`
- `service_role`: `SELECT`, `INSERT`

`pm_rule_evaluation_results`
- `service_role`: `SELECT` only

The service role cannot directly insert, update, or delete evaluation results. Decision rows are appended through the controlled evaluator function.

Both REE tables have Row Level Security enabled. Public, anonymous, and authenticated roles have no direct REE table access.

## Defects and control interventions

### Formal contract fail-open edge found before execution

Static review found that a formal-rule object missing the `requires` member could fall through SQL three-valued logic in the first draft validator.

Repair applied before Test deployment:

- `requires` is explicitly mandatory;
- supported evidence contracts must use only the bounded allowed keys;
- every requirement must contain a positive integer `minimum_count`;
- executable readiness also requires the canonical rule version's `validation.result = "allow_only_if_requirement_satisfied"` marker;
- the request domain must match the rule's canonical domain.

Because the defect was caught before migration execution, Test history required no repair migration.

### Development Journal source vocabulary enforcement

The first attempt to record external research used `source_system='web'`. The Development Journal rejected the write because `web` is outside the controlled `source_system` vocabulary.

The constraint was not weakened. The research was re-recorded using the accepted canonical classification `manual`, with the external source URLs preserved in evidence.

Research event: `9105d090-7f3e-47f8-a6e0-4e0f741b6874`.

## External policy-expression decision

REE-001 reviewed Cedar, Open Policy Agent, Common Expression Language (CEL), OpenFGA conditions, and JSON Logic.

Decision for v1:

- no external policy server/runtime;
- implement only CoMind's existing bounded evidence-requirement contract;
- PostgreSQL remains canonical for rule/version/authority/evaluation evidence;
- CEL remains the leading candidate for a later general expression adapter when an actual rule requires richer attribute/context expressions.

This avoids adding a policy language/runtime before current CoMind contracts justify it.

## Repository proof package

At this checkpoint the branch contains:

- `db/migrations/20261026_001_ree_001_rule_evaluation_engine.sql`
- `db/verification/20261026_ree_001_rule_evaluation_engine_verification.sql`
- `db/verification/20261026_ree_001_domain_applicability_verification.sql`
- `scripts/test_ree_001_rule_evaluation_engine.sh`
- `.github/workflows/ree-001-rule-evaluation-engine.yml`
- architecture and live-evidence provenance documents

The isolated runner reconstructs the exact dependency chain from PM Ledger through Rulebook, DRULE-002, DRULE-003, AUTH-001, and REE-001 using explicit migration filenames.

## Current merge gate

- live Test migration: **passed**
- live readiness classification: **passed**
- live rollback behavioral verification: **passed**
- production: **unchanged**
- isolated GitHub exact-head CI: **pending PR execution**
- full repository workflow matrix: **pending PR execution**

REE-001 must not merge until exact-head CI and the complete PR workflow matrix are terminal green and current `main` has been rechecked for drift.
