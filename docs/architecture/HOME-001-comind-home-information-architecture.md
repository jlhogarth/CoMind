# HOME-001 CoMind Home Information Architecture

Issue: #363  
Contract: `config/comind-home-information-architecture.v1.json`  
Baseline: `162a1355d361ec7f2139035b89d0a7211862e69d`  
Production activation: excluded

## 1. Product definition

CoMind Home is the governed personal cognitive control plane for the CoMind ecosystem. It exists so the operator can see what needs attention, understand why, navigate to the authoritative system, and take a governed action without remembering where every subsystem lives.

Home is not a new source of truth.

Its job is to compose existing authoritative systems into an intelligible operator experience while preserving source identity, provenance, authority, freshness, uncertainty, and evidence.

The governing architectural rule is:

> Home owns presentation, navigation, attention composition, bounded projection, and governed action routing. The owning subsystem retains truth and mutation authority.

This preserves the existing distinction between observed, inferred, requested, authorized, executed, and verified.

## 2. Information architecture

The Home hierarchy is attention-first rather than application-first.

| Group | Surface | Primary operator question |
| --- | --- | --- |
| Attention | Now | What needs my attention now, and why? |
| Work | Projects | What are we building or operating? |
| Work | RunBook | What happened, what is current, and what is next? |
| Workforce | Virtual Employees | Who or what is working, with what authority? |
| Governance | Decisions | What consequential choices exist or were made? |
| Governance | Approvals | What authority has been requested, granted, denied, expired, executed, or verified? |
| Governance | Evidence | What proves the claims being shown? |
| Governance | Implementation Integrity | Does observable implementation match verified reality? |
| Knowledge | Research | What governed external knowledge do we have, how authoritative is it, and is it fresh? |
| Knowledge | Learning | What structured learning paths compose that governed research? |
| Knowledge | Reflection | What has been explicitly authored as reflection or journal material? |
| Watch | Watchtower | What registered monitors or alert sources require attention? |

Existing Activity, RuleBook, Continuous Excellence, ThreadKeeper, Workspace Mail, documentation, Drive, GitHub, and infrastructure destinations remain detail or utility surfaces. They should not all compete as peer top-level cognitive domains.

## 3. Now is a composition, not a ledger

`Now` should become the default landing experience because CoMind Home is intended to reduce cognitive navigation cost.

It must not have a `cm_now`, `home_attention`, or equivalent canonical table.

Instead, a bounded server-side composer should draw attention candidates from registered owner projections such as:

- blocked, awaiting-review, deferred, running, or otherwise material operational work from the accepted Activity projection;
- actionable Continuous Excellence signals;
- pending or expiring governed authorization requests;
- unresolved cost alerts;
- current Continuity Capsule state when it contains a material blocker, approval, uncertainty, or next action;
- later registered sources that satisfy the same projection contract.

Each candidate must retain:

- source system;
- source identity;
- source state;
- observation time;
- freshness semantics;
- authority state;
- evidence reference where available;
- action destination;
- coverage limitation.

Ranking may be derived. Truth may not be.

Absence from Now never proves that a source system has no work or no risk. It only means no registered attention candidate was emitted by the bounded composition.

## 4. Projects

Canonical project identity remains `comind.cm_project`.

`comind_pm.pm_projects` is an operational PM/RunBook projection and links to the canonical project through `canonical_project_id`.

Home must not reverse that relationship merely because PM data is convenient for dashboards.

The eventual Projects surface should compose:

- identity and hierarchy from `cm_project`;
- operational status from PM/RunBook projections;
- current tasks and attention;
- linked VEs;
- decisions;
- evidence;
- research;
- recent activity;
- Continuity Capsule or recovery status where relevant.

A project page should therefore be an entity-centered projection, not a duplicate project record.

## 5. Virtual Employees

The VE surface should reuse Foundry and VE lifecycle authority:

- `cm_foundry_agent_profile` for runtime profile state;
- `cm_agent` and `cm_actor` for identity;
- capability grants for permitted capability scope;
- authorization records for consequential authority;
- lifecycle coordinator contracts for state transitions;
- external resource bindings where applicable;
- execution/activity evidence for what actually occurred.

Home may show a VE as Active, Suspended, Retired, Awaiting Authorization, or another supported lifecycle state only when the owner substrate proves that state.

A profile's configured authority ceiling is not current authorization for an action.

## 6. Decisions and Approvals must remain separate

A decision and an approval answer different questions.

A Decision records a consequential choice, alternatives, rationale, and often reversibility. Operational work decisions currently have a durable substrate in `comind_pm.pm_decision_records`; structured decision analysis can use the existing `cm_decision_tree`, `cm_decision_node`, and `cm_decision_edge` family where applicable.

An Approval grants or denies authority for a requested action. Foundry authorization request/decision records and the governed approval portal own that state.

Home should cross-link them where a decision produces an approval request, but it must never collapse the concepts.

Examples:

- Decision: use a paid external model for a pilot.
- Approval: authorize up to a bounded spending cap for that exact execution.
- Execution: the provider call occurred.
- Verification: the result and actual expense were reconciled.

Those are four distinct states.

## 7. Evidence is cross-cutting

`comind.cm_evidence` remains the canonical evidence identity substrate. Source-native evidence, such as GitHub Actions artifacts, commits, Drive revisions, provider receipts, or source documents, should remain source-native and referenced rather than copied simply to make Home self-contained.

