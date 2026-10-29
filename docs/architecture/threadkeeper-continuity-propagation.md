# TK-008 - Governed Continuity Propagation

Status: Implementation candidate  
Capability: ThreadKeeper  
Issue: #305  
Production activation: false  
Schema change: none in this slice

## 1. Purpose

TK-008 extends ThreadKeeper's accepted C4 continuity state into a portable, fail-closed propagation contract for work that crosses agents, models, providers, applications, processes, or time boundaries.

The capability solves three related problems:

1. **Portable continuity:** a consumer needs compact, provider-neutral continuity state without receiving a duplicate source-of-truth payload.
2. **Stale-action protection:** a long-running consumer must prove immediately before consequential work that the accepted continuity head has not changed since its context was issued.
3. **Fidelity protection:** a handoff, summarization, or compression step must not silently drop critical intent, decisions, obligations, prohibitions, provenance, uncertainty, sensitivity, or authority constraints.

TK-008 does not grant execution authority and does not replace existing ThreadKeeper checkpoints, Conversation History, Memory Graph, Agent Communication, Foundry, SEAL, EIK, Helper Matrix, Digital Twin identity, RuleBook authority, or Canonical Development Evidence.

## 2. Compatibility decision

The existing `ContinuityHandoffEnvelope` remains unchanged and authoritative for current consumers.

TK-008 composes above it:

```text
accepted ThreadKeeper checkpoint
        |
        v
ContinuityHandoffEnvelope (existing)
        |
        v
ContinuityCapsule (TK-008)
        |
        +--> ContinuityPrecondition
        |
        +--> Fidelity validation
```

This prevents a new capability from breaking CHIST, Competitive proofs, Foundry consumers, or other existing handoff integrations.

## 3. Continuity Capsule

A capsule is an integrity-protected, bounded, reference-oriented continuity carrier.

It includes:

- semantic continuity scope;
- accepted checkpoint identity and state/proposal digests;
- bounded accepted lineage;
- unresolved ThreadKeeper case references;
- continuity digest from the accepted handoff;
- objective references;
- accepted decision references;
- active assumption references;
- unresolved obligation references;
- prohibited-action references;
- open-question references;
- evidence/provenance references;
- authority evidence and policy references;
- an explicit rule that authority inheritance is forbidden;
- sensitivity and retention class;
- issuance and expiry;
- deterministic integrity digest.

The capsule stores references, not copied transcripts, source documents, secrets, credentials, or large canonical payloads.

### Security boundary

Receiving a capsule never grants authority. Every consumer remains subject to independent authority validation at its action boundary.

Capsules reject credential-like material using the existing continuity integrity/secret scanning primitive. Capsule size and individual references are bounded.

## 4. Continuity Preconditions

A precondition is a compact stale-action guard derived from a valid capsule.

It binds the intended operation context to:

- semantic scope;
- expected accepted checkpoint;
- expected continuity digest;
- source capsule digest;
- independent authority validation requirement;
- forbidden authority inheritance;
- issuance/expiry;
- deterministic integrity digest.

Immediately before consequential work, a consumer compares the precondition with a freshly resolved `ContinuityHandoffEnvelope`.

Possible outcomes include:

- `valid`
- `invalid`
- `integrity_mismatch`
- `expired`
- `scope_mismatch`
- `stale_checkpoint`
- `continuity_digest_mismatch`
- `authority_contract_mismatch`

Unsafe ambiguity fails closed.

ThreadKeeper does not execute the protected operation. It only determines whether the continuity precondition still holds.

## 5. Fidelity validation

Fidelity validation compares a source capsule and a candidate transformed capsule using structured semantics rather than prose similarity.

The strict policy detects:

- source or candidate integrity failure;
- scope substitution;
- checkpoint substitution;
- continuity digest change;
- lineage change;
- authority weakening;
- sensitivity weakening;
- retention-policy change;
- unjustified expiry extension;
- lost objective references;
- lost accepted decisions;
- lost assumptions;
- lost obligations;
- lost prohibitions;
- lost open questions;
- lost evidence/provenance;
- lost authority evidence;
- lost policy references;
- lost unresolved-case references.

A candidate may add references or strengthen sensitivity. Under the strict policy it may not silently remove protected continuity semantics.

This is intentionally not a model-based semantic similarity check. A fluent summary cannot prove fidelity when structured continuity controls have disappeared.

## 6. Standards and adaptation analysis

TK-008 adapts existing interoperability patterns without importing their authority assumptions.

### W3C Baggage / OpenTelemetry context propagation

Distributed-context propagation demonstrates the value of carrying compact context across service boundaries. However, OpenTelemetry explicitly warns that baggage may propagate to unintended third parties and has no built-in integrity checks. Therefore TK-008 does **not** put protected capsule contents into ordinary telemetry baggage by default. Transport integrations may carry an opaque capsule reference/digest when appropriate.

References:

- https://www.w3.org/TR/baggage/
- https://opentelemetry.io/docs/concepts/signals/baggage/
- https://opentelemetry.io/docs/specs/otel/baggage/api/

### CloudEvents

CloudEvents separates routing/processing context attributes from event data and permits bounded extension attributes. TK-008 may later map capsule identity/digest to transport metadata while keeping the governed capsule body in an appropriate protected carrier or reference.

Reference:

- https://github.com/cloudevents/spec/blob/main/cloudevents/spec.md

### Durable execution / replay

Long-running workflow systems demonstrate why resumed work must be bound to durable history and deterministic state rather than assuming in-memory context remains current. TK-008 adopts the stale-state lesson while leaving execution/replay ownership outside ThreadKeeper.

Reference:

- https://docs.temporal.io/workflows

## 7. Ownership boundaries

TK-008 owns only continuity propagation semantics and validation.

It does not own:

- transport delivery;
- source evidence storage;
- retrieval/ranking;
- execution;
- retry;
- leases/fencing;
- authority grants;
- policy approval;
- truth determination;
- revision approval;
- Digital Twin identity;
- automatic downstream mutation.

## 8. Failure posture

The system fails closed when:

- a capsule or precondition fails integrity validation;
- a capsule is expired;
- a fresh handoff reports another checkpoint;
- the continuity digest changed;
- scope identity differs;
- authority inheritance is implied;
- protected continuity fields were dropped or weakened;
- a payload contains credential-like material;
- bounds are exceeded.

No failure causes ThreadKeeper to rewrite the accepted checkpoint or source systems.

## 9. Acceptance for this slice

TK-008 repository acceptance requires:

1. deterministic capsule creation and verification;
2. deterministic precondition creation and fail-closed validation;
3. strict fidelity comparison;
4. adversarial unit tests for staleness, tamper, expiry, substitution, authority weakening, lost obligations/prohibitions/provenance, and classification weakening;
5. existing server regression suite remains green;
6. exact-head GitHub Actions evidence;
7. no schema/RLS/grant/Production change.

A later integration slice may add specific consumers, but the portable contract must remain provider-neutral and reference-oriented.
