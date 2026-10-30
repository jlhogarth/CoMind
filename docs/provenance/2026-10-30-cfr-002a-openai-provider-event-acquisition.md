# CFR-002A Supported OpenAI Provider Event Acquisition Provenance

Date: 2026-10-30
Issue: #421
Parent: #387
Branch: `cfr-002a-openai-provider-event-acquisition`
Base lease: `57f90af8b0c558e4902de36d17e65793495c86a7`
Environment: repository + isolated PostgreSQL Test only
Production activation: not authorized
Private ChatGPT/browser capture: disabled
Paid model calls: not required

## Purpose
CFR-002A wires the supported OpenAI Responses stream into the merged CFR-002 acquisition ledger while preserving CFR-001 canonical text capture as a separate evidence path. Provider lifecycle, sequence identity, output text, and provider-exposed reasoning-summary artifacts are observed as source-distinct acquisition evidence.

## Reuse decisions
- Reuse `AssistantResponseObserver`; extend it with an optional typed provider-event callback.
- Reuse CFR-001 `assistant_delta` capture unchanged for canonical conversational text.
- Reuse `cm_conversation_acquisition_observation` and `cm_conversation_acquisition_normalization`; no competing transcript table is introduced.
- Reuse `comind_conversation_acquisition_writer` with transaction-local role assumption and runtime privilege verification.
- Reuse the CFR-002 isolated PostgreSQL acceptance harness and existing normalizer.

## Security boundary
The default acquisition writer opens a bounded PostgreSQL transaction, verifies that the session may assume `comind_conversation_acquisition_writer`, executes `SET LOCAL ROLE`, verifies the expected SELECT/INSERT-only privilege shape, writes the observation and normalization receipt, then commits. UPDATE and DELETE remain denied. The route receives the writer through dependency injection so tests can use deterministic synthetic writers without changing the production default.

## Epistemic boundary
Provider-exposed reasoning summaries are evidence only of what the provider exposed as a summary. CFR-002A does not claim access to raw hidden chain of thought. Existing `response.reasoning_text.*` events remain `unknown` under the CFR-002 normalizer and are not relabeled as reasoning evidence.

## Raw evidence boundary
This slice persists raw-envelope digest, byte count, source identity, timestamps, provider metadata, and normalized evidence. It does not yet claim durable raw-object storage of the complete provider event envelope. `raw_object_ref` remains null until a later governed raw-object-storage slice establishes that lifecycle.

## Research
- OpenAI, Responses streaming events reference, accessed 2026-10-30: https://developers.openai.com/api/reference/resources/responses/streaming-events
- OpenAI, Responses streaming guide, accessed 2026-10-30: https://developers.openai.com/api/docs/guides/streaming-responses
- Supabase, Database changelog, accessed 2026-10-30: https://supabase.com/docs/guides/platform/changelog

## Collision and freshness
The lane was created after PR #388 merged. A collision scan found SEC-RLS-001 owning migration `_027`; that lane subsequently merged as base commit `57f90af8...`. CFR-002A introduces no schema migration, so no migration namespace is claimed. No active PR owned the provider, assistant observer, route, or acquisition-store paths at branch creation.

## Acceptance intent
- synthetic OpenAI stream unit proof
- constrained acquisition-role database proof
- provider acquisition ordering before provider continuation
- CFR-001 completed/interrupted stream regression
- CFR-002 normalizer/database foundation regression
- exact-head GitHub Actions proof

## Inherited CFR-002 verification repair

The first reconciled exact-head CFR-002A run exposed a latent arity defect in the merged CFR-002 database verification fixture. Observation `c0020000-0000-4000-8000-000000000105` omitted its `source_stream_ref`, causing PostgreSQL to reject the multi-row INSERT before CFR-002A code was exercised. The repair adds the intended `browser_synthetic_1` stream reference, preserving the fixture's existing `future_private_event_shape` event-family and `browser_event_drift` event reference. No schema, runtime, Production, or source-semantics change is introduced.

The CFR-002A workflow path filter now explicitly includes the inherited CFR-002 verification SQL and parent acceptance script because CFR-002A depends on that regression harness.
