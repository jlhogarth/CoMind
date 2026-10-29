# TK-012 Governed Branch-and-Merge Continuity

Status: implementation candidate  
Issue: #309  
Capability: ThreadKeeper  
Production activation: false

## Purpose

TK-012 lets CoMind explore competing future states without overwriting the accepted ThreadKeeper continuity head.

The model is intentionally Git-like only at the lineage level. It does not store Git objects, execute experiments, run simulations, dispatch agents, or make experimental state canonical.

## Governing invariant

> Experimental continuity may branch freely under bounded governance, but only separately authorized canonical ThreadKeeper checkpoint acceptance may change the accepted continuity head.

TK-012 therefore produces candidate lineage and review material only.

## Reuse

TK-012 adapts existing CoMind primitives rather than creating another runtime:

- TK-008 `ContinuityCapsule` supplies the governed accepted fork base, continuity digest, scope, sensitivity, authority boundary, and integrity checks.
- Existing ThreadKeeper checkpoint semantics remain the canonical accepted-state authority.
- TK-011 supplies the pattern that a consequential state change must end in independent review, never automatic promotion.
- Canonical Development Evidence remains the development evidence authority.

No new database, graph, queue, scheduler, model call, or provider is required.

## Experimental branch

An `ExperimentalContinuityBranch` binds:

- a branch ID;
- semantic continuity scope;
- accepted base checkpoint;
- base continuity and capsule digests;
- branch purpose references;
- evidence references;
- authority and policy references;
- creation time.

Every branch is explicitly:

- `canonicalStatus=NON_CANONICAL`;
- `authorityMode=requires_independent_validation`;
- `automaticCanonicalPromotion=false`.

A branch can only be forked from a valid, unexpired Continuity Capsule at the fork timestamp.

## Branch-local candidate checkpoints

Branch checkpoints form an ordered, append-only candidate lineage.

The first branch checkpoint must name the canonical base checkpoint as parent. Every later checkpoint must name the current branch-local head. Cross-branch parents, skipped parents, duplicate IDs, time regression, or changed branch/scope/base bindings fail closed.

Branch-local checkpoints are never accepted ThreadKeeper checkpoints. They are explicitly non-canonical candidates and have `automaticAcceptance=false`.

## Branch outcomes

A branch outcome binds to its branch and current candidate head and records structured references only:

- `COMPLETED`, `INCONCLUSIVE`, or `BLOCKED`;
- outcome references;
- evidence references;
- explicit unresolved-conflict references;
- evaluation time;
- branch and head digests.

ThreadKeeper does not determine whether the underlying experiment was scientifically, commercially, or epistemically correct. It preserves the governed continuity result supplied by the owning system.

## Comparison

A comparison is allowed only among branches that share the exact same:

- semantic continuity scope;
- canonical base checkpoint;
- base continuity digest;
- base capsule digest.

Comparison is deterministic and structured. It does not rank branches by model plausibility or prose similarity.

Unresolved conflicts are retained explicitly.

## Merge proposal

A merge proposal must account for every compared branch exactly once:

- selected, or
- rejected with explicit rejection-reason references.

Only `COMPLETED` outcomes may be selected. `BLOCKED` or `INCONCLUSIVE` branches may remain preserved as rejected alternatives.

The proposal references:

- selected branch and outcome identities;
- rejected branch outcomes and reasons;
- candidate successor-state references;
- merge evidence;
- unresolved conflicts;
- the exact comparison digest.

It never mutates the canonical head and carries:

- `authorityMode=requires_independent_authorization`;
- `automaticCanonicalAcceptance=false`;
- `canonicalHeadMutation=false`.

## Conflict rule

A proposal may preserve selected branches that still have explicit unresolved conflicts, but such a proposal is classified `BLOCKED_UNRESOLVED_CONFLICT` and cannot create a merge review request.

This permits lossless preservation of an unresolved candidate without pretending it is review-ready.

## Independent review request

A conflict-free proposal may produce `REQUEST_INDEPENDENT_MERGE_REVIEW`.

The review request still has no acceptance authority. An independently authorized future caller must use the existing governed ThreadKeeper checkpoint acceptance path if it decides to establish a successor canonical checkpoint.

TK-012 deliberately contains no function named or equivalent to `accept_merge`, `promote_branch`, or `set_canonical_head`.

## Security and authority

- Receipt of a branch or merge object grants no authority.
- Digests provide deterministic integrity, not identity/authentication by themselves.
- Authority remains external and evidence-backed.
- References are bounded and secret-scanned by the shared continuity fingerprint primitive.
- Branches do not inherit execution authority from the actor that created the base capsule.
- No source payload, transcript, secret, credential, or large experiment artifact is copied into ThreadKeeper branch objects.

## Acceptance

TK-012 repository acceptance requires:

1. valid accepted capsules can fork multiple independent non-canonical branches;
2. expired/tampered capsules fail closed;
3. branch candidate lineage cannot cross, skip, or rewrite parents;
4. compared branches must share one governed base;
5. branch outcomes preserve explicit evidence and conflict state;
6. every compared branch is selected or explicitly rejected in a merge proposal;
7. non-completed outcomes cannot be selected;
8. unresolved conflicts block merge review;
9. rejected branches and reasons remain historically addressable;
10. final output is independent review only, never canonical acceptance;
11. digest tampering fails verification;
12. TK-008 through TK-011 and broad non-database regressions remain green;
13. no schema, RLS, grant, paid-provider, or Production change occurs.

## Future integration

A later integration lane may persist branch state or expose it through the Operator Console if real usage proves durable storage is needed. That decision should reuse existing ThreadKeeper/CDE/EDG substrates and must not be inferred from this deterministic core implementation.
