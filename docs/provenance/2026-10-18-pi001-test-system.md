# PI-001 isolated Test system proof

## Status

Verified repository and Test acceptance milestone on PR #147 head `0d0155285db497af51745964a08928aea8789686`. PR #147 remains draft, open and unmerged. This is an isolated development/Test proof, not production authorization or live integration.

## Change

Added a bounded read-only RunBook event projection at `/api/pi/events`, an optional lane filter in the opt-in connected reader, and a real end-to-end acceptance test. The test captures synthetic events through the existing Test RunBook function into a fresh PostgreSQL 17 database, then reads them through a restricted database role, local RunBook service, PI gateway and Chromium page. It verifies browser rendering, canonical lane summary update, append-only event retention, RLS/project scope, credential separation, audit redaction, revocation, fail-closed behavior, recovery and no database mutation by reads.

Evidence fields are rendered as text and remain source data. A bounded page is not a complete archive. A stored outcome does not prove current authority or independently verified evidence. PM and Foundry projects remain in separate source domains.

## Verification

All 11 returned exact-head workflows passed on `0d0155285db497af51745964a08928aea8789686`:

- [Primary Interface, run 39168308952](https://github.com/jlhogarth/CoMind/actions/runs/39168308952), including PostgreSQL capture, reader, gateway, browser proof, and artifact upload.
- [DRB-002 Query Contract, run 39168308948](https://github.com/jlhogarth/CoMind/actions/runs/39168308948).
- [Main CI, run 39168308973](https://github.com/jlhogarth/CoMind/actions/runs/39168308973).
- [No Placeholder Policy, run 39168308951](https://github.com/jlhogarth/CoMind/actions/runs/39168308951).
- The other seven returned workflows also completed successfully.

Primary Interface uploaded `drb-test-system-evidence` with acceptance JSON and a browser screenshot, retained through 2026-11-01 21:33 UTC. CI uses a fresh disposable service and destroys it after the job.

Local TypeScript build passed. Local complete server suite: 211 passed, 8 database-dependent skips. Local PI contract suite: 51 passed. Focused PI gateway, DRB query and security tests: 22 passed.

## Failure and correction

The first candidate `0b4309967840c89f2616656b2bfa75dd2d41f747` failed at actual RunBook capture because fixture source category `isolated-e2e` violates the repository `pm_events.source_system` check constraint. The fixture was changed to the existing `manual` category. A regression check now attempts an unsupported category and verifies both the expected check-constraint error and unchanged event count. The failed attempt only affected its disposable CI database, which was torn down by the job.

## Authority and limitations

Synthetic data and generated temporary Test identities only. No live Supabase or RunBook access, production database mutation or grant, paid provider, deployed service, production login issuer, independent security review, or activation occurred. The proof does not establish host/TLS deployment readiness, backup recovery, full CoMind acceptance, or a unified PI/PM/Foundry project crosswalk.

## Dependency readback

- #143 head `d889f2395648af90bb0b8235c43226168d2c4534`, still draft and based on BRAND #139.
- #139 head `c5fc5d8bfd818a3feb22f5585bde93059a255658`, still draft.
- #145 head `19b7cf8ad9e38dc1f6738925b6f7b4a09f09359a`; only `docs/runbook/DRB-002.md` differs from integrated runtime `5331d4e`.
- #119 head `f831b89e405351cbdbaaaf113f291f7a56d72215`, still separate and untouched.

No predecessor PR was merged or retargeted. Resume with current remote heads before further changes.

## Canonical RunBook event projection follow-up

Remote starting head was re-read on PR #147: `5304139659b5a612a2fca37bf94470edda542810`. It remained draft, open, unmerged and mergeable. Current dependency readback: PI #143 `d889f2395648af90bb0b8235c43226168d2c4534`, BRAND #139 `c5fc5d8bfd818a3feb22f5585bde93059a255658`, DRB #145 `19b7cf8ad9e38dc1f6738925b6f7b4a09f09359a`, and OC #119 `f831b89e405351cbdbaaaf113f291f7a56d72215`. All remain separate. Exact #147 starting-head workflows: 11 returned, all successful; no review submissions found.

Change: `projectRunbookEvents` now routes reviewed `comind_pm.v_runbook_timeline` fields through the shared canonical envelope. Event records include namespaced identity, source relation, per-record retrieval observation, unknown revision, disabled decisions, and explicit blockers for missing decision/authorization/verification relationships and evidence verification policy. The opt-in browser renders the projected rows. Unknown source fields remain excluded. No database query, role, grant, migration, or source relationship changed.

Local verification: PI suite 52/52 passed; complete server suite 211 passed, 0 failed, 8 database-dependent tests skipped; TypeScript build passed; focused gateway/RunBook tests 17/17 passed; no-placeholder and `git diff --check` passed. Local browser run stopped before launch because the pinned Chromium executable is not installed in this checkout; it is not a browser test pass.

Exact implementation head `2d718223bc0d120085d5470a413109ff107c62a5` passed all 11 returned PR workflows. Primary Interface run 39171293609 passed all four relevant steps: PI contract tests, browser navigation, connected trusted-read browser proof, and real PostgreSQL 17 capture-to-RunBook-to-browser acceptance. Artifact `drb-test-system-evidence` (acceptance JSON and screenshot) is available through 2026-11-01 22:14 UTC. DRB Query Contract 39171293512, Main CI 39171293678, and No Placeholder Policy 39171293483 passed; seven additional workflows also passed. No workflow failed or remains active at this head.

Limitations: This remains bounded history, not a complete archive or lossless cursor. RunBook has no concurrency revision or independently authored evidence verification state in this projection. The Foundry-to-PM crosswalk and complete lane/decision/authorization/verification semantics remain unresolved. Stored outcomes remain source claims, evidence stays text/data, controls remain disabled, default `index.html` disconnected, all Test identities synthetic, and production activation unauthorized. No live RunBook or database read/capture occurred. No Joseph action required.


## Reader failure-state and accessibility review, 2026-10-18

Review of exact starting head `2975e22be63ff7da75d74e884f93a646982bb6d6` confirmed #147 draft/open/unmerged/mergeable; #143 `d889f2395648af90bb0b8235c43226168d2c4534` remains stacked on #139 `c5fc5d8bfd818a3feb22f5585bde93059a255658`; #145 `19b7cf8ad9e38dc1f6738925b6f7b4a09f09359a` and #119 `f831b89e405351cbdbaaaf113f291f7a56d72215` remain separate. The 11 workflows returned for 2975e22 completed successfully; no PR #147 reviews were submitted.

Review found network failure and malformed/out-of-scope payloads were both exposed as generic `failed`. The isolated opt-in reader now distinguishes `forbidden`, `unavailable`, and `malformed`; successful empty pages remain `ready` with zero records. Decisions and Foundry UI explicitly describes bounded pages without asserting completeness. Refresh clears prior data; observation time is not turned into a freshness judgment because no owner-defined threshold exists. The page's forms and read results are moved inside the primary main landmark; live status announcements and text-only source rendering are retained.

Review confirmed event projection uses the shared envelope, source relation and event UUID, server retrieval observation, null revision, disabled decisions, bounded history and explicit relationship/evidence blockers. It introduces no event relationship or verification claim. Test acceptance is synthetic and isolated. No production reads, grants, deployment, activation, or crosswalk was added.

Local exact-head execution is unavailable from this checkout because it does not contain commit 2975e22 and outbound GitHub access is restricted. The changed head must not be called verified until required exact-head CI succeeds. Continue by reviewing current PI/DRB contracts and owners' crosswalk evidence; define mapping cardinality, lifecycle, access policy, provenance and verification before any cross-domain read. Keep the production boundary unchanged.


### CI review and repair of candidate 1d25fc0

Exact-head Primary Interface run 39177702879 and DRB-002 Query Contract run 39177702810 failed in the PI Node contract suite before browser or database acceptance ran. The new reader correctly returned `unavailable`/`malformed`, while older assertions expected generic `failed`; the controller had not yet admitted the new terminal states; the added event-state test lacked its `readTrustedEvents` import. No production or persistent Test database was involved. The correction updates controller state validation, aligns regression assertions, and is pending exact-head rerun. Candidate 1d25fc0 is not accepted.


### Browser failure and repair of candidate 2d312d2

The exact-head PI contract suite and DRB query tests passed, but Primary Interface run 39177801876 failed the connected browser proof before database acceptance. Moving all reader UI under `main` exposed that the lane renderer replaces its mount root's children during initialization, removing the forms. The page now gives lane rendering a dedicated child host and keeps the primary landmark intact; the skip control focuses the main content region. The PostgreSQL acceptance step was skipped after the browser failure. Candidate 2d312d2 is not accepted; the corrected page requires a fresh exact-head run.


## Reader-state and accessibility review acceptance

Implementation candidate `d9d1e634622a92f9068bc8f390a00316e110e253` passed all 11 returned workflows on exact head. Primary Interface run [39177942031](https://github.com/jlhogarth/CoMind/actions/runs/39177942031) passed PI tests, browser navigation, trusted-reader browser proof, and actual PostgreSQL 17 capture-to-RunBook-to-browser acceptance. DRB-002 Query Contract [39177942033](https://github.com/jlhogarth/CoMind/actions/runs/39177942033), Main CI [39177942016](https://github.com/jlhogarth/CoMind/actions/runs/39177942016), and No Placeholder Policy [39177942026](https://github.com/jlhogarth/CoMind/actions/runs/39177942026) passed; the other seven returned workflows passed. Artifact `drb-test-system-evidence` (ID `12154124720`) is retained through 2026-11-01 23:48:17 UTC.

The reader now distinguishes denied, unavailable, and malformed/out-of-scope responses. Successful empty remains a successful zero-row page. Previous results clear at refresh; bounded coverage remains bounded, even when no further page is reported. Observation time is shown without inventing a staleness threshold. The skip link targets the primary content landmark, source sections remain independently labeled, status updates use polite live regions, and lane rendering is isolated to its child host.

No database, RunBook, production roles, grants, deployment, activation, or production authorization changed. The Foundry UUID to PM project crosswalk remains an explicit blocker pending source-owner reviewed mapping, cardinality, lifecycle, read access policy, provenance and verification semantics. Lane, attention, revision, event relationship and evidence verification semantics remain incomplete; no unified operational assessment is claimed.


## Crosswalk contract review and current-head readback

At this checkpoint, remote PR #147 is `5026c26cea1f0e433e76aca0f580e6e1453ebccb`, draft/open/unmerged/mergeable, with no submitted reviews. Its 11 returned exact-head workflows succeeded. Primary Interface run 39178082601 passed browser and actual PostgreSQL 17 capture-to-RunBook-to-browser acceptance; DRB Query Contract 39178082577, CI 39178082610, and No Placeholder Policy 39178082768 also passed. The evidence artifact is retained through 2026-11-01 23:50 UTC.

The canonical contracts and source code were reviewed for cross-domain project identity. Foundry uses `comind.cm_project.project_id`; PM uses `comind_pm.pm_projects.id` and `project_key`. There is no declared key between them. Free-form source references and external IDs do not constitute a crosswalk. No source-owner-reviewed cardinality, lifecycle, access policy or provenance record was found.

Resolution gate: PI, Foundry and PM owners must approve a durable relation that identifies both keys, explicitly selects cardinality, defines effective/inactive/revoked lifecycle, records accountable authority, provenance and immutable revision, and specifies scoped read access independently for the mapping and each source. Zero, ambiguous, inactive, expired or unauthorized mapping results fail closed. Identifier similarity, project labels, first-match selection and free-form references are not evidence. No cardinality value is invented here.

No code or source query changed in this checkpoint. Foundry UUID and PM project reads remain distinct; the crosswalk blocker remains open. No unified operational assessment, production read, grant, deployment, activation or production authorization is claimed. #147 remains stacked on #143/#139; #145 and #119 remain separate.


## Canonical RunBook event foreign-key identity #006, 2026-10-19

Status: implementation candidate on PR #147, branch `pi-trusted-read-isolation`. The prior verified remote head was `e589b1b71436209b5cf3e0cd8f761d52d9891d0f`; exact-head verification for this candidate is pending until the new commit's workflows complete.

Finding: the live/test RunBook timeline view is defined from `pm_events` and LEFT JOINs `pm_work_items` on `wi.id = e.work_item_id`. The earlier PI event envelope retained the event UUID and a text work key, but omitted the actual FK identity. Projected events therefore could not reliably identify their canonical PM work item.

Change candidate: the fixed restricted query joins the timeline view to `pm_events` by event UUID and to `pm_work_items` by the declared FK. The response exposes event project UUID, canonical effective project UUID, optional work-item UUID, linked work-item project UUID, item type and all three source relations. The PI validator checks UUID shape, nullable relationship consistency and bounded provenance. A project mismatch remains visible with an explicit blocker. The opt-in page displays canonical UUIDs as text. Event rows with no linked work item remain representable. The existing disposable fixture has SELECT grants and RLS policies for all join sources, so no SQL migration, live grant or schema change was needed.

Verification planned: focused PI event projection and query tests; PostgreSQL 17 restricted-reader integration comparing response UUIDs directly to the database FK; actual capture-to-RunBook-to-PI-to-Chromium acceptance asserting the displayed work-item UUID; all returned exact-head workflows and no-placeholder policy. All fixtures must remain synthetic. No production or live Supabase writes are part of this implementation.

Open: exact-head CI, review and mergeability after the change; accepted event pagination remains bounded and not a complete or lossless feed; decision/authorization/verification relationship joins and evidence verification policy remain separate gaps; Foundry-to-PM project crosswalk remains unresolved. Preserve each source domain and disabled decision controls.

