# L4A-MP-007 Canonical Lane-to-Conversation Identity Registry

## Problem

L4A-MP-006 made repair-and-return truthful: a repaired lane must either resume in its canonical originating conversation or report exactly why return is impossible. The first live validation correctly returned `conversation_binding_missing` because the management plane had no authoritative real lane-to-conversation ownership record.

CBE-002 already requires an exact stable `chatgpt.com/c/<conversation-id>` target. Conversation titles are deliberately insufficient identity.

## Decision

Add a private append-only lane conversation identity event ledger keyed to canonical `comind_pm.pm_work_items`.

The registry is a management-plane ownership record, not a replacement for DRULE conversation egress governance. DRULE answers whether conversation data may leave a governed boundary. L4A-MP-007 answers which exact conversation is the originating execution surface for a durable development lane.

## Data contract

`comind_pm.pm_lane_conversation_binding_events` records:

- canonical work item;
- `bound` or `retired` event;
- execution surface;
- stable external conversation ID;
- exact canonical ChatGPT URL;
- observed title when available;
- registration method;
- identity evidence reference;
- registering actor/controller;
- idempotency key;
- predecessor event for supersession;
- bounded metadata;
- wall-clock event time.

Rows are append-only. Rebinding does not rewrite history. A new binding explicitly supersedes the previous event. Retirement is another event carrying the prior exact identity.

## Identity rules

For ChatGPT, a valid binding requires both:

1. the stable UUID-form conversation ID; and
2. the exact URL `https://chatgpt.com/c/<same-id>`.

Title similarity, conversation topic, incidental PR references, or model recollection cannot create a binding.

This matters for the current Notebook and CP-04 lanes. The conversation archive contains related historical conversations, but the available evidence does not prove exact ownership of PR #152 or PR #311. No binding is created from that ambiguity.

## Resolution semantics

`comind_pm.resolve_lane_conversation_binding(work_key)` returns one of:

- `work_item_missing`;
- `conversation_binding_missing`;
- `conversation_binding_inactive`;
- `active` with exact stable identity.

L4A-MP-006 may consume this result directly. It must not create a second resolver or infer around a missing result.

## Registration semantics

`comind_pm.bind_lane_conversation(...)`:

- requires the canonical work item to exist;
- validates exact ChatGPT ID and URL agreement;
- serializes writes per work key with an advisory transaction lock;
- treats exact re-registration as idempotent without duplicating an active event;
- fails closed on a conflicting active conversation unless explicit supersession is requested;
- preserves the predecessor event when superseding.

`comind_pm.retire_lane_conversation_binding(...)` adds an immutable retirement event rather than deleting or rewriting identity history.

## Registration bootstrap

Future development conversations should register exact identity as early as practical, before recovery is needed. Acceptable sources include:

- CBE observation of the exact authenticated ChatGPT URL;
- an exact conversation ID supplied by a trusted runtime surface;
- a ChatGPT export/archive record when the lane identity is independently and unambiguously proven;
- an explicitly supplied exact URL.

The registration evidence must say how exact identity was established. A title alone is never enough.

## Privacy and security

The registry stores conversation identity and provenance, not authentication material. Cookies, passwords, access tokens, browser storage, MFA material, and raw session state are prohibited.

The table is private, RLS-enabled, and deny-all to public browser roles. Only explicit service-role function access is granted for bind/resolve/retire operations.

## Verification

The isolated PostgreSQL 17 proof covers:

- missing binding;
- URL/ID mismatch rejection;
- exact binding;
- exact re-registration without duplication;
- conflicting active binding rejection;
- explicit supersession with predecessor preservation;
- exact resolver output;
- explicit retirement and inactive resolution;
- append-only mutation rejection;
- private access controls.

Production change=false. Paid-service commitment=false. Authority expansion=false.
