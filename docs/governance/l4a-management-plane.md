# L4A Development Management Plane

**Status:** Canonical Development/Test architecture  
**Foundation milestone:** L4A-MP-001  
**Foundation issue:** https://github.com/jlhogarth/CoMind/issues/429  
**Current continuation milestone:** L4A-MP-004  
**Current issue:** https://github.com/jlhogarth/CoMind/issues/460  
**Production authority:** Not granted

## Architectural role

L4A is the management plane for the CoMind development organization. Individual ChatGPT conversations, Work sessions, agents, and other execution surfaces are subordinate interfaces into development lanes. They do not own organizational truth merely because they contain recent conversational context.

Canonical durable evidence outranks conversational recollection. A controller or development lane reconstructs state from the current Development Environment Contract, durable authorization, RunBook/evidence, repository state, and other governed sources before consequential work.

The management plane owns continuity semantics. An execution surface may disappear, lose context, exhaust quota, or require authentication without erasing the durable Development Lane. The lane remains a governed organizational object with state, authority, dependencies, next action, evidence, and recovery semantics.

## Decision-complete continuation

The canonical Development Environment Contract v1.2 adds the L4A-MP-004 Decision-Complete and No-Idle Continuation invariant.

When an authorized lane has a known dependency-valid reversible next action and an available governed execution surface, the management plane must select execution rather than stopping at a recommendation. A status report, proposed next step, heartbeat, or conversational handoff is not semantic progress when the system can perform the work itself.

A lane may remain idle only for a bounded wait, active external execution, explicit dependency block, mandatory human or platform stop, unavailable execution substrate, or genuinely unresolved next action.

This rule changes continuation behavior, not authority. Production, security, cost, legal, credential, publication, and irreversible-operation gates remain unchanged.

## Scheduler and execution actuator kernel

L4A-MP-004 introduces a provider-neutral scheduler and execution-actuator boundary.

Target control flow:

`RunBook/RuleBook -> scheduler -> CLEAR/authority/dependency/freshness -> canonical lease -> actuator -> execution surface -> evidence -> semantic progress -> release/continue/escalate`

The scheduler returns explicit dispositions:

- `EXECUTE`: authorized work has a matching actuator and must continue;
- `WAIT`: a bounded wait exists with a concrete wake condition;
- `BLOCK`: a dependency, claim, freshness, collision, or other non-human safety condition prevents dispatch;
- `ESCALATE`: a mandatory human, authority, Production, or platform boundary requires intervention;
- `UNAVAILABLE`: the required execution surface has no autonomous actuator;
- `COMPLETE`: the lane is terminal or no longer an actionable development object.

The first repository actuator is a zero-cost classification and dispatch-envelope boundary for repository/GitHub work already executable through governed connectors or workflows. It does not invent provider capability and it does not claim to wake a dormant ChatGPT conversation. Unsupported surfaces such as `chatgpt-conversation` remain explicitly `UNAVAILABLE` until a real autonomous actuator exists.

Every execution envelope carries durable lane identity, next action, authority reference, selected execution surface, expected evidence, canonical lease requirement, non-Production/cost flags, and a deterministic idempotency key. A valid active canonical claim prevents duplicate dispatch. An expired claim may be reacquired only through canonical lease semantics.

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

## Runtime capability binding

The deployed Console does not require a Supabase service-role key. The internal zero-argument management RPC remains service-role-only for governed backend use. The server-facing runtime calls a separate overload with a dedicated capability, `l4a_management_v1`, over the browser-safe Supabase publishable-key channel.

Only the SHA-256 digest of the dedicated capability is stored in `comind.cm_operator_console_read_capability`. The plaintext capability exists only in the protected Console server environment variable `OPERATOR_CONSOLE_MANAGEMENT_CAPABILITY`. The capability is distinct from the Activity HUD capability so compromise or rotation of one read surface does not silently grant access to the other.

The capability wrapper is executable by the Supabase `anon` role only because the wrapper itself performs the secret comparison inside a `SECURITY DEFINER` boundary. `authenticated` and `PUBLIC` do not receive execute permission. The underlying zero-argument management RPC remains unavailable to `anon` and `authenticated`.

Repository tests and the migration verifier use synthetic capability strings only. The verifier temporarily replaces the capability hash inside a transaction and rolls the transaction back, preserving any real runtime binding. Creating, rotating, or binding the real runtime capability is a security-sensitive operation and remains separately authorized.

## Operationalization boundary

L4A-MP-004 does not by itself provide a persistent host for arbitrary cognitive execution. Persistent Temporal workers, event subscriptions, local Ollama worker hosting, OpenAI/API-backed cognitive workers, or any other always-on execution substrate are successor concerns.

Those successors must reuse this scheduler and actuator contract rather than creating a parallel authority or lease system. Any paid service, new infrastructure spend, Production activation, credential expansion, or broader mutation authority remains separately governed.
