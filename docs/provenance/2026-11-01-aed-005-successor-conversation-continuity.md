# AED-005 Successor Conversation Continuity Provenance

Date: 2026-11-01 America/Indiana/Indianapolis
Issue: #504
Branch: `aed-005-successor-conversation-continuity`
Production change: false

## Trigger

Repeated ChatGPT conversation and streaming failures demonstrated that requiring a specific originating conversation to survive is a weaker continuity invariant than requiring the logical CoMind development lane to survive.

A prior TinyFish proof already established that exact-conversation navigation, handoff delivery, and observed ChatGPT response in the registered originating conversation are possible. AED-005 therefore does not discard original return. It makes original return one preferred execution-surface path and adds governed successor reconstruction as a fallback.

## Reuse decision

AED-005 reuses existing CoMind continuity and recovery substrates rather than inventing a second continuity platform:

- CE Continuity Capsules;
- ThreadKeeper accepted handoff lineage;
- ACP recovery reconciliation;
- Durable RunBook;
- L4A-MP-006 return semantics;
- CBE persistent Playwright profile;
- Foundry lease and fencing verification.

## Repository changes in this candidate

- `server/lib/l4a-conversation-continuity.js`
  - deterministic original-versus-successor continuity planning;
  - successor activation finalization;
  - founder-visible continuity report.
- `server/src/browser-executor/chatgpt-successor.ts`
  - bounded successor Continuity Capsule;
  - clean new-chat surface verification;
  - persistent Playwright successor creation;
  - message and response-start verification;
  - stable successor URL verification;
  - private successor URL separated from redacted evidence.
- `server/src/browser-executor/chatgpt-successor-runtime.ts`
  - strict runtime schema;
  - raw auth material and undeclared raw predecessor bindings rejected.
- deterministic server tests for planner, actuator, and runtime parser.
- dedicated exact-head GitHub Actions workflow.
- architecture record under `docs/architecture`.

## Safety boundaries

- no Production activation;
- no paid provider expansion;
- no credentials, cookies, MFA values, browser storage, or lease tokens committed;
- no raw predecessor ChatGPT URL required in the successor capsule;
- successor creation requires existing authority/CLEAR and canonical lease/fencing;
- AED ordinary implementation ownership remains false after continuity restoration;
- predecessor becomes superseded only after successor activation is verified.

## Acceptance state

This document records implementation intent and candidate provenance only. It does not claim CI acceptance, merge, live browser proof, successor conversation creation, or registry promotion until those events are separately verified.
