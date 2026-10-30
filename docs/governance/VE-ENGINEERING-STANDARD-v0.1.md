# CoMind Virtual Employee Engineering Standard v0.1

Status: Draft implementation standard
Control ID: VE-STD-001
Scope: CoMind Virtual Employees, agent colonies, external-resource projections, and delegated agent work
Authority boundary: This standard does not itself grant runtime authority

## 1. Purpose

A CoMind Virtual Employee (VE) is a governed CoMind actor and agent operating under explicit purpose, authority, capability, resource, evidence, supervision, and lifecycle controls. A VE is not defined by an email address, model session, provider account, credential, or external resource.

This standard treats VE creation and operation as a human-organizational simulation with machine-enforceable controls. The design goal is to support future colonies of cooperating VEs without allowing identity, authority, delegation, cost, evidence, or lifecycle state to become implicit.

## 2. Canonical invariants

1. CoMind owns the canonical VE identity. External providers expose resources or projections of that identity.
2. Identity is distinct from authority.
3. Authority is deny-by-default, bounded, attributable to a grantor, scoped, time-aware, and revocable.
4. Capabilities are distinct from roles. A role may justify capabilities but does not silently create them.
5. A VE cannot increase its own authority, approve its own authority increase, or create transitive privilege by collaboration.
6. Delegation must be explicit, bounded by the delegator's delegable authority, attributable, expiring where appropriate, and independently auditable.
7. Spending authority is separate from functional authority. Cost-bearing operations require explicit budget provenance and controls.
8. External resources never become the canonical identity registry.
9. Lifecycle actions fail closed. Suspension removes operational authority before or while external resources are reconciled.
10. Retirement destroys operational authority, not provenance. Historical identity, work, evidence, decisions, and audit records remain.
11. Partial provider failure is a first-class state requiring durable evidence and reconciliation. It must not silently reopen local authority.
12. Authorization expiration removes the associated permission. Expiration is not implicit renewal.
13. Every consequential VE action must be attributable to an actor, authority envelope, capability, target, environment, and evidence trail.
14. Colony membership never implies trust inheritance. Inter-agent communication and delegation are governed boundaries.
15. Production authority requires the applicable CoMind production acceptance gates and explicit authorization.

## 3. Required VE control record

Every VE MUST have an inspectable control record answering:

- Who owns its canonical identity?
- What is its purpose and organizational role?
- What authority floor and ceiling apply?
- Who granted each capability or authorization, on what basis, and for how long?
- What resources can it access and which provider owns each projection?
- What may it spend, from which budget, with what cap, retries, and stopping conditions?
- What evidence must it preserve and where is that evidence authoritative?
- What happens when an authorization or credential expires?
- May it delegate, to whom, what, under which ceiling, and with what expiry?
- How is it suspended and what fails closed first?
- What happens when an external provider partially fails?
- Who may reactivate it and under what fresh authorization?
- How is it retired without destroying provenance?
- What independent review, monitoring, escalation, and acceptance requirements apply?

A VE is not acceptance-ready while any applicable answer is unknown, implicit, contradictory, or represented only in prose when an enforceable control is required.

## 4. Lifecycle

Canonical lifecycle states are `draft`, `active`, `suspended`, and `retired`.

### Draft
Identity and policy may exist, but operational execution is not implied. Required controls, resources, tests, and approvals are assembled here.

### Active
The VE may operate only within current grants, authorizations, environment boundaries, budgets, and provider-resource states.

### Suspended
New governed execution fails closed. Active capability grants are revoked or quarantined as defined by the lifecycle implementation, pending authorizations are cancelled where applicable, schedules and external access are reconciled, and failures are recorded for repair. Provenance remains.

### Retired
Operational authority is permanently removed unless a future governance process explicitly defines a successor identity. External resources are revoked, retired, transferred, or preserved according to evidence and retention policy. Canonical history is retained.

