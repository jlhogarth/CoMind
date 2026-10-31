# Activity HUD Test implementation

Date: 2026-10-19 America/Indiana/Indianapolis

## Scope

Joseph authorized connecting the Activity HUD GUI to the CoMind Supabase Test project. PR #154 contains a Test-only browser read path to the synthetic Activity HUD projection. No production decision or change was made.

The HUD keeps RunBook events, activity observations, PM decisions, Foundry authorization requests, and human-action assessments distinct. It infers no Foundry UUID to PM project crosswalk, lane association, or decision, authorization, verification, or evidence relationship.

## Test data projection

Supabase project: `sbgfuanxiqepcoboxzcl` (CoMind Test, PostgreSQL 17.11).

Migration ledger:

- `activity_hud_test_v1`, version `20261019214321`: synthetic Activity HUD tables and private projection.
- `activity_hud_test_api_v1`, version `20261019232618`: public Test API wrapper and synthetic-only RLS read policies.
- `activity_hud_api_privilege_fix_test_v1`, version `20261019232654`: explicit browser-role write privilege revocation and SELECT-only grant.

The public `v_activity_hud_test` view uses an invoker context and filters to `is_synthetic`. The browser `anon` role can select the wrapper and underlying synthetic rows under RLS. Writes are revoked. No service-role or database credential is used by the browser.

The Test verifier passed: exactly five synthetic activity rows, conservative states without false terminal resolutions, separate RunBook projection, and explicit grants/policies. A query under the actual `anon` database role returned those five rows. An HTTP GET to the Test Supabase REST endpoint returned status 200 and exactly these five activity keys: `synthetic-cancel`, `synthetic-completed`, `synthetic-deadline`, `synthetic-failed`, `synthetic-stale`. All were marked synthetic.

The migration ledger also contained `20261019_001_sdn_test_synthetic_ingestion`, version `20261019232639`, which is not part of this PR and has no matching migration file in the checked repository. It was left untouched. Its ownership and relationship to other Test work remain unresolved and should be reconciled before additional schema work.

## GUI and event handling

The Operator Console route `/activity` now reads `public.v_activity_hud_test` with the Test project URL guard, using a publishable browser key supplied locally through ignored `.env.local`. The actual key is not stored in the repository. The read is bounded to 1,000 rows, ordered with unresolved evidence first and oldest observation first, and repeated on manual refresh or every 30 seconds. The page shows the last successful read time, a limit warning, and a read failure state. A failed read clears previously displayed rows.

The page retains search, state and source filters, investigation ordering, evidence/timing details, and the bounded no-terminal-return export. It clearly describes the results as a bounded, changing view and does not claim complete history, a lossless feed, or snapshot consistency. No source adapters ingest GitHub Actions, OpenAI API jobs, Drive writes, native ChatGPT UI events, or other activity automatically.

No hosted GUI deployment occurred. PR #154 remains draft. Browser interaction could not be verified in this environment: the local loopback check did not connect, and no browser session was available for the built app. The Test REST read, local build, and CI checks were verified.

## Local verification

