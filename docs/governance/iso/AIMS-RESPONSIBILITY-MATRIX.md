# CoMind AIMS Responsibility Matrix

Date: 2026-10-10
Status: Draft organizational responsibility model. Named human assignments require management approval.

## Principle

Accountability remains human even when work is delegated to Virtual Employees. A Virtual Employee may execute or prepare work within granted authority, but organizational accountability, material risk acceptance, policy approval, certification claims, and independent audit conclusions remain human responsibilities.

## Responsibility model

| Activity | Accountable role | Responsible / supporting roles | ISO VE role | Separation requirement |
| --- | --- | --- | --- | --- |
| Approve AIMS scope and AI policy | Management owner | Architecture, security, legal/compliance advisers as applicable | Prepare evidence/gaps only | ISO cannot approve |
| Set risk appetite / material risk acceptance | Management owner or explicitly delegated human authority | Risk owner, control owner | Prepare risk evidence | Agent consensus cannot accept risk |
| Maintain standards register | Management owner for approval | Standards/control owner | Steward and monitor in shadow mode | Version adoption requires human approval |
| Maintain AI system inventory | System owner | Architecture, engineering, data/security owners | Evidence/index support | Operational source of truth remains authoritative |
| Maintain supplier inventory | Supplier/business owner | Security/privacy/legal/engineering | Evidence/index support | Supplier approval remains human |
| Perform risk/impact assessment | Risk owner | Technical/data/security stakeholders | Draft/evidence support | Acceptance separate from drafting where risk is material |
| Implement controls | Control owner | Engineering/operations/agents within authority | Observe/report | ISO should not be sole implementer and assessor |
| Verify technical controls | Verification owner / PROOF where delegated, with human accountability | Engineering/security | Index evidence | Independent verification required for high-risk claims |
| Operate security controls | Security/reliability owner | SENTRY and engineering within granted authority | Observe/report | Privilege changes require authorized owner |
| Internal AIMS audit | Independent audit/review role | Subject-matter support | Prepare evidence bundle, not final conclusion | Auditor should not audit own work where practicable |
| Close nonconformity | Appropriate human owner/reviewer | Control owner, verification | Track evidence | ISO cannot close own finding |
| Approve exceptions | Human authority matched to risk | Risk/control owner | Track expiry and evidence | Exception owner cannot be silently inferred |
| Management review | Management owner | Relevant control/risk/system owners | Prepare review package | Decisions retained as human management evidence |
| Certification engagement/claim | Management owner | Qualified external certification body where applicable | Prepare evidence only | ISO cannot certify CoMind |
| Grant/revoke VE capability | Authorized human/runtime authority per policy | Foundry identity/capability system | No self-service authority | VE may not expand own grants |
| Incident declaration/escalation | Authorized incident owner | Security/operations/engineering | Detect/report in permitted scope | Evidence preserved; containment authority explicit |

## Human roles to designate before operating AIMS

- AIMS management owner.
- AI/system owners for material CoMind components.
- Risk owners.
- Control owners.
- Supplier/business owners.
- Security/privacy responsible roles.
- Internal audit/reviewer role with sufficient independence.
- Incident owner/escalation route.
- Certification program owner if certification becomes an active objective.

One person may hold multiple roles in a small organization, but conflicting responsibilities must be identified and compensating independent review used for material decisions.

## Existing Virtual Employee roles

Existing CoMind VE names remain unchanged. The AIMS should map their verified responsibilities and effective authority rather than invent new aliases. The future Agent Directory/Dashboard will expose this mapping as a view over authoritative identity and capability sources.

## ISO VE boundary

`ISO | Compliance and Standards Officer` is proposed as a shadow-mode evidence steward and standards monitor. It may identify and escalate gaps, but cannot:

- approve policy;
- accept material risk;
- approve exceptions;
- grant itself access;
- modify production;
- close its own audit findings;
- issue certification conclusions;
- override other agents or human authority.

## Delegation records

Material delegation should identify delegator, delegatee, capability, scope, authority ceiling, environment, project/target, validity period, purpose, evidence source, revocation path, recovery/rollback expectations and escalation owner. Missing delegation evidence must not be reconstructed from behavior after the fact.

## Review

This matrix should be reviewed whenever organizational roles, agent authority, certification scope, production autonomy, incident responsibilities or material suppliers change.