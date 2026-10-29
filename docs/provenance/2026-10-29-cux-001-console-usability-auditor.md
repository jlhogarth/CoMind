# CUX-001 Console Usability Auditor foundation

Date: 2026-10-29
Issue: #322
Branch: `cux-001-console-usability-auditor`

## Purpose

CUX-001 establishes a governed Console Usability Auditor for the CoMind Operator Console. The reviewer is intended to find usability regressions across navigation, interactive controls, content/readability, keyboard behavior, responsive layout, browser engines, and mobile form factors while preserving human acceptance authority.

## Governance classification

- T0: read-only inspection and usability review.
- T1: reversible repository test harness, adapter, workflow, and report-generation changes.
- Foundry authority ceiling: C1.
- Environment: isolated/Test only.
- Paid provider use: not authorized and not required.
- Production UI mutation, deployment, security policy change, merge authority, and destructive action: not authorized by CUX-001.

## Composition decision

CUX-001 reuses existing CoMind infrastructure rather than creating a second agent platform or browser stack:

- Foundry agent profile, capability, grant, authorization, execution, and evidence contracts;
- existing `FoundryAdapterRegistry` and `FoundryRuntimeOrchestrator` behavior;
- existing Operator Console Playwright 1.56.0 dependency;
- existing Next.js Operator Console and browser-test conventions;
- existing `cm_audit_log` for durable provisioning evidence;
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
- unsupported browser engine configuration;
- unsupported capability/action combinations.

The default adapter child process receives a scrubbed environment and executes only the fixed `apps/operator-console/test/console-usability.browser.mjs` path. It cannot accept an arbitrary script or shell command from Foundry input.

## Browser and mobile review contract

The deterministic harness covers:

- `/`, `/activity`, and `/rulebook`, plus locally discoverable internal Console routes;
- internal link status and external-link classification;
- visible controls including links, buttons, inputs, selects, summaries, tabs, role-based controls, and `aria-expanded` controls;
- local dropdown selection and restore;
- local expandable-control activation and state verification;
- keyboard Tab traversal;
- browser page errors, console errors, and failed requests;
- heading hierarchy;
- small visible text below the review threshold;
- mobile touch-target sizing;
- page-level horizontal overflow;
- desktop, laptop, reduced-motion, narrow phone, iPhone-class, wide phone, and landscape phone viewports.

Remote targets are read-only. A Cloudflare Access redirect is recorded as an authentication limitation rather than being represented as successful authenticated testing.

## Browser engine policy

Normal pull requests run a Chromium baseline across all configured desktop/mobile viewports. The on-demand full matrix runs Chromium, Firefox, and WebKit. This keeps routine CI bounded while preserving a deterministic cross-engine acceptance path.

## Evidence output

Each run emits `comind.cux-001.usability-report.v1` JSON containing source/target context, browser/profile runs, route/control inventory, findings, limitations, and severity counts. Optional screenshots are stored only as test artifacts and must not contain secrets.

Severity vocabulary:

- blocker
- major
- moderate
- minor

The harness blocks CI only on blocker findings initially. Major/moderate/minor findings remain visible evidence for remediation prioritization and human acceptance.

## Test provisioning contract

`scripts/provision_cux_001_test_agent.sql` performs DML only against the existing CoMind schema. It:

- resolves the canonical CoMind org/project and founder actor by stable semantic keys;
- creates the CUA actor, agent, active C0-C1 profile, three capabilities, and three isolated project-scoped grants idempotently;
- scopes the grants to `apps/operator-console` with a single-task bound;
- records one durable Test provisioning audit event;
- fails closed on missing canonical context, capability conflicts, identity conflicts, or a pre-existing non-active profile;
- performs no Production activation and no DDL.

Test provisioning must be applied only after exact repository verification demonstrates that the `console_usability` adapter builds and its safety contract passes.

## Cross-lane boundaries

- DEP-C01 #297 remains authoritative for deployed Console health, authentication, rollback, and Production deployment acceptance.
- DRULE-004 #321 remains authoritative for RuleBook governance-control semantics.
- BRAND-001 #138 remains authoritative for reusable brand tokens, motion, and layout primitives.

CUX-001 may report usability findings against these surfaces but does not take over their implementation authority.

## Recovery

Repository changes are reversible by PR revert. The Test profile can be suspended or retired through existing Foundry/VE lifecycle controls. Capability grants are isolated and project-scoped. A failed or incomplete browser run is preserved as failure/limitation evidence and never converted to success.

## Acceptance state

Repository implementation is present on the CUX-001 branch. Exact-head CI, initial usability evidence, and Test provisioning verification remain required before this foundation can be accepted as an active Test reviewer.
