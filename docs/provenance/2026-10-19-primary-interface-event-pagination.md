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
- `npm run build --prefix server` passed.
- PI contract suite: 55 passed.
- Focused RunBook query and PI gateway suite passed, including same-timestamp keyset cursor unit coverage.
- Full server suite: 213 passed, 8 database-dependent skips, 0 failures.
- `git diff --check` passed.
- Local PostgreSQL, Chromium and Docker executables are unavailable, so local end-to-end DB/browser execution was not possible.

## Exact-head acceptance status

Pending. The actual PostgreSQL capture-to-RunBook-to-PI-to-Chromium workflow must prove three same-timestamp records, tuple order, limit overflow, cursor continuation without omissions/duplicates, project isolation, browser older-page navigation and browser Back, plus existing failure/unavailable behavior. Do not call this milestone accepted until exact-head CI runs are terminal and the acceptance artifact is inspected. Record workflow IDs, artifact ID and digest here after completion. The PR stays draft and unmerged pending full review.

## Open boundaries

This pagination provides bounded keyset navigation, not a snapshot across page requests, complete history or a lossless feed. Production remains staged pending platform selection, independent security review and explicit C4 authorization. The Foundry UUID to PM project mapping, decision/authorization relationships, event verification state and evidence verification policy remain unresolved. No live RunBook append or production source read occurred in this work.
