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


## Final code acceptance

Implementation head dc5abd25f55b9a3f126ca1fb190ccdb2bb4e25cc. PR #149 remained draft and open, unmerged, and mergeable; it had no submitted reviews at final code-head inspection. The code change is confined to browser history restoration and the synthetic system regression.

All 17 returned workflows passed on implementation head dc5abd25f55b9a3f126ca1fb190ccdb2bb4e25cc. Primary Interface e2e run 39311073401; DRB Query Contract 39311073332; CI/build 39311073284; No Placeholder 39311073311; remaining workflow runs: 39311074531, 39311073486, 39311073476, 39311073517, 39311073359, 39311073428, 39311073344, with the other jobs included in 39311073284. The acceptance completed 18 checks. Artifact drb-test-system-evidence ID 12215094538, retained until 2026-11-02 19:27:57 UTC; SHA-256 zip digest c7329466ed31846d830e46d41e688f8000707298b08c66b2c296c306b0c5dfea.

The 18 logged system checks were: invalid capture source leaves no partial row; real migration and capture function; append-only update/delete denial; database RLS excludes OTHER despite broad backend HTTP scope; same-time UUID keyset ordering across three pages without duplicates or omissions; bounded overflow/final-page state; project isolation; browser Back after older-page navigation; context switch then restoration of prior page cursor; Chromium rendering of actual event identity/source/result/literal evidence; lane projection updated by capture while reads do not mutate; failure and corrective recovery remain visible; operator/backend revocation clears data; unsafe DRB/PI audit files withhold data; DB loss and recovery; SQL timeout and recovery; reader restart preserves ledger/audit; project denial, payload-free audit, server-only credential and unchanged ledger.

An initial candidate at 8125265164e35b9d7abae6d5b9f565c1190bd229 failed at line 113 of the Test system script because a direct page-two expectation had not been updated for five same-timestamp records. The PI unit suite and browser proof passed, but end-to-end acceptance stopped before the new history case. Diagnostic run 39310810556 and artifact 12216555648 (SHA-256 3592ac4c111a0d1008c19aef240ee9d1df3f7d9dced8c375ee052dfe5fc6eb50) preserve this failure. The subsequent fix expects pages of two, two, and one; the verified head and successful evidence are listed above.

Boundaries: all rows and identities are synthetic/disposable; no Supabase/live RunBook access or append; no production decision, grant, identity, migration, deployment, paid resource or activation. Pagination remains bounded keyset navigation without snapshot consistency across requests, full-history or lossless-feed claims. Continue by verifying the documentation-only descendant's CI and current #149 state. Keep the PR draft; do not merge or mark ready.

## Exact-head documentation refresh

The implementation head dc5abd25f55b9a3f126ca1fb190ccdb2bb4e25cc passed all 17 workflows and 18 system checks. The following documentation-only head 0e33b7d103f57b81d35211e3b759f7b0755671aa also passed all 17 exact-head workflows and repeated the PostgreSQL 17.11/Chromium acceptance. On documentation head 0e33b7d103f57b81d35211e3b759f7b0755671aa, all 17 returned workflows passed: Runtime Budget Authority 39311426565; LF-2 39311426568; Foundry Agent, PM Ledger, Conversation Lifecycle, Build, Devcontainer, FinOps Budget and Dev Runtime checks 39311426614; Stage 1 39311426613; DRB Query Contract 39311426536; LF-3 39311426537; Primary Interface 39311426547; Work Lease 39311426552; Foundry Runtime 39311426538; No Placeholder 39311426521; Governed Provider 39311426506. The PostgreSQL 17.11 and Chromium acceptance passed 18 checks. Artifact 12215357945, retained until 2026-11-02 19:30:45 UTC; SHA-256 zip digest 908f65028be915d210bc8c3cf53a6722064466b45067ff8865140dcf79210c16.

At that readback PR #149 remained open, draft, unmerged and mergeable, without submitted reviews. Production remains staged.
## PI-001 changing event-window observation #009, implementation verified

Starting head `73d6d3660ce070b942f6b37267fcb21998a527c8` was re-read before editing. PR #149 was open/draft/unmerged/mergeable, with no submitted reviews. Its 17 returned checks on that starting SHA all passed. PR #143 was open/draft/mergeable at `b245ebc0b650baf7b7c289d189d347b07c9e81d6` with all 17 returned checks successful and no reviews. BRAND #139 was open/draft/mergeable at `c5fc5d8bfd818a3feb22f5585bde93059a255658` with all 18 returned checks successful and no reviews. DRB #145 was closed and merged.

