# AEL-002 Synthetic Event Envelope and Local Simulator

Status: implementation contract
Issue: #424
Predecessor: AEL-001, PR #420
Environment: Development and Test only
Governance tier: T1 Reversible development
Production activated: false
Live capture activated: false
Personal data required: false
External provider required: false

## 1. Purpose

AEL-002 turns the AEL-001 logical event model into a small executable contract that can be exercised without collecting real-world data. It introduces a strict TypeScript event envelope and a deterministic local simulator using synthetic fixtures only.

This milestone exists to prove event identity, temporal uncertainty, provenance, missingness, duplicate delivery, bounded integrity, and deterministic multi-source reconstruction before any real capture adapter is authorized.

## 2. Reuse decision

AEL-002 does not create an independent CoMind event or integrity framework.

It reuses the following existing primitives:

- ACP continuity canonicalization and SHA-256 fingerprinting through `canonicalizeForIntegrity` and `fingerprintCanonicalValue`;
- ACP credential-material rejection through `assertNoCredentialMaterial`;
- the ACP 64 KiB bounded-envelope precedent;
- SDN semantics for producer/event identity, source sequence, correlation, causation, trace correlation, provenance, duplicate identity, and integrity conflict reasoning;
- canonical CoMind classification values;
- canonical retention and residency profile references;
- AEL-001 authority, observation, provenance, temporal, retention, and GER boundaries.

AEL-002 imports the continuity integrity functions directly. It does not copy their secret-detection regular expressions or canonical serializer.

## 3. Executable envelope

The implementation lives in `server/src/ael/event-envelope.ts`.

An AEL event contains no raw ambient payload. It carries bounded metadata and a reference to evidence or synthetic content.

The v1 envelope contains:

- `schemaVersion`;
- `eventId`, the normalized AEL event identity;
- `sourceId`, the stable CoMind source identity;
- `sourceEventId`, the source/provider event identity preserved through normalization;
- `sourceKind` and `modality`;
- optional `providerRef`;
- tenant/project scope;
- `captureAuthorityRef`;
- occurrence, observation, and ingestion timestamps;
- source clock identity and uncertainty;
- source sequence;
- optional correlation, causation, and trace identifiers;
- canonical data classification;
- retention and residency references;
- `contentRef` and SHA-256 `contentHash`;
- bounded provenance edges;
- optional transformation identity;
- optional explicit synthetic generation provenance;
- artifact lifecycle state;
- explicit gap, duplicate, corruption, and partial flags;
- `envelopeDigest`, calculated from the canonical envelope body.

The schema is strict. Unsupported fields are rejected rather than silently removed. This is an epistemic safety property: an inference, identity assertion, conclusion, decision, or action cannot be smuggled into the AEL observation contract as an unknown property.

## 4. Integrity and secret handling

`createAelEventEnvelope()` performs this sequence:

1. invoke the existing ACP credential-material guard;
2. parse the strict Zod body schema;
3. enforce temporal and self-causation invariants;
4. enforce the bounded-envelope size;
5. calculate the canonical SHA-256 envelope digest using the shared ACP primitive;
6. return the validated envelope.

`parseAelEventEnvelope()` repeats secret, schema, temporal, size, and digest verification for an existing envelope.

The content hash and envelope digest have different meanings:

- `contentHash` identifies the referenced evidence/content representation;
- `envelopeDigest` protects the normalized AEL envelope metadata.

Neither value is an authorization decision.

## 5. SDN compatibility boundary

AEL and SDN remain distinct responsibilities.

A future AEL-to-SDN adapter can map:

| AEL | SDN semantic |
| --- | --- |
| `sourceId` | producer identity |
| `eventId` | normalized event identity used for idempotency |
| `sourceSequence` | sequence number |
| `correlationId` | correlation ID |
| `causationEventId` | causation event ID |
| `traceId` | trace ID |
| `provenance` | provenance edges |

`sourceEventId` remains the original source/provider event identity and can be retained inside the normalized payload/provenance model.

