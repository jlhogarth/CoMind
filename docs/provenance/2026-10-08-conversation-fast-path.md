# Conversation Fast Path Provenance

Date: 2026-10-08
Milestone: Issue #78, Establish bounded low-latency conversation generation fast path
Repository: https://github.com/jlhogarth/CoMind
Pull request: https://github.com/jlhogarth/CoMind/pull/82
Branch: issue-78-conversation-fast-path
Authoritative base main: 65658c04567755a805bee201f426957d06711e35
Pre-provenance verified implementation head: 620c5667b80f5a8c7980862e3cb930f8e61153a0

## Purpose

Prevent CoMind conversation latency from growing structurally as memory, governance, observability, quality, and Foundry capabilities expand. The prior assistant-response path loaded unbounded conversation history before trimming it in application memory and held a PostgreSQL session advisory lock plus checked-out connection while memory retrieval and provider generation executed. The browser also reloaded the complete conversation after persisting the user turn and again after the assistant result.

## Delivered architecture

1. Added internal `comind.cm_assistant_generation` coordination records for durable per-turn generation ownership and terminal completion or failure state. The assistant message remains the canonical response record. No second conversation ledger was introduced.
2. Added one-active-generation-per-conversation and one-active-or-completed-generation-per-user-turn uniqueness enforcement while allowing an explicitly retried attempt after a failed claim.
3. Added RLS and revoked direct anon, authenticated, and PUBLIC privileges on the coordination table.
4. Moved recent-history bounding into PostgreSQL. The route requests only the configured newest message window and then returns it to the provider in chronological order.
5. Restricted the existing advisory lock to the short claim/replay/history critical section. Memory retrieval and provider generation execute after the lock and its database connection are released.
6. Added durable claim completion on successful assistant-message persistence. Provider failure marks the matching claim failed with a bounded `provider_failure` code, permitting a later explicit retry.
7. Preserved replay semantics. A repeated generation request after an assistant response exists returns the persisted assistant message without another provider invocation.
8. Prevented message append while an active generation claim owns the conversation, preserving turn ordering after the long-lived advisory lock was removed.
9. Added `Server-Timing` phases and persisted `conversation_fast_path` telemetry for claim, memory retrieval, provider, and persistence timing without logging message content, credentials, or hidden reasoning.
10. Updated the browser send path to append the persisted user and assistant rows directly instead of reloading the complete conversation on the normal success path.

## Deterministic verification

The implementation uses fake providers and isolated PostgreSQL only.

New or strengthened proof includes:
- bounded SQL history retrieval with the configured limit;
- exactly one active generation claim during a blocked deterministic provider call;
- PostgreSQL pool fully idle while the deterministic provider is blocked, proving no database connection remains checked out across provider latency;
- overlapping assistant generation rejected with HTTP 409 and no second provider call;
- overlapping user message append rejected while generation is active;
- completed response replay returns the same persisted assistant message;
- provider failure terminally records the failed claim and an explicit retry can create a separate successful claim;
- provider, usage, cost, governed execution, memory retrieval, and quality metadata remain preserved;
- browser success path appends returned persisted rows without redundant full-conversation reloads;
- existing low-risk quality-gate skip and higher-risk verification/repair behavior remain intact.

## CI evidence before provenance commit

On implementation head `620c5667b80f5a8c7980862e3cb930f8e61153a0`:
- build and server tests succeeded;
- conversation-lifecycle-integration succeeded against isolated PostgreSQL 17 plus pgvector;
- dev-runtime-verification succeeded, including real HTTP chat verification and browser persistence/reload verification;
- devcontainer-runtime substantive build and verification steps succeeded;
- foundry-agent-substrate succeeded;
- finops-budget-authority succeeded;
- pm-ledger-migration succeeded;
- CoMind Repository Configuration succeeded;
- No Placeholder Policy succeeded;
- Foundry Runtime Orchestration succeeded;
- Runtime Budget Authority Adapter succeeded;
- Governed Provider Execution succeeded.

The first PR-head CI cycle exposed one legacy assertion mismatch in `assistant-recovery.test.mjs`: the test deep-compared exact persisted provider metadata and did not yet account for the new `conversation_fast_path` observability object. Runtime behavior in that cycle passed. The assertion was corrected to validate fast-path strategy, history limits/counts, and numeric timing fields separately while retaining exact comparison for existing provider metadata. The corrected head passed the conversation lifecycle integration test.

## Scope deliberately deferred

- provider token streaming, SSE, or WebSocket transport;
- generic background worker or transactional outbox framework without a current concrete workload;
- autonomous Foundry scheduling or Council Drill execution;
- Issue #72 governed provider failure-recovery hardening;
- external adapter activation;
- live Supabase mutation;
- production deployment.

## Safety and cost state

- Live Supabase mutation: none.
- Paid provider request: none.
- Live provider token-count request: none.
- External Foundry adapter execution: none.
- Production deployment: none.
- Credentials or secret values exposed: none.
- C3/C4 authority enabled: none.

Issue #72 remains queued and independent. It is still required before autonomous real cost-bearing provider execution, but it was not required for this deterministic conversation latency milestone.

## Connector artifacts

Connector function-selection errors accidentally created Issues #79, #80, and #81 while establishing the authorized lane. Each was immediately retitled as an accidental connector artifact and closed `not_planned`. No branch, commit, pull request, or implementation work is associated with those issues. Issue #78 is the sole implementation milestone for this conversation.

## Merge boundary

PR #82 must remain unmerged until its final provenance-adjusted head is independently re-read and every permanent check on that exact head reaches terminal success. Merge remains a separate controlled action.