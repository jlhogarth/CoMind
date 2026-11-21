# CoMind execution queue
As of 2026-10-24 America/Indiana/Indianapolis. Owner: current assistant session for execution; Joseph for product decisions and authority. No background worker is implied.

## Operating state
Policy and queue documentation: prepared in issue #170.
Next active implementation lane: Operator Console dependency preservation and preview readiness.
Moment naming: on hold by Joseph. Do not make naming a prerequisite for internal development or an isolated preview.
Concurrency: one implementation lane at a time. If blocked, preserve state and record the queue transition before beginning another.

## Ordered lane groups
| Order | Lane and sources | Current evidence / limit | Next action and completion evidence |
|---|---|---|---|
| 1 | Operator Console, #118 / PR #119 | Prior conversation executed Next 16.4.1 upgrade, npm ci, typecheck, 38 tests and build in Codespace on pi-001-event-history-context-008. Four files uncommitted at last observation. Current main still pins Next 16.0.0. | Reinspect and preserve exact local diff, reconcile onto the correct current console baseline without losing newer main/HUD changes, capture exact-head checks, then verify a Test Vercel preview. Completion requires a working preview URL and smoke evidence, not just a local build. No production deployment or new paid commitment. |
| 2 | Foundry terminal lifecycle, #169 | Issue open. Append-only context/operation headers must not be rewritten; derive effective closure from outcomes/results. | Locate any interrupted branch work; implement/review atomic result/outcome persistence, canonical lifecycle projection and fenced completion; prove success, failure, duplicate and stale-worker behavior in isolation. No new live dispatch or historical repair. |
| 3 | Activity HUD and stall detection, #153 / #115 | HUD issue records Test substrate evidence but no complete hosted/capture coverage. Sentinel is a separate open issue. | Verify actual hosted HUD and sources, then implement bounded missing/stalled-work handling. Completion requires observable lifecycle evidence and explicit unknown/unconnected states. |
| 4 | Primary Interface and brand runtime, #142 / PR #143, #138 / PR #139 | Open stacked PRs. PR #149 is actually merged into PI foundation despite stale text saying open. | Reconcile stack and review exact-head acceptance; preserve canonical source distinctions and resolve Foundry-to-PM mapping before joining records. Brand runtime work is distinct from public naming. |
| 5 | RunBook reader activation and Notebook, #144 / PR #152 | PR #145 merged into main; #144 remains open. PR #152 open. Merged code is not hosted activation. | Reconcile reader activation requirements and Notebook integration evidence separately; verify bounded read/auth behavior and exact-head PostgreSQL acceptance before closing either scope. |
| 6 | Provider recovery and merge acceptance, #72 / #107 | Open issues with distinct technical and governance obligations. | Audit implemented evidence, finish failure/recovery acceptance and review-gate controls. No paid calls or administrative changes without their specific authority. |
| 7 | Test schema expansion and security readiness, #126 / #133 | Open; shared mutation ownership and current migration state need fresh reconciliation. Historical issue inventory is not current live DB proof. | Read-only dependency/preflight reconciliation first. Separate schema existence from activation; retain single schema-mutation lane and explicit security authority. |
| 8 | Managed PostgreSQL and SDN, #140 / PR #141, #136 / PR #137 | Open planning work; provider selection and recovery/cost decisions unresolved. | Produce explicit decision inputs and acceptance design when runtime priorities are stable. No purchase or production activation. |
| 9 | Fabric/Ollama evaluation, #114 | Open research/isolated POC lane. Existing successful local-model Foundry proof does not complete Fabric evaluation. | Resume only when it supports a concrete next capability; record sources as research occurs and finish adopt/adapt/reject evidence. |
| Hold | Workspace adapter, #166 | Issue explicitly defers production tenant until public domain decision. | Keep design available; do not purchase a temporary domain or commit a tenant while Moment/naming is on hold. |
| Future | Scout/ARIS/module evaluation | Desired product outcome from conversation, not independently verified as operating or a current dedicated open issue in this inventory. | After lifecycle and visibility acceptance, define one bounded real task, artifact, evidence receipt and review criterion. |

