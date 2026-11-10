# AGCOL-002 bounded parallel collaboration and MCP Test slice

Issue #553 continues the merged sequential AGCOL-001 pilot. This slice is T2 because specialist handoffs create cross-agent state and governed Foundry executions. It is isolated Test code, not a Production activation or an enterprise certification claim.

## Execution contract

`runParallelCollaboration` takes an acyclic graph of 2–32 tasks, at most eight in flight, with distinct profile and task identities. Independent roots may start concurrently. A dependent task receives canonical predecessor receipts in declared order only after every predecessor returns successful terminal execution and matching evidence. The accountable `authorize` callback supplies an exact task-specific decision after the join; the coordinator never fabricates or shares decisions. Foundry independently checks the profile, capability, scoped grant, request/decision binding, environment, budget and idempotency. Failed work blocks new scheduling; already running work drains to a terminal result. The returned receipts are ordered by the submitted graph, not completion timing.

An adapter through `createReadOnlyMcpAdapter` is restricted to C1, `read`, `evidence_resource`, a bounded target reference and synthetic input. A local MCP process performs `initialize`, `tools/list`, and `tools/call` over JSON-RPC stdio with an exact single-tool allowlist. The fixture reads only deterministic synthetic evidence, uses no network or credentials, and returns a strictly validated four-field resource record. No arbitrary tool text is passed as an instruction. Receipt persistence is supplied by the host before Foundry reports a successful adapter result. It captures operation/context identity, request/result fingerprints, resource, source, elapsed time and zero fixture cost.

## Boundaries and recovery

These modules do not register themselves as live Foundry capabilities or mint grants. The application must bind an allowlisted capability to the adapter, supply an independent authorization authority and a durable receipt writer. The fixture MCP server is deliberately confined to Test. The graph's in-process memory is not a durable queue; a process crash requires reconciliation through Foundry's existing execution context and recovery checkpoint before replay. The current deterministic tests prove scheduling and protocol trust controls. They do not prove Supabase Test lineage, revocation, stale grants, wrong project, crash recovery, reviewer dissent propagation, or per-provider resource charge accounting. Those remain acceptance work in #553. Do not turn on Production or describe the agents as enterprise-ready on this evidence.

## Traceability

- Authority: GOV-001 T2 and Foundry C1 isolated checks, separate human authority for Production.
- Identities/resources: distinct specialist Foundry profiles, task IDs, plan/resource target, fixture MCP tool.
- Controls: grant and authorization checks in Foundry; bounded concurrency and evidence join here; strict MCP input/output allowlist; no credentials in model input.
- Failure: failed specialist blocks dependent scheduling, in-flight operations drain, host reconciles any persisted orphan or revoked grant.
- Validation: exact-head AGCOL-002 workflow builds server and runs graph, protocol and AGCOL-001 regression tests. Live Test evidence and independent readback must be attached before closing #553.
- Latency/cost: each completed specialist receipt records elapsed milliseconds; MCP fixture receipt records elapsed milliseconds and zero direct tool cost. Host and model overhead are not measured here.