Every consequential Home card should be capable of answering:

1. Where did this state come from?
2. When was it observed?
3. What does the source actually prove?
4. What is outside its coverage?
5. Can the operator inspect the source evidence?

Evidence is therefore both a dedicated surface and a cross-cutting affordance throughout Home.

## 8. RunBook

The Durable RunBook remains the operational chronology and recovery substrate.

Home should consume the accepted projections:

- `v_runbook_lane_state`;
- `v_runbook_timeline`;
- `v_runbook_authority`;
- `v_runbook_verification`.

Home should not create a shorter competing event history.

The RunBook surface should optimize orientation: current lane state, last consequential action, latest result, next action, authority constraints, verification, and source evidence, with timeline drill-down when needed.

## 9. Research and Learning

RLIB-001 already established the correct substrate.

Research should project `comind.cm_research_refs` and preserve:

- source authority;
- document identity;
- version;
- lifecycle;
- freshness;
- supersession;
- Drive identity and artifact link;
- research-session lineage;
- related capability metadata.

RLIB-002 owns intake mechanics and is intentionally separate from Home.

Learning should reuse `cm_learning_path` and `cm_learning_path_item` as ordered compositions of Research Library references. Learning must not copy research documents into a second content store. If a referenced source becomes stale or superseded, the learning surface should inherit that warning.

## 10. Watchtower

Watchtower is a federated attention surface, not a database.

There is currently no canonical Watchtower relation, and HOME-001 should not create one.

Initial source families include:

- Continuous Excellence signal backlog;
- cost alerts;
- GitHub Actions and Lane Health Sentinel observations;
- later monitoring adapters that explicitly register source identity, severity semantics, freshness, terminal behavior, and remediation authority.

A Watchtower adapter must answer:

- What does this source monitor?
- What constitutes healthy, warning, failure, stale, unknown, or unavailable?
- How fresh is the observation?
- What evidence exists?
- Who is authorized to acknowledge or remediate it?

An unavailable monitor is degraded visibility, not a healthy system.

## 11. Reflection

The live Test schema contains the existing canonical journal substrate `comind.cm_journal_entry` with project, author, title, body, tags, importance, and timestamps.

That should be the owner for Reflection.

Continuous Excellence signals, memory, Conversation History analytics, Continuity Capsules, Digital Twin inferences, or model-generated observations may later provide context or suggestions, but they must never silently become journal truth.

Reflection therefore has a deliberately stronger authorship boundary than ordinary telemetry.

## 12. Implementation Integrity

Implementation Integrity must project two different evidence classes without conflating them:

1. Canonical control definition and maturity from `config/integrity-registry.v1.json`.
2. Current execution evidence from exact GitHub Actions runs and other accepted control evidence.

A control being defined is not the same as it being enforced. A previously passing workflow is not proof for a newer commit. Repository controls are not by themselves proof of Production runtime conformity.

The Home surface must preserve those distinctions.

## 13. Cross-domain linking model

Home should prefer stable identities and links over denormalized copies.

Examples:

- Project -> active RunBook lanes
- Project -> assigned or participating VEs
- Project -> decisions
- Project -> evidence
- Project -> related research
- VE -> grants and authorization requests
- Decision -> approval request
- Approval -> execution evidence
- Research -> learning paths
- CE signal -> project/task/evidence
- Watchtower item -> source monitor and evidence
- Reflection -> project and author

Where a source does not already expose a stable relationship, Home should not invent one from text similarity. A future relationship can be added by the owning subsystem or by a separately governed relationship substrate with explicit evidence.

## 14. Server and browser boundary

Home should follow the accepted HUD-REAL security pattern:

- browser calls same-origin bounded APIs;
- privileged database material stays server-side;
- underlying private schemas remain inaccessible to ordinary browser roles;
- response models contain only fields needed for the operator projection;
- query limits and pagination are explicit;
- source errors are not converted into successful empty responses;
- unsupported authority fails closed.

HOME-001 v0.1 does not create these APIs. It defines the contract they must satisfy.

## 15. Mobile architecture

Mobile is not a separate reduced product.

The same cognitive domains and authority semantics must remain available, but the presentation order should change:

1. Now
2. urgent Watchtower and Approval attention
3. active Projects and VEs
4. Decisions and Evidence
5. RunBook
6. Research, Learning, Reflection
7. deeper utilities

The operator must still be able to identify source, freshness, authority, evidence, and next action without desktop-only hover interactions or hidden governance context.

## 16. Recommended implementation sequence after v0.1 acceptance

1. HOME-002: server-side read model and `Now` composer using only already accepted source projections.
2. HOME-003: CoMind Home shell/navigation and Now UI, replacing infrastructure-first landing emphasis without removing existing routes.
3. HOME-004: Projects and VEs entity projections.
4. HOME-005: Decisions, Approvals, Evidence, and RunBook integration.
5. HOME-006: Research, Learning, and Reflection surfaces.
6. HOME-007: federated Watchtower adapters and attention surface.
7. HOME-008: Implementation Integrity projection bound to exact commit evidence.

These are sequencing candidates, not pre-created issues. Each increment requires a fresh collision scan before ownership is leased.

## 17. v0.1 boundary

HOME-001 v0.1 changes no database schema, Production resource, deployment configuration, authentication boundary, VE authority, research intake behavior, integrity maturity, or Console page.

Its deliverable is the durable, machine-validated architecture contract that later UI and APIs must obey.
