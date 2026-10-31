# CUX-001 Console Usability Auditor foundation

Date: 2026-10-29
Issue: #322
PR: #323
Branch: `cux-001-console-usability-auditor`

## Purpose

CUX-001 establishes a governed Console Usability Auditor for the CoMind Operator Console. The reviewer detects usability regressions across navigation, interactive controls, content/readability, keyboard behavior, responsive layout, browser engines, and mobile form factors while preserving human acceptance authority.

## Governance classification

- T0: read-only inspection and usability review.
- T1: reversible repository test harness, adapter, workflow, and report-generation changes.
- Foundry authority ceiling: C1.
- Environment: isolated/Test only.
- Paid provider use: not authorized and not required.
- Production UI mutation, deployment, security-policy change, and destructive action: not authorized by CUX-001.

## Composition decision

CUX-001 reuses existing CoMind infrastructure rather than creating a second agent platform or browser stack:

- Foundry agent profile, capability, grant, authorization, execution, and evidence contracts;
- existing `FoundryAdapterRegistry` and `FoundryRuntimeOrchestrator` behavior;
- existing Operator Console Playwright 1.56.0 dependency;
- existing Next.js Operator Console and browser-test conventions;
- existing `cm_audit_log` for durable provisioning evidence;
- the existing guarded Supabase Test connection and certificate-verification pattern used by prior Foundry one-shot proof work;
- MDO-001 principles for bounded reviewer roles where orchestration is needed.

## Agent contract

Role code: `console_usability_auditor`

Display name: `Console Usability Auditor`

Capabilities:

1. `console.usability.inspect`
2. `console.usability.browser_test`
3. `console.usability.review`

All three are non-cost-bearing, limited to `operator_console`, max C1, and use the bounded `console_usability` adapter.

The adapter rejects:

- arbitrary runtime commands or environment overrides;
- target references outside `apps/operator-console`;
- authority above C1;
- unsupported browser-engine configuration;
- unsupported capability/action combinations.

The default adapter child process receives a scrubbed environment and executes only the fixed `apps/operator-console/test/console-usability.browser.mjs` path. It cannot accept an arbitrary script or shell command from Foundry input.

## Governed dispatch path

`.github/workflows/cux-001-test-agent-one-shot.yml` provides the governed Test-only Foundry dispatch. It is configured to run automatically once when the workflow is first adopted on `main`, because that merge changes the workflow file itself. Later executions remain available through `workflow_dispatch` without creating a recurring main-branch schedule.

The dispatch:

- verifies the exact CoMind Test Supabase pooler target and pinned Supabase CA fingerprint;
- resolves the active CUA profile and `console.usability.browser_test` grant by semantic identity;
- creates a fresh short-lived C1 authorization request and founder-approved decision for `apps/operator-console`;
- registers the bounded `console_usability` adapter in the actual Foundry runtime registry;
- invokes `FoundryRuntimeOrchestrator.execute`;
- persists normal Foundry execution context, recovery checkpoint, adapter operation, adapter result, and execution outcome evidence;
- emits a bounded artifact without exposing database credentials;
- does not create or claim a generic work lease because this is a direct authorized review invocation rather than queued work claiming.

## Browser and mobile review contract

The deterministic harness covers:

- `/`, `/activity`, and `/rulebook`, plus locally discoverable internal Console routes;
- internal-link status and external-link classification;
- visible controls including links, buttons, inputs, selects, summaries, tabs, role-based controls, and `aria-expanded` controls;
- local dropdown selection and restore;
- local expandable-control activation and state verification;
- keyboard Tab traversal;
- browser page errors, console errors, and failed requests during route loading;
- heading hierarchy;
- small visible text below the review threshold;
- mobile touch-target sizing;
- page-level horizontal overflow;
- desktop, laptop, reduced-motion, narrow phone, iPhone-class, wide phone, and landscape phone viewports.

Remote targets are read-only. A Cloudflare Access redirect is recorded as an authentication limitation rather than represented as successful authenticated testing.

## Browser engine policy

Console-changing pull requests run two deterministic CUX jobs:

1. Chromium across all configured desktop/mobile viewports.
2. Firefox and WebKit across the same viewport matrix.

This makes Chromium, Firefox, and Safari-equivalent WebKit compatibility a standing Console regression gate rather than a one-time manual test.

## Evidence output

Each run emits `comind.cux-001.usability-report.v1` JSON containing source/target context, browser/profile runs, route/control inventory, findings, limitations, and severity counts. Screenshots are CI artifacts and must not contain secrets.

Severity vocabulary:

- blocker
- major
- moderate
- minor

The initial CI gate blocks on blocker findings. Major/moderate/minor findings remain inspectable evidence for remediation prioritization and human acceptance rather than being silently discarded.

## First browser evidence

The first completed Chromium run covered seven viewport profiles and passed the blocker gate with:

