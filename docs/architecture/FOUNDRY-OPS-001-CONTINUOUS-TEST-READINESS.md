# Foundry continuous Test readiness audit

**Issue:** [FOUNDRY-OPS-001 #569](https://github.com/jlhogarth/CoMind/issues/569)  
**Audit date:** 2026-11-21  
**Decision:** Continuous integration and autonomous recovery are proven in ephemeral Test environments. A persistent, continuously running Foundry Test service is **not deployed or ready for activation**.

## Verified foundations

| Area | Evidence | What it proves |
|---|---|---|
| Live Foundry handoff | [Run #39918058517](https://github.com/jlhogarth/CoMind/actions/runs/39918058517); [#161 evidence](../provenance/2026-10-23-foundry-live-test-evidence.md) | One synthetic Test task completed once through local Ollama, with lease, execution and result readback. |
| Foundry lifecycle | [PR #175](https://github.com/jlhogarth/CoMind/pull/175), merged as `f75d6212be643eb60198694e4b6523692f3f4256) | Isolated tests cover atomic terminal outcomes and canonical terminal projections. The acceptance note explicitly says no new live dispatch was performed. |
| Temporal and AED recovery | [AED architecture/proof](AED-002-TEMPORAL-DURABLE-LIVENESS.md); [PR #456](https://github.com/jlhogarth/CoMind/pull/456) | CI proves Temporal signal/timer wake, worker restart/replay, CLEAR gating, fenced recovery and semantic progress using synthetic data. |
| Multi-agent Test pilot | [PR #549](https://github.com/jlhogarth/CoMind/pull/549); [AGCOL provenance](../provenance/2026-11-09-agcol-001-collaboration.md) | One bounded ten-role sequential collaboration completed in Test with local Ollama and grant cleanup. It does not prove a persistent worker. |
| Work evidence | [AED-007 #540](https://github.com/jlhogarth/CoMind/issues/540) | Telemetry and interruption recovery are partially accepted; always-on deployment and other evidence integrations are not claimed. |

## Runtime gap

The accepted Temporal proof workflow starts a pinned Temporal development server inside a GitHub Actions job, runs the synthetic proof, then removes that server at job end. It provides continuous integration on pull requests and autonomous recovery *within the test run*, not a continuously available service.

The production code exports `startAedTemporalWorker({ address, namespace, taskQueue })`, but no Foundry Temporal server/worker deployment is currently configured on the connected hosts. The recovery activities enforce an isolated database URL: `localhost`, `127.0.0.1`, or `db`, with database `comind_ci`. They cannot currently connect to the live Supabase Test pooler.

The live Foundry one-shot workflow is manually dispatched, verifies a single task and one attempt, and stops. It neither operates as an always-on worker nor continuously creates/re-arms tasks.

## Hosting inventory checked read-only

- **Cloudflare:** the connected account has four Worker scripts, for the approval portal, Console proxy, WEB-001 ingestion Test and WEB-001 preview. No Foundry or Temporal worker is present.
- **Render:** the connected workspace has no services.
- **Railway:** the connected `CoMind OC-002 Acceptance` project contains the Operator Console and RunBook/CBE acceptance resources. The RunBook scheduler has a staged configuration and no deployment; it belongs to DRB-004 #555/#561 and must not be activated or repurposed here. No Foundry/Temporal service is deployed.
- **Temporal:** existing proofs use the pinned development service only inside ephemeral CI. No Temporal Cloud service is configured or authorized.

These observations do not establish hosting account pricing or entitlement. No service was created, changed, deployed, or billed during this audit.

## Readiness definition and next gates

A Foundry process is ready for **continuous autonomous Test execution** only after all of these are demonstrated together:

1. A persistent Temporal service and Foundry worker can restart without losing workflow state.
2. A restricted Test identity reaches only the exact CoMind Test project and its approved Foundry capabilities.
3. Synthetic task admission is bounded by rate, concurrency, attempt count, authority, grant expiry and cost policy.
4. Event-first wake and durable timer fallback work without GitHub schedule as the liveness clock.
5. CLEAR, lease fencing, task finalization, semantic-progress verification, pause/revoke and emergency stop pass on the deployed Test runtime.
6. Ollama/local model execution is observed with bounded latency/resource evidence and no OpenAI or paid provider call.
7. A soak run demonstrates restart recovery, idempotency, no orphaned grants, clean shutdown and independent Supabase/RunBook/Console/AED readback.
8. A durable evidence record identifies the exact image/commit, configuration, runtime identity, Supabase target, model, task outcomes, resource observations and all limits.

## Safe go/no-go

**Current result: NO-GO for persistent runtime activation.** The proof foundations are strong, but no already-deployed no-cost host for the required persistent Temporal server plus worker was found. The staged Railway RunBook scheduler is a separate lane and cannot be presumed available or free.

Continue with code, deterministic tests, configuration and host-neutral acceptance work under #569. Before any deployment, prove an existing authorized no-cost host or obtain explicit fiscal approval for an appropriate host. Do not claim “continuous” from a GitHub Actions PR check, a manually dispatched one-shot task, a local development server or a closed readiness issue. No Production activation is in scope.