Implementation head `6ca3756a130cdbfc073b743bc06ada19332ef922` updates the connected event status to state that pages independently observe a changing source, do not share a snapshot, and are not a complete archive. The browser acceptance reads page one from five tied synthetic events, appends a newer event through the existing append-only capture function, continues using the original cursor, verifies the newer event is not presented in that older cursor window, then refreshes page one and verifies the event appears.

Primary Interface run `39313866078` passed the PostgreSQL 17.11 and Chromium acceptance with 20 checks. The logged new checks confirm changing-view status and behavior across an append. Artifact ID `12216853647`, URL https://github.com/jlhogarth/CoMind/actions/runs/39313866078/artifacts/12216853647, retained through `2026-11-02T19:48:15Z`; GitHub artifact SHA-256 digest `918197845c6ca89d685523713d693c450fff8a276ed3acb8cd3b19aecc59a209`.

Exact-head CI on implementation head `6ca3756a130cdbfc073b743bc06ada19332ef922`: 16 of 17 returned check runs completed successfully. Passed workflow IDs: Primary Interface `39313866078`, DRB Query Contract `39313866185`, CI `39313866157`, No Placeholder `39313866095`, Stage 1 `39313866100`, LF-3 `39313866226`, LF-2 `39313866113`, Work Lease `39313866098`, Foundry Runtime `39313866079`, and Governed Provider `39313866080`. Runtime Budget Authority `39313866126` remains in progress, with no terminal conclusion, completed step or log evidence as of this record. Do not count that run as passed.

Local verification on this implementation: Node syntax checks, `git diff --check`, and 57 Primary Interface unit tests passed. Docker and local PostgreSQL were unavailable, so the system acceptance is established by the disposable GitHub Actions environment. The one append scenario does not establish general snapshot consistency, complete history, a lossless feed, or all possible concurrent-write behavior. Data and identities were synthetic and confined to disposable PostgreSQL/Test infrastructure. No production decision, grant, identity, migration, deployment, traffic route, paid resource, activation, or live RunBook append occurred. Source domains and the Foundry-to-PM crosswalk remain distinct and unresolved.

Next: inspect Runtime Budget run `39313866126`, re-read PR #149 and exact current head, then finish final documentation and exact-head verification. Keep PR #149 draft; do not merge or mark ready.


## PI-001 changing event-window observation #009, final exact-head record

Implementation head: `6ca3756a130cdbfc073b743bc06ada19332ef922`. PR #149 remains open, draft, unmerged and mergeable; no reviews were submitted at final readback. Primary Interface run `39313866078` passed 20 disposable PostgreSQL 17.11 and Chromium system checks. The new checks verify changing-source wording and behavior when a synthetic append arrives between cursor-page requests. Artifact `12216853647`, retained through `2026-11-02T19:48:15Z`; SHA-256 `918197845c6ca89d685523713d693c450fff8a276ed3acb8cd3b19aecc59a209`.

The implementation head had 16/17 returned check runs successful. Runtime Budget Authority run `39313866126` had no terminal conclusion or log evidence and is not counted as passed. The later documentation-only head `0e504f9d2aa27819b0b8a83227f9b066b70d762c` passed all 17 returned check runs: Primary Interface `39314751036`; DRB Query Contract `39314750905`; CI `39314751205`; No Placeholder `39314751067`; Stage 1 `39314750918`; LF-3 `39314751005`; LF-2 `39314750910`; Work Lease `39314750888`; Foundry Runtime `39314750886`; Runtime Budget Authority `39314750991`; Governed Provider `39314750921`. Its Primary Interface run repeated and passed all 20 checks. Artifact `12217735751`, retained through `2026-11-02T19:54:46Z`; SHA-256 `d4267babdd3695155cfd794e1af4160f52a8f630c7201612b603cb00e479f2ca`.

The append test reads page one from five same-timestamp synthetic events, appends a newer event using the existing append-only capture function, follows the original cursor and verifies the earlier cursor window does not show the newer append, then requests page one again and verifies that it does. This is one bounded scenario only. It does not establish general snapshot consistency, complete history, a lossless feed, or behavior under every concurrent mutation. Data and identities are synthetic and confined to disposable Test infrastructure. PM decisions, RunBook events, Foundry authorization requests and human-action assessments remain separate. No Foundry UUID-to-PM crosswalk or unresolved decision/authorization/verification/evidence relationship is inferred.

No production decision/change, grant, identity, migration, deployment, traffic routing, paid resource, activation or live RunBook append occurred. Next: perform review and acceptance work on PR #149, then identify the next canonical-read or operator-workflow Test gap. Keep PR #149 draft and unmerged.
