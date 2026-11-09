# AGCOL-001 Governed agent collaboration contract

Date: 2026-11-09
Issue: https://github.com/jlhogarth/CoMind/issues/548
Governance: T2 bounded cross-agent Test execution, C1 specialist ceiling
Status: implementation contract, not runtime activation
Production authorization: false
Paid-provider authorization: false

## Source and adoption decision

Google Skills describes a travel-concierge exercise in which specialized agents collaborate through ADK, MCP tools and guardrails: https://www.skills.google/course_templates/1833. The related Google Cloud Tech video is https://www.youtube.com/watch?v=W54cRxp-bSA. GEAR is Google's training program. Neither course completion nor a working demonstration establishes CoMind enterprise readiness.

Adopt the coordination pattern. Keep CoMind's existing Foundry runtime, MDO plan/task/contribution chain, canonical evidence and authority services. Do not import ADK or Google Agent Runtime as a second agent execution plane simply to reproduce the course. Evaluate an ADK adapter only after a measured need is shown. An MCP endpoint is a tool transport boundary; each call still requires a CoMind capability, grant, exact authorization, scoped resource and durable receipt.

## Verified starting point

Repository main was inspected on 2026-11-09 at `be7c2c4d8c3c9811c115b40a364c5580d1354262`. MDO-002 #316 / PR #334 proved the ten-role phase chain using five reusable C1 profiles, the `mdo` Foundry adapter, local `ollama_local / qwen3:0.6b`, fenced leases, contributions and canonical evidence. MDO-003 #370 established a durable Test acceptance path. Historical proof is not proof that today's workers are running.

Live read-only Supabase Test inspection on 2026-11-09 found active profile records for five MDO roles, Scout, a Console auditor and synthetic acceptance agents. The five MDO profiles and Scout had zero current unrevoked, unexpired capability grants. Profile `active` is a lifecycle label, not an execution grant or an observed worker. No new grant, authorization, worker, provider call or external action was issued in this repository slice.

## Owned seams

- Foundry owns profile identity, capability, scoped grant, authorization, adapter operation and execution outcome.
- MDO owns planning phase order, exact task context, contributions and plan disposition.
- Foundry work leases own claim, fencing, retry and terminal completion.
- Canonical evidence and audit own source and action lineage; FinOps and provider broker own metered consumption.
- GER-004 #381 owns epistemic enforcement. This pilot consumes its accepted interface when ready and cannot mint permission from confidence.
- WSA-001 #166 owns Google Workspace adapter integration. LF-3 #133 owns Foundry security readiness. AGCOL-001 does not alter their code or schemas.
- Scout retains its canonical research identity. No role rename or implicit capability grant.

## Pilot handoff contract

The coordinator creates one bounded Test plan with exact project, task set, owner, deadline, source packet, allowed tools, provider policy, budget limit and terminal criterion. It assigns existing role profiles only when their accepted purpose and scope match the task. A handoff contains canonical plan/task/run references, predecessor evidence IDs, an input fingerprint, permitted output schema, uncertainty and explicit authority references. It contains no bearer credential or raw private provider payload.

For every specialist dispatch, re-resolve profile lifecycle, role, capability, current grant, project/environment/target scope, independent authorization, expiry, budget binding where cost-bearing, and fenced lease. A coordinator's grant never transfers to a specialist. On success, preserve canonical evidence and terminal execution outcome before accepting a contribution. On failure, preserve error code, attempt, lease state and recovery owner. A join may advance only when required contributions are complete, valid, evidence-backed and within the same plan and scope. Reviewer dissent remains visible. Human review owns final plan disposition.

The first proof uses bounded synthetic or explicitly authorized Test source material and local Ollama. Researcher, synthesizer and reviewer roles can be sequenced through the existing MDO chain. Do not imply parallel fan-out until separate dependency and join behavior is implemented and proven. No automatic external MCP call, email, document write, merge, deploy, paid model, Production action or authority escalation.

## Activation and acceptance gate

1. Reconcile current main and active PRs with the MDO/Foundry files, live migration ledger, current profile/grant state and host/provider availability.
2. Implement the smallest composition using accepted Foundry/MDO APIs. Prove deterministic handoff validation, scope separation, replay, negative authorization, failure recovery and evidence lineage in isolated PostgreSQL.
3. Verify a zero-cost local model and canonical Supabase Test identity. Issue only exact, time-limited C1 Test grants and task-specific authorization from an accountable authority, with revocation and suspension tested.
4. Execute one end-to-end Test task. Independently read back task, lease, authorization, execution outcome, evidence, contribution, provider/model, latency/resource telemetry and terminal status. Confirm the reviewer did not accept its own work.
5. Preserve exact-head CI and Test evidence in the canonical journal. Revoke pilot grants or retain only those explicitly covered by a reviewed operating contract. A runtime activation claim requires observed invocation and readback, not a status field.
6. Keep Production, paid-provider and external mutation behind separate explicit decisions.

## Failure, recovery and cost

Missing or stale grant, ambiguous identity, wrong target, untrusted tool output, insufficient evidence, lease loss, provider failure or malformed handoff stops affected dispatch. Preserve the failed attempt and a durable owner for retry or escalation. Disable/revoke the pilot grants and worker to recover without deleting provenance. Local model proof has zero external-provider charge but may consume CI or self-hosted compute; record observed time and resources before claiming economics. No certification or enterprise-ready claim follows from this contract alone.
