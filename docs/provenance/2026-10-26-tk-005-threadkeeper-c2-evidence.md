# TK-005 ThreadKeeper C2 Evidence Completion

## Status

**Historical acceptance state:** TK-005 C2 Implemented accepted and merged on 2026-10-27.

**Current ThreadKeeper state:** C3 Integrated through the later TK-006 governed promotion. This document remains the canonical historical record of the C1 Contracted to C2 Implemented transition and must not be read as the current maturity projection.

- Issue: #248
- Pull request: #249
- Governing contract: TK-001
- Governing design: TK-002
- C2 promotion journal: `JRN-20261027-0004`
- C2 closure journal: `JRN-20261027-0006`
- TK-005 merge commit: `3eecf7c199e520db5574b7c7525598ba6002e7ea`
- Production activation: **not performed**
- Automatic maturity promotion: **forbidden**

## Implementation binding

The bounded C2 ThreadKeeper implementation was frozen at exact code head:

`3eb07decd173734d9c2c899635307b90c6f5f098`

On that implementation head, TK-004 ThreadKeeper Persistence run `40436467686` passed the isolated PostgreSQL 17 proof with all 41 targeted tests passing. The proof covered deterministic core behavior, service and boundary behavior, durable repository behavior, additional C2 PostgreSQL assertions, failure injection, authority boundaries, observability behavior, and false-positive resolution preservation.

EVID-001 now binds this run to its immutable external facts through `config/governed-evidence-bindings.v1.json`: workflow `.github/workflows/threadkeeper-persistence.yml`, exact head `3eb07decd173734d9c2c899635307b90c6f5f098`, pull request event, and successful conclusion.

## Evidence matrix

The machine-readable C2 matrix contains 66 governed requirements:

- 16 formal C2 promotion requirements
- 20 unit requirements
- 12 isolated PostgreSQL requirements
- 6 boundary-adapter requirements
- 12 failure-injection requirements

Final governed census:

- **65 proven**
- **0 partial**
- **0 missing**
- **1 not applicable**

The single not-applicable item is logical checkpoint expiry. TK-002 explicitly defers expiry unless a scope policy requires it. C2 did not introduce a global expiry policy. Stale-head protection was independently proven.

## Freshness reconciliation

TK-005 encountered two material main-branch advances before merge and reconciled both rather than overwriting concurrent work.

### First reconciliation

`main` advanced from the original TK-005 base `b43ad4cabc3d776fe0fb7e54560ddf7e7c5e0e35` through PR #252, which added competitive continuity handoff proofs and touched the shared ThreadKeeper persistence harness.

A two-parent reconciliation preserved both bodies of work. Reconciliation commit:

`881923ed354b919d62e9b4802fadb908bbeaaf2a`

An intermediate exact-head sweep on `88fe50dc4c176e8cb753479ba740d680742d71f0` passed, including MCTRL run `40466464418`. That run is retained as historical intermediate evidence, not as the final freshness proof.

### Second and final reconciliation

Before merge, `main` advanced again to `3f80a07b58f992df12312c1a284584e5fe98cb22` through PR #254. The incoming competitive execution proof files were additive and non-overlapping with the TK-005 implementation and evidence files. TK-005 used a second two-parent merge and produced final PR head:

`f73381f2d6e76fdb5d2f7d52183969d604c88a7b`

Final exact-head acceptance evidence included:

- TK-005 ThreadKeeper C2 Evidence Gate `40467605066`: PASS
- TK-004 ThreadKeeper Persistence `40467604946`: PASS
- MCTRL-001 Maintenance Control `40467605004`: PASS
- CI `40467604998`: PASS
- Lane Health Sentinel Observe `40467604902`: PASS
- No Placeholder Policy `40467604889`: PASS
- CoMind Repository Configuration `40467604942`: PASS
- other applicable returned repository regression gates: PASS

PR #249 then merged as `3eecf7c199e520db5574b7c7525598ba6002e7ea`.

Post-merge MCTRL run `40467885710` executed on that exact merge SHA and completed successfully. Its bounded live Test audit reported **18 PASS, 0 WARNING, 0 FAIL** at the time of TK-005 acceptance.

## EVID-001 evidence-reference hardening

