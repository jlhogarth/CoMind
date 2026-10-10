# CoMind AIMS Audit, Management Review, and Corrective Action Process

Date: 2026-10-10
Status: Controlled draft operating process. No certification or audit engagement is implied.

## Purpose

Establish the minimum recurring management-system processes needed to turn governance documents into an operating, inspectable AIMS.

## Internal audit

Internal audit evaluates whether the AIMS is being followed and whether evidence supports control claims. Audit must be sufficiently independent from the work under review to avoid self-approval.

### Audit inputs

- approved AIMS scope and policies;
- standards applicability register;
- control-to-evidence matrix;
- risk and impact register;
- system/supplier inventory;
- exceptions and risk acceptances;
- incidents and corrective actions;
- change/release evidence;
- tests, workflow results and deployment evidence;
- access/authority records;
- performance/FinOps evidence;
- prior audit findings and management-review actions.

### Audit record

Each audit should preserve: audit ID, scope, criteria/framework/version, auditor/reviewer, independence statement, sampling method, dates, evidence inspected, findings, severity, evidence gaps, conclusion, required actions, owners, due dates and closure evidence.

A passing CI run is evidence for a technical control, not an AIMS internal audit.

## Finding categories

- **Observation:** improvement or risk signal not yet a nonconformity.
- **Evidence gap:** control may exist but sufficient evidence is unavailable.
- **Nonconformity:** approved requirement/process/control was not followed or effective.
- **Critical governance breach:** unauthorized consequential action, evidence tampering, material uncontrolled risk, or false compliance/certification representation.

Severity must reflect actual risk and scope, not embarrassment or convenience.

## Corrective action

For nonconformities and material incidents preserve:

1. problem statement and detected condition;
2. containment action where needed;
3. affected scope and evidence preservation;
4. root-cause analysis proportionate to impact;
5. corrective action and control owner;
6. target date and dependencies;
7. regression/verification plan;
8. residual risk and temporary exception if applicable;
9. effectiveness review after implementation;
10. closure approval by an appropriate independent/human authority.

ISO may draft and track corrective actions but may not close its own findings without independent approval.

## Management review

Management review should evaluate whether the AIMS remains suitable, adequate, effective and properly resourced. The cadence should initially be at least quarterly during active system build, with extraordinary reviews after a material incident, major scope change, new consequential use case, certification decision, or significant standards/regulatory change.

### Minimum review inputs

- status of prior actions;
- changes in internal/external context and interested-party requirements;
- AIMS objectives and performance trends;
- risk profile and high/critical residual risks;
- incidents, nonconformities and corrective-action effectiveness;
- internal/external audit results;
- standards/framework changes;
- supplier changes and concentration/continuity risk;
- security/privacy/safety findings;
- delegated authority and approval trends;
- model/provider/version changes;
- resource usage, FinOps and governance overhead;
- interactive latency/performance impact;
- training/competence gaps;
- evidence freshness and unsupported claims;
- opportunities for continual improvement.

### Minimum review outputs

- decisions/actions on AIMS changes;
- risk acceptance or escalation decisions within authority;
- priorities and resource allocations;
- control improvements;
- supplier or architecture decisions;
- objective/metric changes;
- audit and certification-readiness direction;
- assigned owners and due dates.

## Proposed recurring cadence

This cadence is an initial operating design and should be adjusted based on risk and organizational maturity:

- Standards surveillance: monthly plus event-driven alerts for material revisions.
- High/critical risk review: monthly and event-driven.
- Open exception/expiry review: monthly.
- Evidence freshness scan: monthly for material controls; more frequent where technical evidence naturally updates continuously.
- Supplier reassessment: annually at minimum for material suppliers, plus trigger-based reassessment.
- Internal AIMS audit: at least annually once the AIMS is operating, with targeted audits during rapid buildout.
- Management review: quarterly during current CoMind development; may move to a different documented cadence after maturity.
- Certification-readiness review: only when management has decided certification is a current objective.

These cadences do not authorize scheduled agents or external connector access. Automation requires separate implementation and source-access authorization.

## Evidence retention

Retain sufficient records to reconstruct significant decisions and demonstrate control operation while minimizing sensitive content. The retention schedule must identify legal/contractual needs, security/privacy classifications, deletion rules, evidence immutability, backup/recovery and legal-hold needs where applicable.

## Escalation

A critical governance breach should bypass normal cadence and escalate immediately to the accountable human. If evidence integrity is compromised, preserve available evidence, stop unsupported claims, constrain affected authority where authorized, and open an incident/corrective-action path.

## Continual improvement

Improvement proposals should be measured against safety, security, privacy, reliability, human oversight, cost and performance. Governance complexity is itself a system risk. Controls that add latency or failure modes must be measured against the Interactive Runtime Performance baseline rather than assumed harmless.