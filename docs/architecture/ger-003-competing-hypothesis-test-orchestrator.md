# GER-003: Competing Hypothesis and Test Orchestrator

Status: Test implementation candidate
Issue: #380
Parent: GER-002
Production activation: false

## Purpose

GER-003 turns the GER-001 competing-hypothesis requirements into deterministic orchestration while reusing the GER-002 persistence contract. It prevents the first plausible explanation from silently becoming truth by making alternative explanations, evidence polarity, falsifiers, predicted observations, discriminating tests, negative results, review separation, uncertainty, conclusion readiness, and reopening explicit and inspectable.

## Persistence decision

GER-003 creates no new database table. GER-002 already owns the canonical runtime envelope: `cm_epistemic_case`, `cm_epistemic_object`, `cm_epistemic_relationship`, `cm_epistemic_event`, and their state projections.

That envelope already supports hypothesis, competing-hypothesis, test, test-result, falsifier, contradiction, review, and reopening objects plus support, contradiction, competition, testing, falsification, review, and reopening relationships.

The legacy `cm_ilp_hypothesis`, `cm_decision_tree`, `cm_decision_node`, and `cm_decision_edge` tables remain outside GER. Test readback at milestone start showed zero rows in those legacy tables and zero rows in the GER runtime tables. There is no migration justification and no responsibility gap requiring a second hypothesis store.

## Orchestration contract

`server/src/epistemic/hypothesis-orchestrator.ts` implements a deterministic policy layer over the existing GER object graph. It does not generate or persist private reasoning traces.

A hypothesis carries stable identity, proposer, current state, plausibility, examination status, source references, assumptions, falsifiers, testability, and optional confidence. Confidence remains an assessment, not evidence.

Evidence polarity is explicit: `supports`, `contradicts`, `weakens`, or `neutral`. Supporting and disconfirming evidence remain separately reconstructable.

## Discriminating tests

Each test candidate declares predicted outcome keys for the currently plausible hypotheses. The orchestrator calculates discriminatory value as an auditable pairwise separation ratio:

`discriminating hypothesis pairs / total plausible hypothesis pairs`

A test is ineligible when it is infeasible, required authority is missing, required human approval is missing, or predictions needed for a multi-hypothesis discrimination calculation are absent.

Eligible tests are ranked lexicographically:

1. higher discriminatory value;
2. lower risk;
3. lower irreversibility;
4. lower authority sensitivity;
5. lower duration;
6. lower cost;
7. stable test reference.

Cost is deliberately last among the burden dimensions. A cheap non-discriminating test cannot outrank a more discriminating test merely because it is cheap. This avoids a fabricated decimal utility score whose weights could imply false precision.

## Test-result semantics

Test results retain one of `supports`, `contradicts`, `falsifies`, `inconclusive`, `failed`, or `unsupported`.

A failed execution is durable operational evidence, but it is not treated as an epistemic test result that satisfies conclusion readiness. A falsifying result forces the selected hypothesis toward rejection rather than allowing confidence to override the test. Negative, failed, unsupported, and inconclusive results remain visible.

## Bias and closure controls

GER-003 raises a confirmation-bias risk when the selected hypothesis has positive material but no represented disconfirming evidence or disconfirming test result. This is a deterministic incompleteness control over the recorded evidence set, not a psychological diagnosis.

GER-003 raises a premature-closure risk when another plausible hypothesis remains insufficiently examined. A plausible testable competitor requires a completed non-failed epistemic result before closure. A non-testable competitor requires explicit examination plus a reason explaining why useful testing is unavailable.

GER-003 composes GER-001 `assessConclusionReadiness` rather than replacing it. Additional rules require completed test evidence for plausible testable hypotheses, exclude failed executions from epistemic closure evidence, force reject on falsification, require R2 bias controls, and require genuinely role-separated review at R3 or higher. The reviewer cannot satisfy role separation when it is the same actor as the proposer.

## Counterfactual boundary

Counterfactual artifacts must use `mode = simulation` and `evidenceStatus = simulated`. A counterfactual cannot claim observed status. Simulated output can inform testing or challenge, but it cannot silently enter the evidence graph as observation.

## Reopening

GER-003 composes GER-001 reopening policy. Reopening requires a prior conclusion or closure, a complete GER reopening trigger, and at least moderate materiality. Reopening appends history and never erases the prior conclusion.

## Authority separation

Test ranking never grants authority. A highly discriminating test is still ineligible when required authority or human approval is absent.

`knowledge strength != decision authority != execution capability`

## Persistence mapping

Objects use existing GER types: `hypothesis`, `competing_hypothesis`, `evidence`, `contradiction`, `test`, `test_result`, `falsifier`, `challenge`, `review`, `conclusion`, and `reopening_trigger`.

Relationships use existing predicates: `competes_with`, `supports`, `contradicts`, `weakens`, `tests`, `falsifies`, `reviews`, and `reopens`.

No table-per-noun expansion is required.

## Test strategy

Deterministic tests prove cheap non-discriminating tests do not win on cost alone, missing authority makes tests ineligible, untested plausible hypotheses cannot close, failed tests remain distinct from epistemic results, falsification forces rejection, bias controls surface incomplete challenge, R3 review separation is genuine, counterfactual output remains simulation, and material new evidence can reopen.

The isolated PostgreSQL 17 proof persists two competing hypotheses, explicit support and contradiction, a selected discriminating test, a successful result, a failed result retained for audit, state transitions, conclusion, and evidence-backed reopening. It verifies that contradiction, failed tests, conclusion, and reopening remain reconstructable.

## Security and privacy

GER-003 inherits GER-002 payload filtering, constrained runtime role, RLS, immutable identities, append-only chronology, idempotency, stale-head rejection, and the no-private-chain-of-thought boundary. No new credential, secret, or raw conversation storage is introduced.

## Production boundary

GER-003 is Development/Test work only. It does not activate Production, expand Agent or Virtual Employee authority, modify Digital Twin promotion, introduce a paid provider call, migrate legacy hypothesis tables, create a new canonical evidence store, or weaken RuleBook or L4A gates.
