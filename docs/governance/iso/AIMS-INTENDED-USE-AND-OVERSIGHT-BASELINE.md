# CoMind AIMS Intended-Use and Human-Oversight Baseline

Date: 2026-10-10  
Status: GOV-003 controlled initial system boundary. Not a production-autonomy authorization.

## Purpose

Translate the machine-readable system inventory into a human-operable boundary for current CoMind components. This document describes what current evidence supports, not the complete future CoMind product vision.

Source of truth for row-level lifecycle/evidence/deployment state: `aims-system-inventory.csv`.

## Current system boundary

| System | Intended use | Explicitly prohibited / unsupported at this evidence state | Human oversight boundary |
| --- | --- | --- | --- |
| `SYS-CHAT-001` CoMind conversation and assistant runtime | Persist conversations/messages and, when explicitly configured, generate assistant responses through an injected provider. | No claim of production OpenAI enablement; no consequential autonomous external actions; no agent/tool authority inferred from chat availability. | User initiates interaction; operators control provider enablement and deployment; failed generation must not erase persisted user input. |
| `SYS-PROV-001` Governed provider execution | Bound cost-bearing provider attempts to immutable identity, trustworthy preflight, conservative exposure, durable reservation, replay prevention, telemetry and settlement. | No automatic retry behind one authorization; no cost-bearing provider action without effective reservation authority; no claim ordinary assistant traffic is already routed through this layer in production. | Budget/authorization policy and any retry authority remain human-governed; later provider activation requires current live authority substrate. |
| `SYS-FOUND-001` Virtual Employee Foundry | Provide durable identity/profile, capability/grant, authorization, execution, recovery, deliberation and provider-independent broker contracts. | No production autonomous VE; no C3/C4 execution; no external adapter activation based solely on repository code or isolated tests. | Consequential grants and decisions remain human-authorized; accepted broker evidence is isolated and C0-C2 only. |
| `SYS-WORK-001` Foundry work-lease kernel | Prevent duplicate concurrent work ownership through bounded leases and fencing. | Lease ownership is never capability, authorization, budget or adapter authority; no autonomous worker/poller is established. | Any worker that may exist later must still pass the full Foundry authority chain before real work. |
| `SYS-FIN-001` Runtime budget authority / FinOps | Bind provider/runtime work to explicit monetary authority, reservation, telemetry and settlement. | Code presence is not spending permission; no production paid action may rely on repository-only budget tables. | Human management retains financial authority and material exception authority; live substrate must exist and be verified before production use. |
| `SYS-DATA-001` Live Supabase data platform | Host the currently deployed base `comind` schema, PM-ledger migrations and module registry. | Do not represent it as Foundry/security hardened; do not infer least privilege or safe production autonomy from project health/table availability. | Production DDL/DML/configuration changes require explicit authority; GOV-003 remains read-only. |
| `SYS-MEM-001` Live memory/vector/knowledge schema | Provide PostgreSQL/pgvector-capable schema primitives for future memory, embeddings, documents/chunks and knowledge graph. | Do not claim active RAG, populated persistent memory, vector retrieval or knowledge operation. Current observation found zero rows across the six material memory/knowledge tables. | Ingestion/retrieval activation requires data authority, provenance, quality, retention/access rules and system-level risk review. |

## Current Virtual Employee / module boundary

The live `cm_agent` table contained **zero rows** at the GOV-003 observation time. Therefore no live Virtual Employee instance is included as an active system identity.

The five enabled `cm_module_registry` rows are retained as **module metadata**, not as proof of active agents or autonomous runtime execution:

- Causal-Probabilistic Scaffold;
- Future Continuity;
- Legacy Beacon;
- SET Tier;
- SOAP.

The repository Foundry substrate can represent future agents, but live agent activation remains blocked by the deployment/security gap documented in the AIMS evidence set.

## OpenAI boundary

The current codebase supports an OpenAI assistant provider and contains the official OpenAI Node SDK (`7.28.0`). The environment defaults the assistant provider to disabled.

A real OpenAI response was previously verified through the guarded paid smoke path against isolated `comind_runtime`; that proves the external adapter can work under the guarded test configuration. It does not prove production provider enablement.

The later governed-provider execution wrapper has stronger cost/replay/settlement controls, but repository provenance states that ordinary configured assistant traffic was not silently switched to that wrapper. Production convergence of those paths remains future implementation work.

## Supabase / data boundary

Live CoMind Supabase is an active supporting dependency, not evidence that every repository migration or control is deployed.

Current read-only evidence confirms:

- PostgreSQL 17.11 in `us-east-1`;
- 79 `comind` tables;
- only the initial build plus two PM-ledger migrations in live migration history;
- zero live `cm_agent` rows;
- later Foundry/runtime-budget migrations absent;
- the known live RLS/search-path security blocker remains unsuperseded;
- memory/vector/knowledge tables exist but the observed material tables are empty.

## Required human approval points before consequential operation

At minimum, human authority remains required for:

1. any production database migration or security-policy change;
2. production provider enablement or material paid-provider budget/limit change;
3. creation/activation of live VE profiles or capability grants;
4. C3/C4 authority or any destructive/regulated/high-impact capability;
5. external adapter credentials and scopes;
6. new sensitive data classes, retention changes or memory/RAG ingestion;
7. material supplier/provider/model changes;
8. risk acceptance for high/critical residual risks;
9. certification/conformity claims;
10. exceptions that weaken a current security, evidence, cost, recovery or human-oversight boundary.

## Stop conditions

Production autonomy remains prohibited when any of the following is true:

- required live identity/capability/authorization/budget substrate is absent;
- live database security prerequisites are not verified;
- authority cannot be tied to a human-approved scope;
- required recovery/rollback evidence is absent;
- provider/model/data change has not been reassessed;
- consequential system risk lacks a named human owner and treatment;
- evidence state is repository/isolated only but the proposed action requires deployed/operating evidence.

These are management-system boundaries, not claims that ISO/IEC 42001 requires this exact wording. ISO-specific normative verification remains funding-gated and pending lawful source access.
