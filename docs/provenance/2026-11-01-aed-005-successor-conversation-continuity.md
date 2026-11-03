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


## Recovery checkpoint: November 2, 2026

Joseph requested resumption of the interrupted AED lane with close credit control.
The recovered PR is #508, baseline c3b712aed37f175ff77539e47e5ec2db6026e840.
The current main Development Environment Contract v1.4 was read. Supabase
`comind_pm.v_runbook_authority` confirms the standing L4A grant with no expiry.
The lane projection query returned AED-002 as done but no AED-005 row; GitHub
Issue #504 and PR #508 remain the recovered implementation references.

The baseline server build and all 26 dedicated deterministic tests passed locally
on Node 24.22.1. Review found that the continuity finalizer accepted browser success
without a registry promotion receipt, incorrectly allowing predecessor supersession.
The fix requires a promoted binding event and the expected predecessor identity.
Four regression cases cover absent, failed, incomplete, and mismatched receipts.
Missing proof blocks continuity and automatic creation retry until reconciliation.

Classification: T1 reversible repository fix under existing L4A and the current
explicit resumption instruction. Affected actor: AED continuity coordinator.
Controls: existing AGENTS evidence requirements, CE recovery, GOV-DEV-014 forward
impact, and MP-007 canonical identity. No new authority, schema, credential,
Production deployment, paid service, or live conversation action. No exception.
The new check has constant local cost and no additional network call. Rollback
reverts this checkpoint's planner, regression tests, and documentation together.

Validation after the fix: server build and all 30 dedicated tests passed;
`git diff --check` passed. This is local evidence, not exact-head CI acceptance.
Existing baseline pull-request workflows report failure; Issue #510 separately
records Actions allowance exhaustion. No workflow rerun was requested. A skip-CI
commit preserves the repair without deliberately rerunning pull-request CI;
this does not waive required checks or authorize merge. Other event-triggered
workflows are not represented as disabled.

Open: exact-head CI acceptance, live authenticated browser proof, and durable
AED-005 RunBook registration. Next: restore the canonical CI execution path under
CI-FINOPS-001 without new spending or weakened gates, validate this candidate,
then perform the separately governed live browser proof. Do not infer a working
end-to-end AED service from passing deterministic tests.