AEL classification is not declared equivalent to an SDN lifecycle or sensitivity class. A later adapter must use the owning registry/policy mapping rather than assuming a one-to-one translation.

Likewise, AEL `contentHash` is not the same thing as SDN's canonical payload hash. A future SDN ingestion adapter may calculate a separate payload hash over the normalized event payload.

AEL lifecycle state is an availability/disposition state for the referenced artifact. It does not replace SDN lifecycle classes A through E or canonical CoMind retention profiles.

## 6. Temporal contract

AEL treats time as evidence with uncertainty.

The envelope records:

- source occurrence time;
- optional interval end;
- observation time when available;
- ingestion time;
- clock source;
- nonnegative clock uncertainty.

The validator rejects an interval end that precedes the interval start. It does not require source time to be earlier than observation or ingestion time because a real source clock may be offset. Consumers must interpret clock uncertainty rather than fabricate ordering precision.

## 7. Deterministic simulator

The implementation lives in `server/src/ael/simulator.ts`.

The simulator accepts a bounded scenario with explicit:

- scenario ID and seed;
- base time;
- tenant/project scope;
- synthetic capture-authority reference;
- classification, retention, residency, and lifecycle references;
- one or more source definitions;
- source kind and modality;
- cadence/event count;
- source clock offset and uncertainty;
- configured missing sequences;
- configured duplicate sequences.

The simulator uses SHA-256-derived deterministic UUIDs and timing jitter. The same scenario and seed therefore produce byte-equivalent logical output after canonical serialization.

The simulator does not return the raw seed. It returns a fingerprint of the seed in generated provenance.

## 8. Missingness semantics

A configured gap causes the expected event not to be generated. The simulator records a separate diagnostic containing the source, sequence, and expected source time.

This is deliberate. A missing interval is evidence of missingness, not an event asserting that nothing happened.

The causal chain for later generated events links to the most recent generated event rather than inventing a causal event for the missing sequence.

## 9. Duplicate semantics

A configured duplicate produces an identical second delivery of the normalized AEL event. Both deliveries preserve the same:

- `eventId`;
- `sourceEventId`;
- content hash;
- envelope digest;
- timestamps and metadata.

The simulator records the duplicate in diagnostics instead of mutating the second envelope. This preserves the exact identity/payload invariant needed to test SDN-style idempotency later. If the same identity arrives with different content, that is an integrity conflict, not a duplicate.

## 10. Epistemic boundary

AEL-002 produces evidence/observation envelopes only.

It does not contain fields for:

- inferred person identity;
- emotion or intent;
- hypothesis;
- conclusion;
- profile promotion;
- action recommendation;
- authorization decision.

Those responsibilities remain with GER, Digital Twin governance, and the authority/action layers established by AEL-001.

## 11. Security boundary

The implementation has no network client, database client, device API, media API, provider SDK, or filesystem capture path.

The simulator imports only Node cryptographic primitives, Zod, the shared continuity integrity functions, and the local AEL envelope module.

Credential material is rejected before a scenario or envelope is accepted. Raw ambient content is structurally absent from the envelope contract.

## 12. Acceptance tests

AEL-002 tests cover:

- valid envelope creation and verification;
- canonical envelope digest integrity;
- tamper detection;
- invalid temporal bounds;
- strict rejection of unsupported epistemic fields;
- invalid classification, uncertainty, content hash, and provenance;
- canonical credential-material rejection;
- deterministic repeated simulation;
- multi-source simulation;
- explicit missingness diagnostics;
- identical duplicate deliveries;
- seed-dependent event identity with stable source identity;
- bounded source-clock uncertainty;
- impossible missing/duplicate configuration rejection.

The tests require no external network, database, provider, credential, microphone, camera, or location source.

## 13. Successor boundary

AEL-002 does not evaluate whether a real capture operation is authorized. AEL-003 owns the Test-only governed capture-authority preflight.

No real source adapter should be added until that authority gate exists and has passed its own governed acceptance milestone.