At GUI code head `c6b1b27eaff19d5c43ab1b4647f7810b48a7b463):

- 39 Operator Console tests passed with `node --import tsx --test test/**/*.test.ts`.
- `npm run typecheck` passed.
- `npm run build` passed and produced the static `/activity` route.
- The live Test Supabase REST read returned HTTP 200 and five synthetic rows.
- All 13 returned GitHub Actions workflow runs passed at this exact head:

| Workflow | Run ID |
| --- | ---: |
| Governed Provider Execution | 39342270727 |
| Live Foundry LF-3 Readiness | 39342270731 |
| Operator Console CI | 39342270729 |
| Foundry Runtime Orchestration | 39342270738 |
| Runtime Budget Authority Adapter | 39342270919 |
| DRB-002 Query Contract | 39342270834 |
| CI | 39342270842 |
| Live Foundry Stage 1 Readiness | 39342270800 |
| Activity HUD Test | 39342270841 |
| No Placeholder Policy | 39342270902 |
| Foundry Work Lease Kernel | 39342270721 |
| CoMind Repository Configuration | 39342270758 |
| Live Foundry LF-2 Readiness | 39342270743 |

## Remote checkpoint

Repository: `jlhogarth/CoMind`; PR [#154](https://github.com/jlhogarth/CoMind/pull/154); branch `activity-hud-test-001`; base `main` at `524f893fb6ac71aef3954f4cff9d592a2f5090e9`.

The GUI code head with exact passing workflow evidence is `c6b1b27eaff19d5c43ab1b4647f7810b48a7b463`. The preceding connection implementation head `cf808c68c1f4289859c5d0aa0b557bb62467bb39` also passed all 13 workflows; the final code head adds failure-state clearing.

PR #154 is to remain open and draft. No production endpoint, identity, grant, traffic, migration, or resource was changed.

## Next steps

1. Reconcile ownership and intent for Test migration `20261019232639` before further Test schema changes.
2. Add an acceptance case where a synthetic append arrives between cursor-page requests, and verify the reader continues to describe a bounded, changing view without implying snapshot consistency or a lossless feed.
3. Continue source adapters only within the Test boundary, preserving append-only observations and source evidence.


## SDN Test migration source reconciliation

The previously unrecognized Test migration `20261019_001_sdn_test_synthetic_ingestion`, version `20261019232639`, is the SDN-004 Test migration from issue #150 and draft PR [#151](https://github.com/jlhogarth/CoMind/pull/151), branch `issue-150-sdn-test-synthetic-ingestion`.

At the time of reconciliation, PR #151 was open, draft, unmerged, and mergeable at head `58de8355536d8f5a992671f00ab8a8a7d9c89fde`, with no submitted reviews. Its description identifies the Test project and migration version, states that live Test verification passed, and reports that synthetic fixture rows were rolled back. Its changed file is `db/migrations/20261019_001_sdn_test_synthetic_ingestion.sql`; corresponding verification is `db/migrations/verify_20261019_001_sdn_test_synthetic_ingestion.sql`. All 13 returned workflows passed at that exact head: Work Lease 39315692591, LF-3 39315692830, Foundry Runtime 39315692592, Stage 1 39315692732, SDN-001 39315692939, SDN-002 39315692582, No Placeholder 39315692589, Governed Provider 39315692480, LF-2 39315692522, Runtime Budget Authority 39315692498, CI 39315692484, Repository Configuration 39315692479, and DRB-002 Query Contract 39315692477.

This identifies the source and owner lane; it does not establish that the HUD owns or depends on SDN tables. The HUD work did not alter SDN schema objects or fixture rows. Keep SDN ingestion/provenance and HUD activity/RunBook projections separate.

## Changing-view cursor acceptance

A disposable PostgreSQL 17 CI test now reads a two-row first page from the synthetic latest-activity projection, appends a heartbeat to an already-seen synthetic activity, then reads the next keyset page. The test expects that the changed latest observation can move the activity onto the next page and therefore appear again with a newer state. The transaction rolls back, leaving no fixture changes.

This demonstrates one way rows can move between requests. It does not test front-end pagination, establish snapshot consistency, prove a lossless feed, or model every concurrent-write schedule. The GUI continues to describe its live query as bounded and changing.


## Append between cursor pages acceptance checkpoint

Implementation head `4605439d68333113c815c720ad1a6462f7769ce0` adds a disposable PostgreSQL 17 scenario to the Activity HUD Test workflow. It reads the first bounded page, appends a heartbeat to the already-seen stale synthetic activity, then reads the next keyset page. The changed latest observation moves that activity onto the second page with a newer state, so it appears again. The transaction rolls back. This is an observed changing-view case; it does not demonstrate front-end pagination or establish snapshot consistency, complete history, or a lossless feed.

At exact implementation head `4605439d68333113c815c720ad1a6462f7769ce0`, all 13 returned workflows passed:

| Workflow | Run ID |
| --- | ---: |
| Live Foundry LF-3 Readiness | 39351287395 |
| Activity HUD Test | 39351287425 |
| Governed Provider Execution | 39351287517 |
| CI | 39351287556 |
| Operator Console CI | 39351287520 |
| Live Foundry LF-2 Readiness | 39351287608 |
| Live Foundry Stage 1 Readiness | 39351287358 |
| Foundry Runtime Orchestration | 39351287367 |
| Runtime Budget Authority Adapter | 39351287406 |
| Foundry Work Lease Kernel | 39351287499 |
| CoMind Repository Configuration | 39351287523 |
| DRB-002 Query Contract | 39351287583 |
| No Placeholder Policy | 39351287559 |

The SDN migration source is identified as PR #151 as documented above. No SDN objects or records were altered by this acceptance.

Issue #153's original text says not to grant Data API access to `anon` or `authenticated`. The browser connection currently relies on the Test-only `anon` SELECT grant over the synthetic wrapper; no `authenticated` grant was added and write grants were revoked. This difference is recorded for scope reconciliation before PR #154 is accepted. PR #154 remains open and draft.

## Activity HUD pagination, filters, and browser acceptance

Implementation head `a8e215a861867f87f15a4c3b7aba193a06977ceb` adds client-side page navigation over the existing bounded, latest Supabase read. Operators can select 10, 25, or 50 rows per page and move to the first, previous, next, or last page. State, source, owner, confirmed-return, last-report-age, search, and sort controls reset to page one. Investigation ordering remains the default. The 1,000-row read cap and its warning remain in force; page navigation does not imply complete history or snapshot consistency.

The Chromium proof runs the local `/activity` route and intercepts the Test Supabase REST URL with 23 synthetic rows. It verifies page ranges and disjoint adjacent pages, first/previous/next/last controls, narrowing to no-terminal and owner results, reset to page one after filtering, confirmed failure filtering, recent-report filtering, and records without report timestamps. It uses no Supabase credentials and makes no live data request. Local screenshot visual inspection confirmed that the filters, visible range, page controls, and bounded-view notice fit together in the rendered page. The earlier live Test REST read of five synthetic rows remains separate evidence and was not repeated in this browser test.

Local verification at the implementation tree: `npm test` passed 44 tests; `npm run typecheck` passed; `npm run build` passed and emitted `/activity`; `npm run browser-test` passed in Chromium 140.0.7339.16 (Playwright build 1187). The local browser fixture is synthetic and intercepted. No production or Test database writes occurred.

The exact-head Operator Console CI workflow `39356211028` passed locked dependency installation, all 44 unit tests, typecheck, Chromium browser acceptance, screenshot upload, and build. Browser screenshot artifact `12235406952` has SHA-256 `2b8ae416dc81796c2e1629e835f9beba74384612375318b41bfec9e1c461c845` and is retained until 2026-10-27 01:57:39 UTC. Package-lock evidence artifact `12235521675` has SHA-256 `3a6534216c0a56c07a3bb38ff1930efffa741f4940774e5ad3f5c41965f6623d`.

At implementation head `a8e215a861867f87f15a4c3b7aba193a06977ceb`, 18 of 19 returned check runs passed. One run remains pending, not failed:

| Check | Run ID | Readback |
| --- | ---: | --- |
| Reject unresolved development markers | 39356211650 | Passed |
| DRB-002 Query Contract | 39356211156 | Passed |
| Live Foundry LF-2 Readiness | 39356211207 | In progress; no job steps exposed |
| Governed Provider Execution | 39356211185 | Passed |
| Repository health and Supabase configuration | 39356211161 | Passed |
| Activity HUD Test, PostgreSQL 17 | 39356211094 | Passed |
| Live Foundry LF-3 Readiness | 39356211096 | Passed |
| Foundry agent substrate | 39356211019 | Passed |
| Devcontainer runtime | 39356211019 | Passed |
| PM ledger migration | 39356211019 | Passed |
| Live Foundry Stage 1 Readiness | 39356211106 | Passed |
| Conversation lifecycle integration | 39356211019 | Passed |
| CI build group | 39356211019 | Passed |
| FinOps budget authority | 39356211019 | Passed |
| Foundry Work Lease Kernel | 39356211018 | Passed |
| Operator Console CI | 39356211028 | Passed |
| Runtime Budget Authority Adapter | 39356211044 | Passed |
| Foundry Runtime Orchestration | 39356211064 | Passed |
| Dev runtime verification | 39356211019 | Passed |

PR #154 was read back open, draft, unmerged, and mergeable at this checkpoint, with no submitted reviews. Its issue #153 access-boundary difference remains unresolved: the GUI uses the existing Test-only `anon` SELECT grant for the synthetic wrapper, while the issue text disallows Data API access to `anon` and `authenticated`. No grant was changed in this slice. PM decisions, RunBook events, Foundry authorization requests, and human-action assessments remain distinct. No production change or deployment occurred.

Next: inspect LF-2 run `39356211207` and document its terminal result. Keep PR #154 draft. Do not treat the mocked browser response as live Supabase browser acceptance or claim automatic capture of GitHub, ChatGPT, Drive, or other application activities.


## Test access scope clarification (2026-10-20)

Joseph clarified the Activity HUD issue goal to fit the intended Test monitor: issue #153 now explicitly permits the existing Test-only browser read path to the synthetic-only `public.v_activity_hud_test` wrapper using Supabase `anon`. To support its invoker-security view, `anon` also has schema USAGE and SELECT on the required underlying activity tables/view; RLS restricts visible activity/observation rows to synthetic data. No `authenticated` role or write access is granted. The browser rejects Supabase URLs outside project `sbgfuanxiqepcoboxzcl`. Formal HUD security reviews remain deferred; the issue clarification is not production authorization.

This resolves the prior mismatch between the issue text and PR #154. The Test grants and migrations already described above implement this scoped path; this clarification did not apply a database migration or change any Supabase grant. No production endpoint, identity, grant, traffic, migration, data, or resource changed.

PR #154 description now records the clarified scope and current limitations. At repository head `9461ead89c34f0be75805f0e774a2995c0b60e5c`, all 19 exact-head checks passed across 13 returned workflow runs: 39356629529, 39356629524, 39356629555, 39356629497, 39356629668, 39356629636, 39356629494, 39356629586, 39356629517, 39356629456, 39356629629, 39356629644, and 39356629641. The Chromium acceptance remains mocked with 23 synthetic rows; the separate earlier Test REST read returned five synthetic rows. Neither should be described as live-browser acceptance.

The pagination/filter implementation head remains `a8e215a861867f87f15a4c3b7aba193a06977ceb`. The repository continuation was updated in commit `12244bedd38dedec449ee61ec2643e812c9a8229`; this provenance update is being recorded in a subsequent documentation-only commit. PR #154 remains open and draft, with no production deployment or production changes.
