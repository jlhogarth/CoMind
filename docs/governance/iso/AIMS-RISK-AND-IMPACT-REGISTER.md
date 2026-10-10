# CoMind AIMS Risk and Impact Register Contract

Date: 2026-10-10
Status: Controlled design contract. No database migration is introduced by GOV-001.

## Purpose

Define the minimum record needed to manage AI-related risk and impact consistently across CoMind without creating a second runtime authority system.

## Record fields

Each risk/impact record should contain:

- stable `risk_id`;
- title and concise risk statement;
- asset/system/agent/project/supplier scope;
- affected stakeholders and potential harms;
- threat/hazard source and initiating conditions;
- existing controls and evidence references;
- inherent likelihood and impact using a documented scale;
- inherent risk rating;
- privacy, security, safety, reliability, financial, legal, human-rights/fairness, accessibility, reputational, operational, and autonomy/delegation impact flags where applicable;
- treatment choice: avoid, reduce, transfer/share, accept, monitor, or retire the activity;
- treatment actions, owners, due dates and dependencies;
- residual likelihood, impact and risk after treatment;
- risk acceptance authority and decision evidence when acceptance is permitted;
- review cadence and next review date;
- trigger-based review conditions;
- linked incidents, exceptions, nonconformities and corrective actions;
- applicable framework/version references;
- evidence state and evidence freshness;
- created/updated/closed timestamps and actor identity;
- closure basis and retained evidence.

## Risk-rating discipline

The scoring method must be documented and stable enough for longitudinal comparison. It must not imply false precision. High or critical ratings require explicit human ownership and treatment/acceptance authority. Agent consensus is not risk acceptance.

At minimum, assess:

- severity/impact magnitude;
- likelihood/exposure;
- detectability where it materially affects response;
- blast radius and reversibility;
- persistence/propagation through memory or derived data;
- authority available to the affected agent/tool;
- external dependency and supplier concentration;
- recovery time and evidence survivability;
- affected user/stakeholder sensitivity.

## Required Virtual Employee risk themes

The Foundry risk register should explicitly cover:

1. goal/instruction hijack and prompt injection;
2. excessive agency or authority drift;
3. identity/privilege abuse and stale grants;
4. tool misuse and unsafe side effects;
5. agentic and model supply-chain compromise;
6. unexpected code execution or unsafe generated operations;
7. sensitive information disclosure or unauthorized memory retrieval;
8. poisoned/incorrect memory, RAG, knowledge or evidence;
9. unbounded loops, duplicated work, cost explosion or denial of service;
10. silent delegated-work loss, orphaned work leases or failed notifications;
11. inter-agent collusion, amplification, deadlock or false consensus;
12. ungrounded claims, evidence fabrication or provenance loss;
13. rollback/recovery failure and corrupted checkpoints;
14. model/provider behavior change without reassessment;
15. monitoring blind spots and stale compliance evidence;
16. human-approval fatigue, misleading summaries or unsafe default approvals;
17. cross-tenant/project data leakage;
18. governance controls degrading interactive performance to an unacceptable level.

## Impact assessment triggers

A new or refreshed assessment is required when a change materially affects:

- AI model/provider;
- agent authority or capability;
- data class, retention or external data flow;
- user/stakeholder population or use case;
- health, employment, financial, legal, safety or other consequential decision context;
- memory/retrieval behavior;
- new external tool or connector;
- production deployment boundary;
- autonomous scheduling/delegation;
- security/privacy architecture;
- incident history or threat intelligence;
- standards/regulatory applicability.

## Treatment and acceptance

Risk treatment must reference implementation/evidence, not merely a promise. Residual risk acceptance must identify the human authority, decision date, scope, duration/review date, rationale and evidence. Time-bounded exceptions are preferred to indefinite waivers.

ISO may prepare a risk record, identify evidence gaps and recommend treatment. ISO may not accept risk for CoMind.

## Relationship to T0-T3 and C0-C4

- T0-T3 describes engineering governance burden for a change/capability.
- C0-C4 describes authority limits and approval boundaries.
- The AIMS risk register records the underlying risk/impact and treatment.

These dimensions may inform one another but must not be collapsed into one numeric scale.

## Evidence rules

Risk reviews must preserve prior states so CoMind can reconstruct why a risk rating or treatment changed. Evidence references should point to authoritative artifacts rather than duplicate sensitive content. Missing evidence is recorded as a gap, never inferred.

## Initial owner model

- Risk owner: human accountable party for understanding and managing the risk.
- Control owner: party responsible for implementing/operating a treatment control.
- ISO: registry steward and evidence/gap reporter in shadow mode.
- Independent reviewer/auditor: evaluates whether process and evidence are adequate.
- Management owner: approves risk appetite and material exceptions within organizational authority.

The actual people and legal roles must be assigned before this becomes an operating AIMS record.