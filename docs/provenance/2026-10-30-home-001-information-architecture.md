# HOME-001 collision, source-authority, and architecture evidence

Date: 2026-10-30  
Issue: #363  
Branch: `home-001-information-architecture`  
Lease baseline: `162a1355d361ec7f2139035b89d0a7211862e69d`  
Production activation: excluded

## Purpose

Preserve the evidence used to define the first CoMind Home information architecture contract without relying on conversational narrative.

The requested product direction is a personal cognitive control plane organized around Now, Projects, Virtual Employees, Decisions, Evidence, RunBook, Research, Learning, Watchtower, Reflection, and Implementation Integrity.

The primary architecture constraint is that Home must compose authoritative systems rather than becoming another source of truth.

## Development Environment Contract

HOME-001 operates under `docs/governance/COMIND-DEVELOPMENT-ENVIRONMENT-CONTRACT.md`, version 1.0.

This increment is T1 reversible repository architecture work. It changes no database schema, Production resource, deployment configuration, authentication boundary, or application UI.

## Freshness

The lane was leased from exact current `main`:

`162a1355d361ec7f2139035b89d0a7211862e69d`

That commit is the RLIB-001 merge and includes the governed Research Library and Learning Path substrate needed by the Home Knowledge domain.

## Collision scan

### RLIB-002

Issue #362 and branch `rlib-002-governed-drive-intake` own governed Drive research intake.

Current comparison against the HOME-001 lease baseline showed only database research-intake files in its branch delta. Its issue explicitly excludes Operator Console UI and states that later Home/Library projection belongs in a separate Console lane.

Disposition: no file collision. HOME-001 may consume accepted RLIB contracts but must not modify intake semantics.

### CE-002

Issue #338 / PR #345 owns deterministic Recovery and Reorientation automation.

The PR history contains an older `page.tsx` change, but comparison of its current branch against current `main` showed the remaining delta is limited to CE workflow, database, documentation, recovery runtime, and tests. The historical Console text is already present on `main` and is not a current CE branch delta.

Disposition: no current file collision. HOME-001 does not take over CE recovery semantics.

### MDO-002

Issue #316 / PR #334 owns the provider-neutral pilot planning workforce.

Current comparison showed only MDO/Foundry workflow, database, script, server, tests, and provenance changes.

Disposition: no Console file collision. Home may later project workforce state but cannot alter MDO execution semantics in this lane.

### Deployment lanes

DEP-001 #294 and DEP-C01 #297 own deployed Console health, Cloudflare Access, authentication, rollback, and Production deployment acceptance.

Disposition: HOME-001 changes no deployment, DNS, Access, Vercel, Production routing, or rollback behavior.

### OC-002

Issue #118 / PR #119 is an old administrative Console branch. At collision time it was approximately 845 commits behind current `main` and still carried historical changes to `page.tsx`, `globals.css`, package/runtime, API admin, and database activation paths.

Disposition: preserve as historical work, but do not treat it as current Home presentation authority. HOME-001 v0.1 avoids all overlapping application files.

### BRAND-001

Issue #138 / PR #139 owns reusable brand-runtime concepts in `brand/` and its workflow.

Disposition: no current application-file collision. Later Home UI may reuse accepted brand primitives after a fresh scan.

### Implementation Integrity

IIC-005 #349 and successor integrity lanes own detector and registry maturity semantics.

Disposition: HOME-001 can project `config/integrity-registry.v1.json` and exact execution evidence but cannot change integrity-control definitions or maturity.

## Tooling failure preserved

Before the collision scan was complete, a setup call accidentally created branch `tmp-do-not-use` from `main`.

The branch contains no unique commit and no file changes. The connected GitHub action set in this conversation does not expose a branch-delete operation. The branch therefore remains inert and must not be used for development.

The actual HOME-001 branch was created only after the scan from the exact accepted baseline.

This is preserved because development-process failures are evidence under the Contract rather than something to hide from the record.

## Live Test source inventory

A read-only catalog inspection of Supabase Test project `sbgfuanxiqepcoboxzcl` confirmed the following existing source families.

### Projects

- `comind.cm_project` is the canonical project identity and hierarchy substrate.
- `comind_pm.pm_projects` is the PM/RunBook operational projection and includes `canonical_project_id`.

Consequence: Home must not make PM project rows the canonical project registry.

### Virtual Employees

Existing relations include:

