# REE-001 — Governed Rule Evaluation Engine

**Date:** 2026-10-26  
**Issue:** #211  
**Step:** 4 of 7 in the founder-authorized Rulebook evolution sequence  
**Governance tier:** T1 reversible development  
**Base:** `daca0ae17aef9c7cb2ec514dc1fc1547fd5ea16d`  
**Production:** Out of scope / unchanged

## Purpose

REE-001 turns activated Rulebook contracts into deterministic, auditable evaluations without treating prose, model confidence, source status, or incomplete formalization as executable policy.

The engine must preserve the chain:

`evidence -> active exact rule/version -> formalization readiness -> authority resolution -> rule evaluation -> outcome -> immutable evaluation evidence`

It must also preserve the distinction:

`machine_checkable != presently machine_evaluable`

## Verified starting inventory

Live private Test inventory at the start of REE-001:

- 157 normalized rules total;
- 101 active rules;
- 79 active rules marked `machine_checkable`;
- 77 active machine-checkable rules have `formal_rule = {}`;
- 2 active machine-checkable rules have non-empty formal contracts;
- 22 active rules are not machine-checkable;
- active enforcement modes: 15 `automated_gate`, 39 `hard_constraint`, 47 `review_required`.

Development Journal inventory event: `05e3ee7f-ca16-4843-8c39-12f2289f044b`.

The two non-empty active contracts are:

- `RULE-ARIS-LC-001`: module lifecycle `Specified` requires at least one `approved_specification` with `approval_status=approved`;
- `RULE-ARIS-LC-002`: module lifecycle `Prototyped` requires at least one `prototype` with `evidence_status=verified`.

The canonical `comind_pm` schema does not currently contain a module/lifecycle registry. `pm_verifications` is a generic evidence register, while `pm_work_items` is generic work tracking. REE-001 will not overload either as a module identity model.

## External implementation review

The adaptation-over-reinvention review considered:

- Cedar authorization model and default-deny diagnostics: https://docs.cedarpolicy.com/auth/authorization.html
- Cedar principal/action/resource/context separation: https://docs.cedarpolicy.com/
- Open Policy Agent (OPA) policy-decision/enforcement separation: https://www.openpolicyagent.org/docs
- Common Expression Language (CEL): https://cel.dev/
- CEL specification: https://github.com/cel-expr/cel-spec
- OpenFGA relationship and conditional models: https://openfga.dev/
- OpenFGA dynamic CEL conditions: https://openfga.dev/blog/dynamic-abac-expressions-announcement
- JSON Logic operation model: https://jsonlogic.com/operations.html

Development Journal research event: `9105d090-7f3e-47f8-a6e0-4e0f741b6874`.

### Findings

**Cedar** has excellent authorization semantics, explicit request structure, default-deny behavior, and diagnostic reasoning. Its primary decision model is authorization `Allow`/`Deny`, narrower than CoMind's full rule-evaluation outcome space.

**OPA/Rego** is mature and general purpose. It would add a policy runtime and language plus operational/dependency surface before CoMind has enough executable contracts to justify that cost.

**CEL** is the strongest candidate for future general expressions. It is designed to be embedded, is non-Turing-complete, mutation-free, portable, type-checkable, and safe for bounded expression evaluation. Current CoMind runtime is Node/TypeScript/PostgreSQL and has no policy-runtime dependency. Adding a cross-runtime CEL service solely for the two existing evidence gates would increase complexity without present benefit.

**OpenFGA** validates the separation already established by AUTH-001: relationship facts belong in the authority graph; runtime attribute/condition evaluation is a separate concern. Its 2026 experimental dynamic conditions use CEL.

**JSON Logic** offers a compact JSON representation but provides weaker type/formalization tooling than CEL and is not selected as the primary future substrate.

## Decision: REE-001 v1 contract

REE-001 v1 will implement only the bounded formal contract shape that already exists in CoMind:

```json
{
  "subject": "module.lifecycle",
  "target_status": "Specified",
  "requires": [
    {
      "evidence_type": "approved_specification",
      "minimum_count": 1,
      "approval_status": "approved"
    }
  ]
}
```

Supported requirement keys are:

- `evidence_type` — required non-empty string;
- `minimum_count` — required positive integer;
- `approval_status` — optional non-empty string;
- `evidence_status` — optional non-empty string.

Unknown keys, malformed types, empty contracts, unsupported shapes, inactive rules, and non-current versions are not executable.

This is deliberately a **bounded evidence-requirement contract**, not a new general programming language.

## Runtime placement

For v1:

- PostgreSQL remains canonical for rule/version, authority, and evaluation evidence;
- REE validation and the bounded evidence-requirement evaluator live alongside those canonical facts;
- the existing AUTH-001 `resolve_authority_request(...)` function remains the authority resolver;
- no new policy server is introduced;
- no application enforcement hook is introduced in the first migration.

The evaluator produces decisions; downstream enforcement integration remains a separate, evidence-backed step.

## Evaluation request contract

A request records the exact inputs needed to reproduce a decision:

- project;
- durable request key;
- claimed authority;
- governance capability;
- operation/action;
- resource class;
- environment;
- domain;
- subject type and subject reference;
- structured request facts;
- structured evidence claims;
- contextual facts;
- requester identity;
- metadata and timestamp.

Evidence claims are explicit input facts, not inferred from prose. Each claim includes at minimum `evidence_type` and `evidence_ref`, with optional approval/evidence status.

## Evaluation result contract

Each immutable per-rule result records:

- exact request;
- exact rule ID/version;
- evaluator version;
- formalization readiness;
- enforcement mode;
- authority result;
- outcome;
- reason code;
- deterministic diagnostics;
- evidence references;
- evaluation timestamp.

Initial outcomes:

- `allow`
- `deny`
- `require_review`
- `not_applicable`
- `insufficient_evidence`
- `unresolved`
- `not_machine_evaluable`

Ambiguity never collapses into `allow`.

## Enforcement-mode semantics in v1

- `automated_gate`: satisfied supported requirements -> `allow`; missing required evidence -> `insufficient_evidence`.
- `hard_constraint`: satisfied supported requirements -> `allow`; missing required evidence -> `deny`.
- `review_required`: after authority screening, return `require_review`; REE-001 does not manufacture an automated decision.
- unsupported/incomplete machine contracts -> `not_machine_evaluable`, except a `review_required` rule still routes to human review.

Any non-sufficient AUTH-001 result blocks automated permission. AUTH `unresolved` remains REE `unresolved`; AUTH `insufficient` or `inapplicable` becomes REE `deny` for the requested operation.

## Security and authority boundary

REE-001 is a T1 development capability.

- private `comind_pm` schema;
- RLS enabled;
- service-role-only direct table/function access;
- append-only evaluation requests/results;
- no production deployment;
- no C4 authority change;
- no automatic rule activation;
- no automatic formalization;
- no LLM interpretation used as executable policy.

## Failure and recovery

The migration is additive and transactional. Verification must prove:

- formalization classification;
- malformed/empty rule rejection;
- exact-current-version requirement;
- authority integration;
- positive evidence-gate evaluation;
- missing-evidence behavior by enforcement mode;
- human-review routing;
- unresolved authority propagation;
- production C4 refusal;
- request/result immutability;
- isolated replay.

If verification fails, REE-001 remains unmerged and no production path is affected.

## Future expression substrate

CEL remains the preferred candidate for a later bounded expression adapter when CoMind has a real rule requiring general attribute/context expressions. That decision must be justified by an actual contract and implementation need, not by architectural fashion.

REE-001 v1 therefore preserves an extension point without prematurely adding the runtime dependency.
