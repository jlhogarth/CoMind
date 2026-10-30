# GER-003 Competing Hypothesis and Test Orchestrator Provenance

Date: 2026-10-30
Issue: #380
Pull request: #422
Environment: Development/Test
Production activation: false

## Authority

GER-003 is executed under durable L4A authorization `a4d3728d-62a2-4f4f-bb4c-f40486984f76`. Current durable readback confirms `decision = granted`, no expiry, `authority_level = L4A`, `autonomous_merge = true`, `autonomous_recovery = true`, `non_production_autonomy = true`, and `standing = true`.

The canonical CoMind Development Environment Contract v1.1 and RuleBook integration-gateway control plane were refreshed through CIG-001 before consequential external execution. Mandatory human stop boundaries remain unchanged. GER-003 does not cross a Production, destructive, security weakening, paid commitment, legal, public publication, or architecture-departure stop boundary.

## GER-002 recovery and reconciliation

Durable readback found GER-002 PR #394 already merged although its RunBook row still said `review`.

Verified provider state: candidate head `1d639af2ac26329975b20cdfdfee0cbd7fd3366d`; merge commit `951db1e3d86beacaad77ff06544be77c0f818f80`; merged at `2026-10-30T14:14:33Z`; merged by `jlhogarth`; issue #379 closed completed; exact-candidate checks successful; Production false.

GER-002 was reconciled to `done`. Canonical closeout evidence: `comind.cm_evidence` `d94699fb-1767-4d3c-bd6d-5b1761530ddc`; RunBook merge event `361c3482-3a3a-4518-8dd1-e2943f9c6037`.

## GER-003 collision and initial freshness lease

Issue #380 was open. Before claim no GER-003 branch or pull request existed and no GER-related open blocker was returned by `comind_pm.v_open_blockers`.

Initial branch base: `955e5acab148df1affbc42e0b6cbdec1d452430d`.

Branch: `ger-003-competing-hypothesis-test-orchestrator`.

RunBook work item: `674187ce-69c7-4e88-9758-8b4973fcf07b`.

RunBook creation event: `d17237c2-2ea7-449f-a2e7-1f915ff872d6`.

## Reuse-before-reinvention analysis

GER-001 already supplies hypothesis and competing-hypothesis objects, test/test-result/falsifier/contradiction/review/reopening objects, rigor policy, conclusion readiness, transition policy, and reopening policy.

GER-002 already supplies durable cases, typed objects, typed relationships, append-only events, support/contradiction/competition/testing/falsification/review/reopening predicates, constrained runtime access, idempotency, stale-head protection, and deterministic reconstruction.

Live Test counts at GER-003 start were zero for `cm_ilp_hypothesis`, `cm_decision_tree`, `cm_decision_node`, `cm_decision_edge`, `cm_epistemic_case`, `cm_epistemic_object`, `cm_epistemic_relationship`, and `cm_epistemic_event`.

Decision: GER-003 creates no database migration. The GER-002 persistence contract owns the required durable substrate. Legacy ILP and decision-tree structures remain outside GER.

## Implementation decision

Initial implementation commit: `1d1d2fe7165b51443f5f96edd5e42ca9c763ff63`.

GER-003 adds a deterministic hypothesis/test orchestration module. Test selection uses pairwise discriminatory value and lexicographic burden ordering rather than an arbitrary weighted utility formula. Priority is eligibility and authority, discriminatory value, risk, irreversibility, authority sensitivity, duration, then cost. This prevents a cheap non-discriminating test from winning solely because of cost.

The implementation preserves evidence polarity, contradictory material, failed test execution, unsupported and inconclusive results, falsifiers, role-separated review, counterfactual simulation labels, and prior conclusion history after reopening. Private chain-of-thought is not persisted or required.

## CI isolation

The GER-003 integration proof is guarded by `GER_HYPOTHESIS_INTEGRATION=1`. A generic `DATABASE_URL` alone must not activate the integration test. This preserves the GER-002 recovery lesson that unrelated repository workflows can have their own isolated databases.

The dedicated workflow uses PostgreSQL 17, applies the accepted GER-002 migrations, verifies the GER-002 persistence contract, builds the server, runs deterministic GER tests, runs GER-003 unit tests, runs the full server regression suite, and executes the GER-003 integration fixture.

## Freshness reconciliation: AEL-001

While GER-003 implementation was in progress, AEL-001 advanced `main` to `b7c6d69e2954315a1a92e71466d87e2a46fecd2b`. The AEL files were collision-checked against the six GER-003 files and were disjoint. GER-003 was reconciled onto that exact main at `0f5e0847576529ce03dc7212692abab0877781a5` before PR #422 acceptance.

## First exact-head failure and repair

PR #422 candidate `0f5e0847576529ce03dc7212692abab0877781a5` passed the TypeScript build, GER foundation tests, GER-003 deterministic tests, and full server regression suite. The dedicated PostgreSQL integration fixture then failed closed on `comind.cm_epistemic_event` constraint `cm_epistemic_event_target_shape`.

Cause: the fixture supplied `targetObjectId` to case-level `case_concluded` and `case_reopened` events. The accepted GER-002 persistence contract requires case-level events to have both target columns null. Object state and case state are separate concerns.

Repair commit: `29db4d55d41b18e7fe8d191b92c34f9cd2dc0078`. The fixture removed object targets from those two case-level events. No GER-002 schema or Production state changed. This was a fixture-contract correction, not a persistence-policy weakening.

The repaired `29db4d55d41b18e7fe8d191b92c34f9cd2dc0078` candidate completed 23 of 23 exact-head checks successfully, including the dedicated GER-003 PostgreSQL 17 proof.

## Freshness reconciliation: CFR-002R

Before merge, CFR-002R advanced `main` to `07e1f02d32c241fe30b50abeedb674aea7c1afbe`. Its six changed files were collision-checked and disjoint from GER-003. The exact main commit was merged into the GER branch at `4a276c740109c9139f37effcf824fd0805207186`.

That reconciled candidate again completed 23 of 23 exact-head checks successfully, including the dedicated GER-003 proof and the generic repository CI matrix.

## Freshness reconciliation: SCOUT-002

Before the next merge lease, SCOUT-002 advanced `main` to `8ef4583c0cc125eb22376b69030aaa42911a4f8a`. Its twelve changed files were collision-checked and disjoint from the six GER-003 files. The exact main commit was merged into the GER branch at `0846a83a232df10b653fa727ffe9f551d16370ea`.

GitHub did not schedule check runs for that merge-only branch update after repeated polling. Existing successful evidence was not reused as if it covered the new head. This provenance synchronization commit intentionally changes only this provenance file so GitHub receives a fresh PR synchronization event and a new exact-head acceptance matrix can be required for the resulting candidate.

## Current acceptance rule

The final candidate is acceptable only when all of the following are simultaneously true:

- exact-head check matrix terminal success;
- dedicated GER-003 PostgreSQL proof success;
- current `main` is an ancestor of the candidate and `behind_by = 0`;
- PR #422 is open, mergeable, not draft, with no unresolved review objection;
- durable L4A authorization remains granted with autonomous non-Production merge authority;
- no open GER blocker exists;
- Production remains false.

If `main` advances again before merge, freshness wins over prior green evidence and the branch must be reconciled again.

## Explicit non-goals

GER-003 does not activate Production, create a second hypothesis store, migrate legacy ILP or decision-tree tables, expand Agent or Virtual Employee authority, change Digital Twin identity/promotion, create a paid provider commitment, or weaken RuleBook, evidence, or L4A controls.
