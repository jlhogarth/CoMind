# Activity HUD Test implementation

Date: 2026-10-19 America/Indiana/Indianapolis

## Scope

Joseph authorized Activity HUD work in the CoMind Supabase Test project. This implementation adds a visual Operator Console route over the field contract of `comind_hud_test.v_activity_hud`, using clearly labeled synthetic rows. It does not connect the browser to Supabase yet. No production decision or change was made.

The HUD presents RunBook events, activity observations, PM decisions, Foundry authorization requests, and human-action assessments as distinct records. It infers no Foundry UUID to PM project crosswalk, lane association, or decision/authorization/verification/evidence relationship.

## Test data projection

Supabase project: `sbgfuanxiqepcoboxzcl` (`CoMind`, PostgreSQL 17.11).

Migration: `activity_hud_test_v1`, database migration version `20261019214321`.

- `comind_hud_test.activity_runs`: activity identity and local deadline/staleness parameters.
- `comind_hud_test.activity_observations`: append-only source observations with source and observation timestamps.
- `comind_hud_test.v_activity_hud`: latest observed status, conservative stale/deadline labels, and evidence-based resolution only when terminal source evidence exists.
- `comind_hud_test.v_runbook_timeline`: a separate read-only projection of the canonical RunBook timeline.

The fixture contains five synthetic activities: completed, failed, stale with no terminal return, cancellation requested without source confirmation, and locally elapsed deadline. It does not represent native ChatGPT UI events.

The live Supabase verification SQL completed successfully. It confirmed five synthetic rows, conservative states without false resolutions, matching RunBook projection/source row counts (68 at that verification), and rejection of fixture updates/deletes.

## GUI and event handling

The Operator Console route `/activity` includes state and source filters, search, evidence/timing details, and these sort choices: investigation priority, longest without report, most recently observed, newest started, and title. The default sort places deadline overruns and stale/unknown/cancellation-unconfirmed events first; within unresolved statuses it puts the oldest source observation first, falling back to start time when no observation exists. A local deadline is displayed as a local deadline state, not as a source failure.

“Export no-return set” downloads JSON for the currently visible activities without terminal source evidence. The export states its bounded coverage and retains source references, observations, and evidence for investigation. It does not send data to an outside vendor.

All rows on this page are synthetic fixtures shaped from `v_activity_hud`; the page visibly says it is not connected to a live browser data provider. No Supabase credentials are configured for the Operator Console, and no Vercel project is connected. The private Test view remains owner-queryable. GitHub Actions, OpenAI API jobs, Drive writes, and other operations are not automatically ingested. The projection and UI do not claim complete history, a lossless feed, or snapshot consistency.

## Local verification

At local implementation revision based on the then-current PR checkout:

- Four model tests passed using `node --import tsx --test test/activity-hud-model.test.ts`.
- `npm run typecheck` passed.
- `npm run build` passed and produced `/activity`.
- `git diff --check` passed.
- The package `npm test` wrapper could not start under this environment because `tsx` attempted to create an IPC pipe in `/tmp` (`EPERM`); the same test file passed with Node's test runner entry point above.
- Browser interaction was not verified because no Chromium executable is installed in the environment.

## Remote checkpoint

Repository: `jlhogarth/CoMind`; PR [#154](https://github.com/jlhogarth/CoMind/pull/154); branch `activity-hud-test-001`; base `main` at `524f893fb6ac71aef3954f4cff9d592a2f5090e9`.

GUI implementation commit and exact workflow-evidence head: `af14f3128ee9b1706a05d99b7f48c1cb17ac92e7`.

All 13 returned workflow runs passed at that exact head:

- CI: `39332568603`
- DRB-002 Query Contract: `39332568407`
- Foundry Runtime Orchestration: `39332568621`
- CoMind Repository Configuration: `39332568985`
- No Placeholder Policy: `39332568539`
- Activity HUD Test: `39332568668`
- Live Foundry LF-3 Readiness: `39332568601`
- Foundry Work Lease Kernel: `39332568666`
- Governed Provider Execution: `39332568431`
- Live Foundry Stage 1 Readiness: `39332568468`
- Live Foundry LF-2 Readiness: `39332568703`
- Runtime Budget Authority Adapter: `39332568417`
- Operator Console CI: `39332568393`

At checkpoint, PR #154 was open, draft, unmerged, mergeable, with no submitted reviews. It remains draft. No production endpoint, identity, grant, traffic, migration, or resource was changed.

## Next steps

1. Connect the page to the Test view through an explicitly configured Test-only read path; verify access to the exact `v_activity_hud` projection before replacing the synthetic fixture.
2. Continue source adapters incrementally, preserving append-only event semantics and the distinction between a missing return and a terminal result.
3. Add a bounded-view acceptance case where an event is appended between cursor-page requests, and confirm that the interface describes the changing result without implying snapshot consistency or a lossless feed.