- `comind.cm_actor`;
- `comind.cm_agent`;
- `comind.cm_foundry_agent_profile`;
- `comind.cm_foundry_capability`;
- `comind.cm_foundry_capability_grant`;
- Foundry authorization, execution, outcome, recovery, work-lease, and lifecycle evidence.

Consequence: Home requires no second VE roster or authority store.

### Decisions and approvals

Existing decision substrates include `comind_pm.pm_decision_records` and the `comind.cm_decision_tree`, `cm_decision_node`, and `cm_decision_edge` family.

Existing authorization substrates include `cm_foundry_authorization_request`, `cm_foundry_authorization_decision`, and `cm_api_approval_link`.

Consequence: Decisions and Approvals must remain separate cognitive and authority concepts even when cross-linked in the UI.

### Evidence

`comind.cm_evidence` exists as canonical evidence identity, while source systems retain native artifacts and references.

Consequence: Home should link evidence rather than copy source artifacts.

### RunBook and Activity

Existing projections include:

- `comind_pm.v_runbook_lane_state`;
- `comind_pm.v_runbook_timeline`;
- `comind_pm.v_runbook_authority`;
- `comind_pm.v_runbook_verification`;
- `comind_pm.v_operator_console_activity`.

Consequence: Now and RunBook can compose already governed projections.

### Research and Learning

RLIB-001 provides:

- `comind.cm_research_refs`;
- `comind.cm_learning_path`;
- `comind.cm_learning_path_item`.

Research metadata includes authority, version, lifecycle, Drive identity, fingerprint, verification/freshness, supersession, research-session lineage, and related capabilities.

Consequence: Home needs projection and navigation, not another library database.

### Reflection

The catalog contains `comind.cm_journal_entry` with project, author, title, body, tags, importance, created time, and updated time.

Consequence: Reflection has a real authored journal substrate. CE signals, memory, traits, analytics, or Digital Twin inference must not silently become Reflection truth.

### Watchtower

No canonical Watchtower relation was found.

Existing alert/attention sources include:

- `comind.v_ce_signal_backlog`;
- `public.comind_cost_alerts`;
- GitHub Actions / Lane Health evidence outside the database.

Consequence: this is not a missing table. Watchtower should be a federated registered-monitor projection. Unavailable monitoring must mean degraded visibility, not healthy state.

### Implementation Integrity

Repository evidence confirms:

- `config/integrity-registry.v1.json` is the canonical Integrity Registry;
- `scripts/validate_integrity_registry.py` validates it;
- `docs/integrity/` contains control contracts and rationale;
- GitHub Actions supplies execution evidence tied to exact commits.

Consequence: Home must not copy the registry to a competing database merely for display.

## Architectural decisions

1. Home is a projection/control plane, not a canonical data plane.
2. `Now` is a bounded composition of registered attention sources and gets no durable Home ledger.
3. Projects preserve `cm_project` canonical identity and PM operational projection separately.
4. VE identity, lifecycle, grants, and authority remain Foundry/VE-owned.
5. Decisions and Approvals are separate concepts.
6. Evidence is both a dedicated surface and a cross-cutting source-link affordance.
7. RunBook chronology remains canonical and is never copied into a Home event history.
8. Research and Learning reuse RLIB-001 by reference.
9. Watchtower is federated and receives no canonical Watchtower table.
10. Reflection is journal-backed and retains explicit authorship.
11. Implementation Integrity combines canonical registry maturity with exact-head execution evidence without inflating either.
12. Unknown/unavailable state fails closed throughout the Home experience.

## v0.1 implementation

HOME-001 v0.1 adds only:

- `config/comind-home-information-architecture.v1.json`;
- `scripts/validate_comind_home_ia.py`;
- `scripts/test_validate_comind_home_ia.py`;
- `docs/architecture/HOME-001-comind-home-information-architecture.md`;
- this provenance record;
- `.github/workflows/home-001.yml`.

No application page, CSS, API route, database object, deployment object, or Production resource is changed.

## Acceptance intent

The dedicated HOME-001 workflow must prove that:

- the required domain inventory is complete;
- navigation contains every domain exactly once;
- no Home domain creates a persistent source-of-truth store;
- Now remains composed;
- Projects preserve canonical identity ownership;
- Watchtower remains federated;
- Reflection remains journal-backed;
- Learning remains linked to governed Research;
- Implementation Integrity remains bound to the canonical registry;
- incomplete markers are rejected.

Final acceptance also requires the ordinary No Placeholder and implementation-integrity gates to remain green and a fresh collision scan before merge.
