# AEL-002 Synthetic Event Envelope and Local Simulator Provenance

Date: 2026-10-30
Issue: https://github.com/jlhogarth/CoMind/issues/424
Branch: `ael-002-synthetic-event-envelope-simulator`
Predecessor merge: `b7c6d69e2954315a1a92e71466d87e2a46fecd2b`
Environment: Development and Test only
Governance tier: T1 Reversible development
Production change: false
Live capture: false
Personal data: false
External provider call: false
Database change: false
Paid commitment: false

## Authority

AEL-002 proceeds under standing L4A authorization `a4d3728d-62a2-4f4f-bb4c-f40486984f76` after AEL-001 reached terminal Durable RunBook state `done`.

The lane remains inside the non-Production authority boundary. Existing mandatory human stops are unchanged.

## Freshness and collision checks

Before implementation, the lane verified:

- AEL-001 PR #420 was merged and canonical on main;
- the AEL-001 Durable RunBook lane read `done` with terminal outcome `complete`;
- no existing GitHub issue or pull request named AEL-002 existed;
- no existing AEL branch existed in the branch inventory;
- no open Durable RunBook blockers were present;
- no open pull request existed for the new AEL-002 branch;
- current `main` remained at `b7c6d69e2954315a1a92e71466d87e2a46fecd2b` immediately before branch creation.

The branch was created from that exact main head.

## Reuse audit

AEL-002 inspected existing CoMind implementation patterns before code creation.

The server runtime is Node 24 / TypeScript with strict TypeScript compilation, ESM output, Zod 4.6.7 validation, and Node's built-in test runner.

The lane also reconciled its event design with:

- `server/src/continuity/checkpoint.ts`, which owns canonical serialization, SHA-256 fingerprinting, credential-material rejection, and the 64 KiB bounded-checkpoint precedent;
- `server/src/threadkeeper/checkpoint.ts`, which already reuses the continuity integrity primitives instead of cloning them;
- SDN event semantics in `sdn/src/app.mjs`, including producer/event identity, sequence, correlation, causation, trace correlation, provenance, duplicate identity, payload-hash conflict handling, ingestion receipts, and lifecycle policy linkage;
- `docs/architecture/threadkeeper-implementation-design.md`, which explicitly identifies ACP and SDN event-envelope semantics as reusable CoMind primitives.

This review changed the implementation plan in a useful way: AEL-002 imports the ACP integrity/secret functions directly and documents an explicit future SDN mapping rather than inventing an unrelated event framework.

## Design decisions

1. The executable envelope is strict and contains no raw ambient payload.
2. `eventId` is the normalized AEL event identity; `sourceEventId` preserves the original source event identity.
3. Synthetic duplicate deliveries are exact repeats, preserving identity and content so later SDN idempotency can be tested correctly.
4. Missing sequences are represented in simulator diagnostics, not as fabricated events.
5. Source clock uncertainty is explicit and deterministic synthetic jitter is bounded by that uncertainty.
6. Canonical classification values are reused directly.
7. Retention and residency are references to existing governance profiles, not redefined AEL policies.
8. AEL artifact lifecycle state is explicitly not an SDN lifecycle class.
9. Content hash and envelope digest are separate integrity concepts.
10. Secret rejection occurs before schema acceptance using the existing continuity guard.
11. The simulator fingerprints rather than returns the raw seed.
12. There is no database, route, device, provider, media, or network implementation in this milestone.

## Files introduced

- `server/src/ael/event-envelope.ts`
- `server/src/ael/simulator.ts`
- `server/src/ael/index.ts`
- `server/test/ael-event-envelope.test.mjs`
- `server/test/ael-simulator.test.mjs`
- `docs/architecture/ael-002-synthetic-event-contract.md`
- `docs/provenance/2026-10-30-ael-002-synthetic-event-envelope-simulator.md`

## Verification contract

The lane must verify at least:

- strict TypeScript build;
- focused AEL tests;
- full server test suite;
- exact branch/main diff;
- exact-head GitHub checks after PR creation;
- main freshness before merge;
- post-merge artifact presence and issue closure;
- Durable RunBook terminal readback.

Commit, PR, exact-head check, and merge identifiers are recorded in the Durable RunBook after those provider states exist. This document does not guess identifiers that have not yet been created.

## Failure and recovery evidence

Any implementation, build, test, freshness, CI, or merge failure encountered after this document is committed is written to the canonical Durable RunBook with the attempted state, observed failure, bounded repair, and verification result.

## Production boundary

AEL-002 does not authorize Production, live capture, personal data collection, device access, provider access, external inference, biometric processing, media retention, or a paid service. AEL-003 remains the next dependency-valid milestone for implementing capture-authority preflight in Test.