Reactivation from suspension requires fresh applicable authorization and successful reconciliation of required resources. Retirement is not ordinary suspension and MUST NOT be treated as reversible by default.

## 5. Colony governance

A colony is a governed set of actors coordinating work. Colony membership MUST NOT create implicit authority.

Each inter-agent request must preserve, directly or through durable execution context:

- requesting actor and profile;
- receiving actor and profile;
- purpose/task identity;
- requested capability;
- authority and delegation provenance;
- target and environment;
- applicable budget provenance;
- evidence/source requirements;
- expiration or bounded execution window;
- outcome and failure evidence.

Delegation cannot exceed the minimum of the delegator's authority, the receiver's authority ceiling, capability maximum authority, grant scope, environment boundary, project/task scope, and budget boundary. A receiver cannot infer permission from reputation, role title, colony membership, prior cooperation, or another agent's assertion.

Cascading failure must be containable. A failed, compromised, expired, suspended, or retired member must not cause peer agents to inherit or recreate its privileges.

## 6. Human authority and supervision

Human authority remains explicit. Human approval must identify the approving actor and the exact authorization envelope. Approval of one action does not imply approval of later actions, broader targets, higher authority, different environments, additional spending, or delegation unless explicitly encoded.

VEs must surface material uncertainty, conflicts, boundary conditions, failed reconciliation, and requests for authority beyond their envelope rather than improvising authority.

## 7. External-resource model

External resources are provider projections bound to canonical CoMind actors. Examples include Google Workspace identities, Drive access, calendars, GitHub identities, SaaS accounts, credentials, and API access.

Provisioning an external resource MUST NOT automatically activate the VE. Removing one resource MUST NOT delete the canonical VE. Provider state must be reconciled against CoMind lifecycle state and discrepancies must be visible.

Credentials and secrets are never stored as descriptive metadata merely because the resource record exists.

## 8. Cost and paid operations

Cost-bearing capabilities require explicit budget binding before execution. At minimum the governed record must include purpose, expected benefit, provider/model or service, current pricing basis, expected cost, maximum cap, request/token or equivalent limits, retry limits, stopping conditions, project, agent/run provenance, actual usage, and actual expense when known.

A VE may not infer spending authority from functional capability or from access to a credential.

## 9. Evidence and provenance

VE evidence must support reconstruction of who did what, under which authority, against which target, using which relevant sources/resources, with what result, and with what failure or uncertainty.

Evidence requirements include lifecycle events, authorization requests and decisions, grants/revocations, execution context and outcome, provider reconciliation, budget provenance for cost-bearing operations, independent review where required, and retained work-product/source provenance.

Evidence systems are authoritative according to their owning domain. UI projections, dashboards, summaries, and colony views do not become authority merely by aggregating evidence.

## 10. Security and assurance baseline

VE design uses least privilege and least agency. Tools, autonomy, network/resource access, memory access, delegation, and persistence are limited to what the assigned purpose requires.

Threat modeling must consider at least goal hijacking, prompt or instruction injection, tool misuse, identity and privilege abuse, memory poisoning, insecure inter-agent communication, excessive delegation, supply-chain compromise, cascading failure, provider inconsistency, rogue behavior, and evidence tampering.

Security verification is risk-tiered. CoMind targets OWASP AISVS Level 1 as the minimum design baseline, Level 2 for production or consequential VEs, and selected Level 3 controls for high-assurance or critical authority. Applicability and exceptions must be documented rather than silently ignored.

## 11. External standards crosswalk

### NIST AI RMF 1.0

- GOVERN: VE policies, roles, accountability, authority, lifecycle, documentation, risk tolerance, and decommissioning controls.
- MAP: intended purpose, operating context, users/affected actors, resources, dependencies, misuse, colony relationships, and impact boundaries.
- MEASURE: pre-activation testing, runtime monitoring, security verification, capability evaluation, drift/failure measurement, and independent review.
- MANAGE: risk prioritization, authorization decisions, fail-closed controls, incident/reconciliation response, suspension, reactivation, retirement, and continual improvement.