The later acceptance review identified a governance weakness in the original machine-readable evidence pattern. The matrix could require a positive GitHub run ID or non-empty CDE key without independently proving that the external reference existed, succeeded, matched the intended workflow and head SHA, or resolved to a verified canonical journal.

This did not invalidate the C2 implementation or promotion because the final-head and post-merge evidence existed and was independently inspectable. It did mean the matrix was not sufficiently self-verifying.

Issue #261, EVID-001, hardens that pattern without changing ThreadKeeper runtime behavior or historical maturity:

- immutable GitHub run facts are maintained in `config/governed-evidence-bindings.v1.json`;
- referenced runs are verified live through the GitHub Actions API using read-only CI authority;
- final acceptance bindings explicitly include TK-005 `40467605066`, final-head MCTRL `40467605004`, and post-merge MCTRL `40467885710`;
- implementation evidence is bound to exact implementation commit `3eb07decd173734d9c2c899635307b90c6f5f098`;
- the C2 promotion journal `JRN-20261027-0004` is checked by MCTRL against canonical Development Evidence with required `verification_state=verified`;
- fabricated positive run IDs and fabricated non-empty CDE keys fail closed.

The older C2-15 matrix reference to `40466464418` remains historical evidence. It is no longer allowed to stand alone as the freshness proof because the governed binding catalog separately identifies and verifies the final acceptance sweep.

## Projection reconciliation at C2 acceptance

The C2 claim changed maturity and planning projections but did not change graph topology.

- **CCI-001:** advanced to v0.6; ThreadKeeper was Current at C2 Implemented; production activation remained separate.
- **MLC-001:** advanced to v0.3; ThreadKeeper remained a Capability, module lifecycle remained not applicable, capability maturity became C2 Implemented.
- **DPE-001:** advanced to v0.4 and recomputed ThreadKeeper to 80.1 / P0 under the then-current formula.
- **EDG-001:** remained v0.2 because TK-005 did not add, retire, or change documentation graph relationships.

These are historical C2 projections. Later governed work, including TK-006 and subsequent DPE reconciliation, superseded their current values without rewriting this acceptance history.

## Canonical Development Evidence

TK-005 evidence lineage includes:

- `JRN-20261026-0015`: TK-005 evidence inventory created.
- `JRN-20261027-0003`: technical evidence reconciled while final promotion controls remained gated.
- `JRN-20261027-0004`: explicit verified transition from C1 Contracted to C2 Implemented.
- `JRN-20261027-0006`: TK-005 closure record after merge acceptance.

At C2 acceptance, canonical Test state recorded:

- `concept:threadkeeper.capability_maturity = C2 Implemented`
- `implementation_proven = true`
- `c2_gate_complete = true`
- `implementation_key = TK-005`
- production activation remained false

The current canonical state later advanced to C3 Integrated through TK-006. Historical C2 evidence remains immutable and addressable.

## Boundary proof

C2 did not authorize ThreadKeeper to absorb adjacent systems:

- Conversation History retained raw conversation-event ownership.
- Foundry retained execution, lease, fencing, retry, and outcome authority.
- Agent Communication retained transport, routing, and addressing ownership.
- Helper Matrix recommendations did not execute helpers.
- SEAL recommendations did not execute revisions.
- Memory Graph storage remained outside ThreadKeeper.
- Digital Twin identity remained outside ThreadKeeper.
- EIK retained epistemic and truth authority.
- ACP remained a distinct continuity and recovery substrate.

## Security note discovered during acceptance review

A Supabase Test security-advisor read surfaced pre-existing RLS-disabled public-schema findings outside the bounded ThreadKeeper tables. TK-005 did not silently modify those unrelated schemas or policies. ThreadKeeper's own persistence proof verified its intended private RLS and privilege posture. Broader Test-schema findings remained a separate governed security concern.

## Final acceptance rule and result

The TK-005 rule required the final exact PR head to be green for TK-005, TK-004, MCTRL, CI, and applicable repository checks before merge. That condition was satisfied at `f73381f2d6e76fdb5d2f7d52183969d604c88a7b`, followed by successful merge and post-merge MCTRL verification.

**Historical C1 to C2 acceptance result: PASS.**

EVID-001 strengthens how that result is machine-verified. It does not retroactively create the evidence, alter ThreadKeeper runtime behavior, or change the current C3 Integrated maturity.
