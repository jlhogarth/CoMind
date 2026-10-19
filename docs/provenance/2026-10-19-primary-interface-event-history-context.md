# PI-001 event history context #008

Date: 2026-10-19 (America/Indiana/Indianapolis)

## Authority and boundary

Visible autonomous development under the user's explicit direction to continue PI-001 and fully exercise CoMind Test before production decisions. T1 reversible repository/Test work. Production planning is allowed; no production decision or change is authorized by this milestone. No deployment, activation, production grant/identity/migration, traffic routing, paid resource, live source read, or live RunBook append occurred. PM decisions, RunBook events, Foundry authorization requests and human-action assessments remain distinct. No Foundry UUID-to-PM project crosswalk is inferred.

## Reconciled source state

- Repository: jlhogarth/CoMind.
- PR #147 merged at b245ebc0b650baf7b7c289d189d347b07c9e81d6; merged head was 47fe10c7a08799a881a947f37897f90fe96ac809. User-supplied acceptance: all 11 returned workflows passed on exact head; PostgreSQL 17.11 and Chromium passed 17 synthetic Test checks. Artifact 12156730726; SHA-256 8321abafe3c3ba63bed8b5ceccb7355f0debfc57fb574c024d96ed946267a97d.
- PR #143 open/draft/mergeable, head b245ebc0b650baf7b7c289d189d347b07c9e81d6, base BRAND #139 at c5fc5d8bfd818a3feb22f5585bde93059a255658; no reviews. All 11 exact-head workflows passed: 39309033079, 39309032821, 39309032721, 39309033009, 39309032899, 39309032954, 39309033414, 39309032735, 39309032898, 39309033093, 39309032840.
- BRAND #139 remains open/draft/mergeable at c5fc5d8bfd818a3feb22f5585bde93059a255658; no reviews. All 11 returned workflows on this exact head completed successfully: 39060466496, 39060466479, 39060466412, 39060466459, 39060466452, 39060466620, 39060466371, 39060466473, 39060466351, 39060466427, 39060466481.
- DRB #145 closed/merged at 524f893fb6ac71aef3954f4cff9d592a2f5090e9.

## Gap and implementation

The event reader stored a history page number and its cursor in a shared mutable array. A new event query resets that array, so browser Back to an earlier paginated event context cannot recover its cursor. This can leave the new page displayed while URL/history points at an older page. The #007 cursor query itself remains correctly bounded and tuple ordered; this is an operator navigation-state gap.

PR #149, draft and unmerged, branch pi-001-event-history-context-008, initial implementation head 75ee87c44cf6a7e10b5f91beaa8d291d255dfe07, changes apps/primary-interface/src/reader-entry.mjs and server/test/runbook-system.e2e.mjs. Each browser history state now carries the exact page cursor. Popstate restores that cursor and context. A new event query pushes a fresh page-zero state if an event history state already exists. The Test proof creates five same-timestamp events, walks three pages, changes lane scope, and returns to the prior page using browser Back.

## Verification status

No local checkout is present in the work environment, so local build or local PostgreSQL/Chromium execution was not possible. No success claim is made for PR #149 until exact-head workflows and the acceptance artifact are fetched and inspected. Initial PR creation reported mergeable=false while CI/base computation was starting; current mergeability must be re-read. Record final #149 head, review state, all workflow IDs/conclusions, acceptance check count and artifact checksum after exact-head CI completes.

## Limits and next step

Tuple cursor navigation remains bounded and non-snapshot across page requests. It is not complete history, a lossless feed, or protection from concurrent source changes. The e2e proof uses only synthetic rows and disposable PostgreSQL/Test identities. It is not live Supabase or production readiness. Next: resolve any exact-head CI failures, inspect actual browser and DB acceptance artifacts, then update this provenance and CONTINUE.md with final verification. Keep PR #149 draft, separate from decisions to merge/ready. Production platform, identity, security review and C4 activation authority stay deferred.
