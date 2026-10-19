# PI-001 stable RunBook event pagination #007

Date: 2026-10-19 UTC. Human owner: Joseph Hogarth. Continuation authority: explicit instruction to continue PI-001 #147 in visible autonomous development. Tier T1, reversible repository and disposable Test changes only. Proposed NIST AC-3/AC-6/AU-3 traceability only; no assessed conformity. No exception.

## Starting evidence and dependencies

PR #147 was re-read at `72dea41631f58bf2bd6bc1aca48f7282cb1eaabc`: open, draft, unmerged and mergeable, no submitted reviews; all 11 returned workflows were terminal success. Base PI #143 was `d889f2395648af90bb0b8235c43226168d2c4534`, still stacked on BRAND #139 `c5fc5d8bfd818a3feb22f5585bde93059a255658`. DRB #145 remained separate at `19b7cf8ad9e38dc1f6738925b6f7b4a09f09359a`; PR #146 remains closed/merged. The starting live RunBook event is project-scoped with null work key; no lane association was inferred.

Required contracts read before implementation: `AGENTS.md`; `apps/primary-interface/CONTINUE.md`; `apps/primary-interface/docs/CANONICAL-READS.md`; `apps/primary-interface/docs/TRUSTED-READ-ISOLATION.md`; `docs/runbook/DRB-002-TEST-SYSTEM.md`; latest pre-change PI provenance `docs/provenance/2026-10-18-primary-interface-read-lifecycle.md`.

## Change and rationale

The prior event filter used a timestamp-only `since` value. At a same-timestamp boundary, timestamp comparison cannot identify the last row from the previous page. The RunBook event query now uses a descending keyset tuple `(occurred_at,event_id)`, ordered by timestamp then canonical event UUID, and retrieves `limit + 1` to determine whether an older page is available. The next cursor is the exact tuple of the final returned row. Both fields are required together and accepted only for event queries; timestamp-only `since` is rejected for events.

PostgreSQL `timestamptz` values are serialized as fixed six-fraction UTC text before they reach Node. This preserves PostgreSQL microseconds across cursor round trips because the default Node PostgreSQL parser converts timestamps to JavaScript `Date` with millisecond precision. Event projections validate descending order, UUID tie ordering, cursor equality to the final returned row, and strict progress after a supplied cursor. Source relation lineage, project/lane scope, observation time, null revision, blocked relationships and non-lossless bounded coverage remain explicit.

The opt-in reader supports page size selection, reads older events by cursor, and uses browser history to return to a prior page. Each request continues through the existing same-origin session, PI gateway and restricted RunBook reader. Project and lane scope are rechecked on each request. PM decisions, Foundry authorization requests and PI human-action assessments were not combined or changed.

## Affected resources and authority boundary

Changed resources are confined to PI reader JavaScript/HTML, PI gateway TypeScript, RunBook query service, focused tests, Test system acceptance, and documentation/provenance. No new identity or credential was introduced. Synthetic acceptance rows are captured using the existing function in a disposable PostgreSQL 17.11 database. Recovery is to revert the scoped PI branch commit; no source database rollback is required. No new dependency, model call, paid provider, external route, production grant, migration, deployment or activation is in scope. Expected overhead is one bounded upstream query and existing metadata audit per visited page, max 100 returned rows and existing timeout/byte limits.

## Local verification

- `npm ci --prefix server --ignore-scripts --no-audit --no-fund` installed pinned dependencies in the isolated checkout.
- `npm run build --prefix server` passed on the final implementation.
- PI contract suite: 57 passed on the final implementation.
- Focused RunBook query and PI gateway suite passed, including same-timestamp keyset cursor unit coverage.
- Full server suite: 213 passed, 8 database-dependent skips, 0 failures.
- `git diff --check` passed.
- Local PostgreSQL, Chromium and Docker executables are unavailable, so local end-to-end DB/browser execution was not possible.

## Exact-head acceptance

Final implementation head `56ea984215a2cce68ce84ed21b58626360158d52` passed all 11 returned PR workflows. Primary Interface [39181368911](https://github.com/jlhogarth/CoMind/actions/runs/39181368911), DRB-002 Query Contract [39181368955](https://github.com/jlhogarth/CoMind/actions/runs/39181368955), Main CI [39181368840](https://github.com/jlhogarth/CoMind/actions/runs/39181368840), and No Placeholder Policy [39181368860](https://github.com/jlhogarth/CoMind/actions/runs/39181368860) passed; the other seven returned workflows also passed: Governed Provider Execution 39181368850, LF-2 39181368836, Runtime Budget Authority Adapter 39181368783, Stage 1 39181368846, LF-3 39181368771, Work Lease Kernel 39181368913, and Foundry Runtime Orchestration 39181368808.

The PostgreSQL 17.11 capture-to-RunBook-to-PI-to-Chromium acceptance passed 17 checks using synthetic rows and disposable Test identities. It proves three same-timestamp records in descending UUID order, `limit + 1` overflow, exact tuple continuation with no duplicates or omissions, exclusion of OTHER project records, browser older-page navigation and history restoration, bounded final-page status, canonical event/work-item UUID rendering, append-only failure/recovery, revocation, audit-file failure, DB connection loss/recovery, statement timeout/recovery, and unchanged source data. Artifact [12156730726](https://github.com/jlhogarth/CoMind/actions/runs/39181368911/artifacts/12156730726), SHA-256 `8321abafe3c3ba63bed8b5ceccb7355f0debfc57fb574c024d96ed946267a97d`, retained through 2026-11-02 00:35:26 UTC. The artifact metadata identifies head `56ea984`; its embedded `GITHUB_SHA` is the PR merge ref used by Actions.

The first exact-head attempt exposed the page-size select's computed accessible name; the acceptance now selects the stable `#event-limit` control. Subsequent attempts caught two implementation/test issues: history restoration passed `cursor: null` instead of omitting the optional first-page cursor, and the browser test assumed unique UUID text where the work-item UUID correctly appears in several relation fields. The history listener now omits null cursors, and the test checks a matching UUID is present. The final tied-event fixture keeps its result summary aligned with the lane projection expectation. All repairs are included in the verified head above; no source DB or production resource was involved.

At final readback, PR #147 is open, draft, unmerged and mergeable at this head, with no submitted reviews or inline review threads. #143 remains open/draft/mergeable at `d889f2395648af90bb0b8235c43226168d2c4534` on #139 `c5fc5d8bfd818a3feb22f5585bde93059a255658`. #145 closed merged at `524f893fb6ac71aef3954f4cff9d592a2f5090e9`; comparison showed its delta from the supplied DRB head was documentation-only, with no runtime change affecting this integration. #139 remains open/draft/mergeable. No predecessor branch changed.

## Open boundaries

This pagination provides bounded keyset navigation, not a snapshot across page requests, complete history or a lossless feed. Production remains staged pending platform selection, independent security review and explicit C4 authorization. The Foundry UUID to PM project mapping, decision/authorization relationships, event verification state and evidence verification policy remain unresolved. No new live RunBook append or production source read occurred in this work.
