# VE Management Dashboard | Future module register

Status: **Deferred, approved for planning only** (2026-10-10). Not implemented, enabled, or a GOV-001 acceptance blocker.
Program: Virtual Employee Foundry. Dependencies: governed identity, capability authority, work-lease and scheduling, checkpoint/recovery, FinOps, provenance, project management, and observability. Preserve existing agent names.

## Purpose

A role-aware operational dashboard and searchable Agent Directory that surfaces verified state of the Virtual Employee organization. Do not create a parallel source of truth or imply an agent is running merely because it is documented.

## Functional backlog

1. **Agent Directory:** canonical agent name, stable ID, descriptive role, responsibilities, competencies, declared vs verified capabilities, authority ceiling, owner, version, and deployment state.
2. **Organizational overview:** reporting and collaboration relationships, teams, projects, coverage gaps, and accountable human owner.
3. **Live operational status:** running, idle, queued, waiting for authorization, blocked, failed, suspended, recovering, retired. Show observation time, evidence source, heartbeat freshness, and unknown/stale states explicitly.
4. **Assignments:** current GitHub issues, PM tasks, milestones, priority, dependencies, acceptance criteria, estimated and observed completion; distinguish proposed vs delegated vs executing.
5. **Authority and permissions:** effective capability grants, environment/project/target scope, C-level authority, expiration, revocation, pending approvals, least privilege, and recent denials. Never expose secrets.
6. **Inter-agent coordination:** deliberation sessions, dependency handoffs, arbitration, dissent, shared context, escalation, and deadlock/blocker detection; no consensus override of human authorization.
7. **Performance and FinOps:** execution latency, queue time, checkpoint overhead, throughput, concurrency, failures, retry counts, API/provider usage and costs, per-agent budgets, and trend baselines. Reuse authoritative FinOps records.
8. **Governance and ISO:** mapped controls, evidence freshness, compliance findings, exceptions, risk owners, approvals, audit history, corrective actions, and certification-readiness indicators. Never display an unverified certification badge.
9. **Institutional memory and provenance:** decision history, knowledge references, source lineage, learning proposals, promotion decisions, and retention/classification boundaries. Do not display hidden reasoning, sensitive memories, or raw credentials.
10. **Employee profile drill-down:** role, assignments, timeline, effective grants, tests, reliability, performance, cost, recent decisions, incidents, and verified evidence.
11. **Human approval queue:** consolidated consequential action requests with scope, risk, expected cost, alternatives, blast radius, rollback plan, requester, policy evidence, expiry, separation of duties, and immutable decision audit.
12. **Operational controls:** authorized pause/suspend/resume, revoke delegation, retry or recover after fresh authorization, incident escalation, and notification preferences. Controls must go through the existing capability broker, never directly mutate protected tables.
13. **Search and explainability:** natural-language role lookup (e.g., 'Who owns database architecture?'), searchable tasks and decisions, definitions for status, evidence links, and honest unknown/unavailable states.
14. **Alerts and continuity:** stale heartbeat, stuck work lease, expiring grants, cost thresholds, missed checkpoint, CI failure, pending approval, incident, and completion. Every watch has owner, terminal condition, and cleanup policy; no silent delegated work.
15. **Security and tenancy:** role-based filtered views, tenant/project isolation, least privilege, sensitive-field redaction, accessibility, retention, and query audit.
16. **Data and UX architecture:** read models/materialized projections over authoritative Foundry, PM, FinOps, governance and provenance sources; versioned event schemas, bounded polling/streaming, backpressure, cache freshness and measured p95/p99 dashboard impact.

## Delivery stages and gates

- **D0 Directory contract:** verify actual agent inventory, canonical IDs, source-of-truth mappings, authority and operational status semantics. No UI required.
- **D1 Read-only dashboard:** role search, status, assignments, evidence timestamps, and provenance with privacy controls.
- **D2 Management visibility:** cost, latency, coordination, ISO control and audit views with performance budgets.
- **D3 Governed actions:** human approval queue and operational controls only after explicit authority, audit, and isolated failure/recovery tests.

## Non-interference requirements

This module is a **deferred Foundry backlog item**, not a new active implementation lane. Do not touch PR #86 work-lease kernel, PR #84 ACP continuity, or their database contracts without coordination. Treat Interactive Runtime Performance baseline 008 as the current monitoring reference and do not reopen that lane absent a material trigger. Prefer schema and API adapters to duplication; no production migrations, external actions, paid provider calls or autonomous activation from this backlog entry. Start implementation only after a new issue, separate branch, owner assignment, dependency review and founder authorization. Dashboard read traffic must not degrade the interactive fast path.
