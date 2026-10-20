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