- 0 blocker findings;
- 172 major raw findings;
- 187 moderate raw findings;
- 111 minor raw findings;
- 470 total raw findings;
- 0 execution limitations.

The counts repeat the same defects across routes and viewports and must not be interpreted as 470 independent defects. The dominant families were small text, undersized mobile touch targets, and a small number of accessible-name findings.

The Firefox and WebKit matrix covered fourteen browser/profile runs and also passed the blocker gate with:

- 0 blocker findings;
- 312 major raw findings;
- 404 moderate raw findings;
- 222 minor raw findings;
- 938 total raw findings;
- 0 execution limitations.

Firefox and WebKit reproduced the same dominant families. This establishes that the core findings are not Chromium-specific.

Observed high-value findings include:

- Activity search lacks a useful accessible name.
- Activity mobile Refresh, Export, Search, filter, rows-per-page, and pager controls are materially smaller than comfortable touch targets.
- RuleBook mobile Refresh, Export, Search, Health, and Original disposition controls are similarly undersized.
- Operator surfaces use many 8px, 9px, and 10px styles that are difficult on phone-sized displays.
- RuleBook summary cards inherit generic large card sizing and create an unnecessarily tall four-card stack before the primary filter controls on narrow screens.
- The Control Plane home page preserves its information structure well at iPhone-class width and should be preserved while readability is improved.
- No broken internal link, page-level horizontal overflow, or blocker-level route failure was found in the completed local browser runs.

CUX-002 Issue #324 owns the evidence-backed presentation/accessibility remediation after CUX-001 acceptance and active-lane reconciliation.

## Test provisioning contract

`scripts/provision_cux_001_test_agent.sql` performs DML only against the existing CoMind Test schema. It:

- resolves the canonical CoMind org/project and founder actor by stable semantic keys;
- creates the CUA actor, agent, active C0-C1 profile, three capabilities, and three isolated project-scoped grants idempotently;
- scopes grants only to `apps/operator-console`;
- does not impose `max_tasks`, because Foundry interprets that field as a lifetime execution limit rather than per-run concurrency;
- records durable Test provisioning evidence;
- fails closed on missing canonical context, capability conflicts, identity conflicts, or a pre-existing non-active profile;
- performs no Production activation and no DDL.

The initial `max_tasks: 1` grant scope was corrected before any governed CUA execution. A durable audit event records why the lifetime cap was removed. Repeatability remains bounded by fixed target scope, short-lived per-run authorization, C1 authority, the fixed adapter path, non-cost-bearing capabilities, and no Production target.

## Verified Test state

Canonical Test profile:

- profile ID: `c98bf961-6a1f-4795-8fc1-0fa05c814ed7`
- actor ID: `9b310ba5-6ee9-4395-b14c-652d983fc9d9`
- agent ID: `f6076de7-ab2f-4b03-9236-5fed22837d22`
- status: active
- authority: C0-C1
- instruction version: `cux-001.v1`
- adapter: `console_usability`
- execution mode: `isolated_local`
- Production target allowed: false
- paid provider allowed: false

Active isolated capability grants:

- inspect: `ad697468-77f1-434c-b651-edc221793f8a`
- browser test: `daa08def-47f0-4cbf-985f-ac5bf3bc5d9e`
- review: `0f1bdae5-76a9-4cee-9c67-d7d6ec6309b0`

All three are scoped to project `8ac9fab3-35df-48fb-b1df-95285fee9dc0`, target `apps/operator-console`, environment `isolated`, authority ceiling C1, non-cost-bearing, and unrevoked.

Provisioning audit ID: `6578468f-fcd6-446f-83fc-db4a7ed03f57`.

A second durable audit event records the corrected repeatable target-only grant scope.

## Cross-lane boundaries

- DEP-C01 #297 remains authoritative for deployed Console health, authentication, rollback, and Production deployment acceptance.
- DRULE-004 #321 remains authoritative for RuleBook governance-control semantics.
- BRAND-001 #138 remains authoritative for reusable brand tokens, motion, and layout primitives.
- CUX-002 #324 may remediate presentation/accessibility only after CUX-001 acceptance and active-lane reconciliation.

CUX-001 may report usability findings against these surfaces but does not take over their implementation authority.

## Recovery

Repository changes are reversible by PR revert. The Test profile can be suspended or retired through existing Foundry/VE lifecycle controls. Capability grants are isolated and project-scoped. A failed or incomplete browser run is preserved as failure/limitation evidence and never converted to success.

## Acceptance state

The Test profile, capabilities, corrected grants, bounded adapter, browser harness, CI matrix, and governed dispatch path are implemented. Chromium, Firefox, and WebKit have all passed the blocker gate on the implemented UI/harness code. PR #323 still requires exact-head CI completion after the final evidence/dispatch updates before merge. Once merged, the workflow-file adoption push is intended to produce the first persisted governed CUA execution automatically; subsequent runs remain explicitly triggered rather than scheduled.
