# Agent Communication 001: verified handoff boundary

Status: closed pilot, reference architecture  
Issue: [#156](https://github.com/jlhogarth/CoMind/issues/156)  
Date: 2026-10-21

## Decision

Do not add a dedicated Supabase message relation for this milestone.

The pilot established a useful human-relayed CoMind handoff using GitHub for the request and response, Google Drive for the durable exchange artifact, and the existing Supabase PM RunBook for a concise operational evidence record. It did not establish authenticated or independently addressable communication between separate CoMind GPT sessions.

Keeping Issue #156 open until an unavailable transport appears would create a zombie development lane. The direct Supabase message contract below remains a reference design for a future milestone, but it is not implemented or claimed as operating.

## Verified pilot

ATLAS and PROOF were used as established CoMind role labels, not as active database Agent identities.

The bounded exchange is preserved in GitHub Issue #156:

- ATLAS request: https://github.com/jlhogarth/CoMind/issues/156#issuecomment-6310514895
- PROOF response: https://github.com/jlhogarth/CoMind/issues/156#issuecomment-6310524081
- completion record: https://github.com/jlhogarth/CoMind/issues/156#issuecomment-6310556835

The durable Google Drive artifact is:

- https://docs.google.com/document/d/1eSHQRKsWFfvW9eKDglT_ELc24pgFNQHpofSPjVG7ZUY/edit

The verified Supabase PM RunBook record is:

- `89d14324-09a6-4a22-a2fe-ce40bd645649`
- event type: `agent_update`
- outcome: `informational`
- consequential: `false`
- source: GitHub Issue #156 and the PROOF response
- evidence links: Issue #156, ATLAS comment, PROOF comment, and the Drive artifact

Readback confirmed that the Drive artifact contains the same bounded ATLAS to PROOF exchange and explicitly states the limitation that both role invocations were temporary ChatGPT subagents orchestrated in one session. Readback of the RunBook event confirmed the expected classification and evidence links.

## What this proves

The pilot proves that CoMind can preserve a human-triggered Agent-role handoff across three governed surfaces without inventing Agent identity or duplicating the complete exchange into the RunBook:

1. GitHub holds work authority and the actual request/response thread.
2. Google Drive holds the durable human-readable artifact.
3. The Supabase PM RunBook holds a concise event pointing to the authoritative evidence.

This is sufficient for human-assisted development coordination today.

## What this does not prove

The pilot does not prove any of the following:

- separate CoMind GPT sessions can discover or wake each other;
- a recipient GPT session exposes the same Supabase connector;
- ATLAS or PROOF is an authenticated database Agent identity;
- Supabase currently acts as a message transport between GPT sessions;
- an unattended worker, OpenAI API process, or background Agent exists;
- a GitHub comment author identity proves the labeled Agent role;
- production Agent communication is active.

No email was sent. No new Supabase message table was created. No RLS or schema exposure was broadened. No OpenAI API or provider execution occurred.

## Current substrate finding

At pilot time, live `comind.cm_agent` and `comind.cm_foundry_agent_profile` contained no canonical Agent records. `anon` and `authenticated` had no `comind` schema usage. The available connector could be verified for the current ChatGPT session, but not for a separate recipient session.

Those facts make a dedicated database mailbox premature. Creating one would provide persistence without proving delivery, recipient authentication, or independent execution.

## Reference contract for a future direct transport

If CoMind later has independently addressable Agent sessions, a direct message transport should preserve at minimum:

- `contract_version`
- `message_id`
- `thread_id`
- `reply_to_message_id`
- canonical `sender_agent_id`
- canonical `recipient_agent_id`
- GitHub repository and issue authority
- bounded `message_kind`
- bounded structured body and evidence references
- database assigned `created_at`
- idempotency key
- immutable history

A future implementation must prove recipient authentication, denied-recipient behavior, duplicate/replay handling, append-only history, and readback from two genuinely separate recipient contexts before it can claim Agent-to-Agent communication.

## Reopen trigger

Do not reopen this lane merely because CoMind wants Agent communication.

Create a new milestone when both of these are true:

1. canonical Agent identities exist in the governed substrate; and
2. two independently addressable ChatGPT or runtime Agent contexts can be proven to access an agreed transport.

At that point, re-evaluate whether Supabase, GitHub, or another governed queue is the correct transport based on authentication, delivery, wake-up semantics, evidence, latency, and operational cost.

## Terminal state

Issue #156 should close as a bounded pilot whose original independent-session Supabase round-trip could not be established with the available product surface. The limitation is preserved explicitly rather than converted into a false success claim. PR #157 preserves the reference contract and the decision not to create unnecessary messaging infrastructure at this stage.