## Inventory and provenance
Read from GitHub connectors during this session, not inferred from memory:
- Open issue search: repo:jlhogarth/CoMind is:open, 100 requested, returned 15 issues before #170 was created.
- Open PR search: same repository, returned six PRs: #119, #137, #139, #141, #143, #152.
- Direct PR readbacks: #145 closed/merged into main; #149 closed/merged into issue-142-primary-interface-foundation.
- Main apps/operator-console/package.json still has next 16.0.0 and newer scripts/dependencies than the previously inspected Codespace manifest. Do not overwrite it wholesale with the old manifest.
- Existing AGENTS.md read before proposing policy; no existing authority rule removed.

Canonical sources:
- https://github.com/jlhogarth/CoMind/issues/169 : Foundry Runtime: reconcile terminal execution lifecycle state
- https://github.com/jlhogarth/CoMind/issues/166 : WSA-001: CoMind Workspace Adapter and Virtual Employee Workspace Integration
- https://github.com/jlhogarth/CoMind/issues/126 : Test Supabase canonical schema expansion and activation separation
- https://github.com/jlhogarth/CoMind/issues/153 : Activity HUD: Test-only RunBook activity and resolution view
- https://github.com/jlhogarth/CoMind/issues/144 : DRB-002: governed read-only Durable RunBook query service
- https://github.com/jlhogarth/CoMind/issues/142 : PI-001: Primary Interface scope and evidence-aware human attention foundation
- https://github.com/jlhogarth/CoMind/issues/140 : PDP-001: managed PostgreSQL selection and data authority model
- https://github.com/jlhogarth/CoMind/issues/138 : BRAND-001: Unified HTML brand runtime, color scoping, motion, and layout system
- https://github.com/jlhogarth/CoMind/issues/136 : SDN-003: Production activation planning and acceptance design
- https://github.com/jlhogarth/CoMind/issues/118 : Operator Console 002: live Supabase activation and administrative capability
- https://github.com/jlhogarth/CoMind/issues/133 : Live Foundry LF-3: security and compatibility readiness for migration 007
- https://github.com/jlhogarth/CoMind/issues/115 : Parallel Development Control: event-driven CI stall detection and lane health sentinel
- https://github.com/jlhogarth/CoMind/issues/114 : FAB-001: Fabric/Ollama Architecture Review and Governed Cognitive Capability POC
- https://github.com/jlhogarth/CoMind/issues/107 : Governance corrective action: enforce required acceptance before merge
- https://github.com/jlhogarth/CoMind/issues/72 : Harden governed provider execution failure recovery semantics
- https://github.com/jlhogarth/CoMind/pull/143 : PI-001: read-only attention and canonical development lane navigation
- https://github.com/jlhogarth/CoMind/pull/152 : Notebook: isolated Test conversation capture and review
- https://github.com/jlhogarth/CoMind/pull/139 : BRAND-001: brand runtime, Experience Lab, and PI-001 architecture prototypes
- https://github.com/jlhogarth/CoMind/pull/141 : PDP-001: provider selection checkpoint and managed/SDN authority proposal
- https://github.com/jlhogarth/CoMind/pull/137 : SDN-003: production activation planning
- https://github.com/jlhogarth/CoMind/pull/119 : Operator Console 002: live Supabase activation and administrative capability
- https://github.com/jlhogarth/CoMind/pull/145
- https://github.com/jlhogarth/CoMind/pull/149
- https://github.com/jlhogarth/CoMind/blob/main/apps/operator-console/package.json

This is a prioritization snapshot, not a replacement for canonical issues or a claim that acceptance criteria have been met. No RunBook write or ChatGPT saved-memory API update is claimed.

## Continuation
Read current AGENTS.md and this queue. Reinspect Codespace animated-space-barnacle-5964p7j96x7f464q and its four-file Next upgrade. Preserve uncommitted work first. Reconcile with main and OC-002 branch before creating a narrowly scoped dependency patch. Verify exact-head checks and preview prerequisites. Keep Moment on hold and production deferred. Record evidence, blockers and any method change before handing off.
