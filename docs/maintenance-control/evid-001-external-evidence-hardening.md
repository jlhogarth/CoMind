# EVID-001 Governed External Evidence Hardening

## Purpose

Issue #261 hardens the evidence-matrix pattern used by TK-005 and TK-006. A syntactically valid external reference is no longer sufficient to establish a governed proof claim.

## Control changes

- GitHub run evidence resolves through `config/governed-evidence-bindings.v1.json`.
- Each governed run binding records workflow path, exact head SHA, event type, required successful conclusion, and whether it binds the frozen implementation commit.
- CI verifies referenced and final-acceptance GitHub runs live with read-only Actions authority.
- CI verifies that the frozen implementation commit exists in repository history and is an ancestor of the checked-out head.
- CDE keys must have repository evidence and a governed binding to an MCTRL `journal_verified` control.
- MCTRL directly verifies TK-005 and TK-006 canonical journal records in Test Canonical Development Evidence.
- Final acceptance run sets are independent of intermediate matrix references, preventing an older green run from silently satisfying a later freshness requirement.

## Verified canonical journals

During EVID-001 implementation, read-only Test queries confirmed these records are present with `verification_state=verified`:

- `JRN-20261027-0004`
- `JRN-20261027-0007`
- `JRN-20261027-0008`
- `JRN-20261027-0009`

## Fail-closed cases

Automated tests cover:

- fabricated positive run ID;
- fabricated non-empty CDE key;
- bound run unavailable from GitHub;
- wrong head SHA;
- failed run;
- wrong workflow;
- wrong event;
- missing GitHub read token.

## Authority and scope

- Evidence and maintenance governance only.
- No ThreadKeeper runtime behavior change.
- No schema, RLS, grant, or privilege mutation.
- No production activation.
- No maturity promotion or demotion.
- Current ThreadKeeper maturity remains C3 Integrated unless a hardened verifier finds genuine contradictory evidence.

## Acceptance

EVID-001 is complete only when the exact PR head passes TK-005, TK-006, MCTRL, CI, and applicable repository regression checks, and the post-merge MCTRL live Test audit confirms the new journal controls against canonical evidence.
