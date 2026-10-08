# Budget-adapter telemetry role provenance hardening

Date: 2026-10-08
Issue: https://github.com/jlhogarth/CoMind/issues/62
Predecessor issue: https://github.com/jlhogarth/CoMind/issues/59
Predecessor pull request: https://github.com/jlhogarth/CoMind/pull/60
Base authoritative main: `5e71c8d6ea8edd5bbaf8e794a686a3fb0739504c`

## Purpose

Issue #62 is a post-merge hardening slice for the current-runtime budget-authority adapter merged by PR #60. Review after merge identified a provenance gap: each adapter reservation records an `execution_role`, but message-backed settlement selected a telemetry locator independently. A reservation for the draft provider pass could therefore be pointed at verifier telemetry if the provider identity otherwise matched.

The hardened Issue #57 monetary authority still bounded exposure correctly, so this finding did not create a budget-oversubscription path. It could, however, misattribute which provider execution consumed a reservation. That is incompatible with CoMind's requirement that governed chat, agent, workflow, tool, and future Virtual Employee execution remain observable and auditable.

## Contract

The settlement adapter now derives the expected execution role from the authoritative telemetry locator before calling the monetary finalizer:

- `root` requires reservation execution role `root` and remains forbidden for quality-gated messages.
- `quality_gate.passes.draft` requires `draft`.
- `quality_gate.passes.verifier` requires `verifier`.
- `quality_gate.passes.repair` requires `repair`.

A mismatch fails closed before monetary settlement and before insertion of current-runtime telemetry provenance.

This hardening does not create a second accounting ledger or pricing source. Monetary reservation and settlement still delegate to the hardened Issue #57 authority, and known cost still comes only from persisted provider telemetry produced by the reviewed rate-card estimator.

## Verification

The isolated PostgreSQL verification creates a conversation-bound budget envelope, reserves a `draft` provider execution, and persists an assistant message containing separate draft and verifier provider telemetry. It then deliberately attempts to settle the draft reservation against verifier telemetry and requires the adapter to reject the operation.

After rejection, verification proves:

- the reservation remains `reserved`;
- actual cost remains zero;
- the full reserved exposure remains held;
- no adapter telemetry link is inserted; and
- the same reservation can still settle successfully against the correct draft pass.

The permanent runtime-budget-authority adapter harness applies and reapplies the new migration to prove migration idempotency and executes the new deterministic verification before its existing independent-client concurrency race.

## Safety

- No live Supabase mutation.
- No production deployment.
- No paid OpenAI or other provider call.
- No credentials or secret values.
- No provider runtime wiring is part of this milestone.
