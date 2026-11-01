# L4A-MP-008 Conversation Title History and Automatic Registration

Date: 2026-11-01
Issue: #478
Production change: false
Paid-service commitment: false
Authority expansion: false

## Purpose

MP-007 established the stable lane-to-conversation identity registry. MP-008 makes conversation names durable without weakening that identity model.

A ChatGPT conversation title is mutable metadata. It is never an ownership key. The canonical identity remains the exact ChatGPT conversation UUID plus its exact canonical `https://chatgpt.com/c/<uuid>` URL.

## Title registry

`comind_pm.pm_lane_conversation_title_events` is append-only. Each event records:

- canonical PM work item
- exact binding event
- exact ChatGPT conversation UUID and URL
- observed title
- observation method
- evidence reference
- observer
- observation time
- idempotency key
- bounded metadata

The table is private, RLS-enabled, and denies browser/public direct access. Mutation is rejected by trigger.

Existing MP-007 binding titles are bootstrapped into the title ledger so historical bindings retain a first observed name.

## Rename semantics

`comind_pm.observe_lane_conversation_title(...)` accepts a title only after proving that the supplied exact conversation UUID and URL match the lane's current active MP-007 binding.

A rename appends a new title observation. It does not supersede or alter the conversation identity binding.

A repeated observation of the same current title is a semantic replay and does not create a second title event. An older observation with a different title is retained as historical evidence but cannot displace a newer current title.

`comind_pm.resolve_lane_conversation_binding(...)` remains backward compatible and additionally exposes:

- `currentTitle`
- `currentTitleEventId`
- `currentTitleObservedAt`
- `titleHistoryCount`

`observedTitle` remains the title recorded on the identity binding itself.

`comind_pm.lane_conversation_title_history(...)` returns the ordered append-only title history for a canonical work key.

## Automatic registration

`comind_pm.register_or_observe_lane_conversation(...)` is the trusted runtime adapter for future development conversations.

It may establish a missing MP-007 binding only when all of the following are present:

1. an existing canonical PM work item
2. an exact ChatGPT conversation UUID
3. the exact canonical URL containing the same UUID
4. an accepted identity registration method
5. durable evidence provenance
6. an identified observer and idempotency key

If the lane already has an active binding, the exact identity must match. A conflicting UUID or URL fails closed. An inactive binding is not silently reactivated. A title alone can never establish or replace a binding.

When the exact identity matches, the same adapter can append a new title observation. This is the intended hook for CBE, lane bootstrap, runtime reconciliation, and future conversation-name monitoring.

## Operational process

Trusted runtime observations should call `register_or_observe_lane_conversation` whenever a durable lane is created, adopted, resumed, or observed by the browser actuator. This provides one process for both initial registration and later rename detection.

The process is event-driven when the runtime can observe the active conversation. A periodic reconciliation sweep may also call the same adapter as a safety net. Reconciliation does not infer identity from titles and does not create bindings from title similarity.

## Verification

The isolated PostgreSQL 17 proof verifies:

- title-only binding is impossible
- exact UUID/URL can automatically establish the first binding
- the initial title is visible through the resolver
- a later rename keeps the same conversation identity
- duplicate same-title observation is semantically idempotent
- stale historical title evidence is preserved without becoming current
- exact title history is retained
- conflicting identity fails closed
- automatic registration does not create duplicate identity bindings
- UPDATE and DELETE against title history are rejected
- RLS is enabled
- `anon`, `authenticated`, and `PUBLIC` do not gain private access

## Notebook bootstrap

The first real MP-007 bootstrap performed before this implementation assigned work key `NOTEBOOK-001` from the pre-existing GitHub branch `notebook-001-capture-review-test` and bound it to archived ChatGPT conversation `6ad6722e-cfec-83e8-8ec6-3b411edb5cee`, titled `Runbook Notebook Restoration`.

The archive observation independently showed the same UUID in `source_conversation_id`, raw `id`, and raw `conversation_id`. That exact-identity evidence, not the title, established the binding.

Once MP-008 is deployed, this existing binding is bootstrapped into title history and future observed renames can be appended without changing Notebook ownership.