NIST's functions are treated as continuous risk-management functions, not a one-time ordered checklist.

### ISO/IEC 42001:2023

The VE program is governed as part of CoMind's AI Management System (AIMS): organizational context, leadership/accountability, planning, support and competence, controlled operation, performance evaluation, documented information, corrective action, and continual improvement. VE records provide inspectable operational evidence for those management-system responsibilities. ISO alignment does not imply certification.

### OWASP Agentic Security Initiative and Top 10 for Agentic Applications

VE controls explicitly address autonomous/agentic risks through bounded goals, least agency, tool/resource allowlisting, explicit identity and privilege, non-transitive trust, protected memory/evidence, secure inter-agent boundaries, containment, monitoring, revocation, and human escalation. Colony design treats goal hijacking, tool misuse, identity/privilege abuse, memory poisoning, insecure inter-agent communication, cascading failures, trust exploitation, and rogue agents as architectural threat classes.

### OWASP AISVS 1.0

AISVS is used as the testable security-requirements catalogue. Requirement applicability is recorded by VE/system risk tier, with verification evidence linked to acceptance. Level 1 is the minimum baseline; Level 2 is the target for production/consequential VEs; selected Level 3 controls apply where risk warrants them.

## 12. Creation and acceptance workflow

Each VE follows this governed sequence:

1. Define purpose, owner/supervisor, expected benefit, prohibited uses, and retirement trigger.
2. Create canonical actor and agent identity.
3. Create draft Foundry profile with authority floor/ceiling and instruction version.
4. Establish operating policy, evidence obligations, independent review, failure reporting, and acceptance stage.
5. Threat-model the VE and classify risk.
6. Define required capabilities and explicitly excluded capabilities.
7. Create bounded grants and authorization rules. No self-escalation.
8. Define budget authority separately, if any.
9. Bind only necessary external resources.
10. Test in isolated/synthetic conditions, including negative authorization and failure paths.
11. Reconcile provider resources and verify observability/audit evidence.
12. Obtain explicit activation authorization.
13. Activate with minimum viable authority.
14. Monitor behavior, evidence, costs, expiry, drift, and incidents.
15. Periodically reassess capabilities, resources, authority, and necessity.
16. Suspend on material control failure or when required by governance.
17. Reactivate only after remediation and fresh applicable authorization.
18. Retire by removing authority/resources while preserving provenance and required records.

## 13. First worked implementation: Scout

The first full implementation under this standard will be `Scout`, an Emerging Technology Research Analyst.

Initial design intent:

- benign but useful research role;
- isolated/Test first;
- C1 initial operational ceiling unless a specific acceptance step justifies otherwise;
- web/public research and approved CoMind research access;
- evidence/source capture required;
- no production mutation;
- no Cloudflare authority;
- no Supabase write authority initially;
- no GitHub write authority initially;
- no self-delegation or VE-creation authority;
- no paid API authority without the separate governed paid-access process;
- external email sending requires human approval initially;
- Google resource provisioning is a provider projection, not canonical identity creation.

Scout's implementation record will serve as the worked example and acceptance evidence for VE-STD-001.

## 14. Change control

Changes that weaken identity, authority, evidence, cost, lifecycle, delegation, or fail-closed guarantees require explicit review and rationale. Future versions may strengthen or specialize controls by VE risk tier. Rejected alternatives and reconsideration triggers should be retained for consequential design decisions.

## 15. Reference basis

- NIST AI Risk Management Framework 1.0, NIST AI 100-1.
- NIST AI RMF Playbook.
- ISO/IEC 42001:2023, Artificial intelligence management system.
- OWASP Agentic Security Initiative and OWASP Top 10 for Agentic Applications.
- OWASP Artificial Intelligence Security Verification Standard (AISVS) 1.0.

External standards remain independently authoritative. This CoMind standard is an implementation profile and governance synthesis, not a replacement for their normative text.