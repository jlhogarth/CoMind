# L4A Development Management Plane

**Status:** Canonical Development/Test architecture  
**Milestone:** L4A-MP-001  
**Issue:** https://github.com/jlhogarth/CoMind/issues/429  
**Production authority:** Not granted

## Architectural role

L4A is the management plane for the CoMind development organization. Individual ChatGPT conversations, Work sessions, agents, and other execution surfaces are subordinate interfaces into development lanes. They do not own organizational truth merely because they contain recent conversational context.

Canonical durable evidence outranks conversational recollection. A controller or development lane reconstructs state from the current Development Environment Contract, durable authorization, RunBook/evidence, repository state, and other governed sources before consequential work.

## Operator Console projection

The L4A Management Plane Console surface is a bounded read-only projection. It shows current durable lane state, open blockers, standing L4A authority, controller heartbeat observations, next actions, and GitHub/CI/freshness fields only when those fields have been explicitly recorded in canonical evidence.

Unknown information remains unknown. The Console must not infer green CI, mergeability, freshness, authentication status, or human approval from silence or old controller output.

Controller heartbeats are observations. A controller heartbeat never overrides a newer RunBook lane event, GitHub state, or durable authorization record.

## Security boundary

The browser cannot read `comind_pm` directly. The management projection is exposed through a service-role-only `SECURITY DEFINER` RPC with a fixed search path and an explicit bounded return shape. `PUBLIC`, `anon`, and `authenticated` receive no execute grant. The server-side Console uses the existing protected Supabase secret and returns only the safe projection.

The projection excludes raw event payloads and credential material including OAuth access/refresh tokens, passwords, API keys, client secrets, service-role keys, and authorization headers.

## Management states

The Console may derive presentation states only from explicit durable evidence. Examples include Working, Waiting CI, Recovery, Blocked, Auth Required, Human Stop, Stale, Ready to Merge, Review, Queued, Deferred, Complete, and Unknown. Ready to Merge requires recorded all-green check counts, recorded mergeability, and recorded freshness. Missing evidence produces Review or Unknown rather than optimism.

## Controller identities

`L4A-SUPERVISOR` and `L4A-RECOVERY` are canonical audit work items. Their automation runs append heartbeat snapshots. The heartbeat includes the automation/run identity, recorded run state, selected lane when known, whether Joseph action is required, and non-Production status. These audit items are not development lanes and therefore do not pollute `v_runbook_lane_state`.

## Source-of-truth hierarchy

1. Current explicit Joseph authorization and mandatory human stop boundaries.
2. Canonical CoMind Development Environment Contract and RuleBook.
3. Durable authorization, RunBook, evidence, and repository state.
4. Controller heartbeat observations and bounded Console projections.
5. Conversation summaries, copied prompts, and recollection.

A lower layer must not override contradictory newer evidence from a higher layer.
