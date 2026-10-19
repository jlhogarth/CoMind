# CoMind Continue PI-001 Operator Cockpit Development

OPERATING MODE: VISIBLE AUTONOMOUS DEVELOPMENT

Continue https://github.com/jlhogarth/CoMind/issues/142 on branch `issue-142-primary-interface-foundation`. Read AGENTS.md, `apps/primary-interface/README.md`, and `docs/provenance/2026-10-17-primary-interface-foundation.md` first. Inspect current branch/PR heads and CI before edits; do not assume frozen remote state.

Joseph accepted PI-001 product/interface architecture, not production acceptance. Accepted transition is `201481fd2974f0f921d73c9e81ef7be959a4d270`. BRAND-001 #138 / draft PR #139 remains visual/runtime substrate. Its expanded description is reconciled; validator repair is `c5fc5d8bfd818a3feb22f5585bde93059a255658`. PI has its own stacked branch and PR targeting BRAND until that dependency is accepted and merged. OC-002 #118 / draft PR #119 is separate; do not overwrite, duplicate or inherit its live authority.

Implemented: scope/backlog and ownership, reserved entity routes, human-action projection, pure evidence/freshness assessment, 24 synthetic local tests, PI CI. No operational browser or live integration is claimed. Existing brand cockpit mock remains a design fixture. Proposed cockpit SQL is not deployable acceptance evidence.

Next: read back exact-head CI and remediate failures. Implement read-only human-action detail, accessible keyboard navigation, deep links/back history, source inspection and explicit unavailable states. Discover actual canonical decision/RunBook/Foundry projections before selecting adapters. Continue P0 order: attention, navigation, lanes, VE operations, RunBook, evidence. Keep P1/P2/P3 backlog in README.

Supabase is transactional control plane; SDN is high-volume cognitive/evidence data plane. Every claim needs inspectable source/time; registered does not mean running; approval does not execute work. Future server decisions require identity, exact authority, revision/evidence revalidation, idempotent durable audit/RunBook recording. No browser secret/service-role credential. T1 repository work only: no production/database/security activation, destructive mutation, paid commitment or expanded authority.

No Hallucinations. No Lies. No delegated work should disappear silently. Report STATUS / CHANGED / WHY / IMPACT / VERIFIED / OPEN / NEXT, and JOSEPH only for required action. Refresh this file after material state changes.

## Human Attention and Navigation 002 checkpoint

Implemented read-only static browser view (`index.html`, `src/cockpit.mjs`, `src/navigation.mjs`) and source map (`docs/SOURCE-MAP.md`). Default browser contains no operational records and explicitly reports missing source integration. All decisions disabled. Hash entity deep links, query filters, native history, keyboard focus, skip link, evidence/RunBook references and supporting-record counts implemented. No live adapter chosen, because canonical source inspection found unresolved projection joins/revision/freshness requirements and private source boundaries.

Local contract/routing validation: 26 passed. Brand static and no-marker validators passed. Browser proof added with isolated pinned Playwright tooling in PI CI. Local Chromium installation failed because the download returned an invalid/truncated archive. Browser acceptance remains pending until exact-head CI executes the proof. Do not report browser success based on static or Node tests.

Before this slice, remote readback confirmed all returned checks passed on PI `041ed219024cf540997cbe32ae676215c024cfe6`, BRAND `c5fc5d8bfd818a3feb22f5585bde93059a255658`, and OC `f831b89e405351cbdbaaaf113f291f7a56d72215`. All three PRs remain draft, unmerged and cleanly mergeable at that readback. Read current heads again. Keep #143 stacked on #139 until accepted merge. No OC files changed.

Next: finish browser CI proof and repair any failure; verify mobile rendering and unavailable/partial/forbidden/malformed source behavior; then specify a reviewed trusted-server canonical projection before implementing live source integration. P0 lanes/VE/RunBook adapters remain open. No production activation or security expansion.

## Browser verification and next handoff

Implementation head `69ad323a66d9e74523f5ddb1b7ab55f3e771b757` passed the expanded Primary Interface browser and 26 contract/routing tests:
https://github.com/jlhogarth/CoMind/actions/runs/39063615542
No Placeholder Policy passed:
https://github.com/jlhogarth/CoMind/actions/runs/39063615500
Main CI (inspect completion/current head):
https://github.com/jlhogarth/CoMind/actions/runs/39063615520

First browser run failed because skip-link `#content` replaced the entity route. Repair `9050633d0282cceab8daefaf29dec21853d649ac` prevents that route mutation and moves focus directly. Repaired proof passed, then `69ad323` expanded source-state coverage and passed again. Browser acceptance here is synthetic development verification, not live data, production identity, assistive-technology certification or deployment acceptance.

Next chat title: CoMind Continue Primary Interface PI-001 Canonical Read Projections #003.
Read current PR #143 / #139 / #119 heads and all checks first. Continue T1 reversible repository development with existing authority boundaries. Specify and test canonical read projections for attention and development lanes from existing Foundry and PM/RunBook sources. Missing joins, revisions, freshness or access policy remain explicit blockers owned by PI/Foundry/DRB integration owners. Do not expose private schemas, create duplicate registries, infer executing VEs or enable decisions. Preserve BRAND dependency and OC ownership. Refresh this handoff at consequential changes. Report STATUS / CHANGED / WHY / IMPACT / VERIFIED / OPEN / NEXT; JOSEPH only when action is required.

## Canonical Read Projections 003 checkpoint

Read current remote state before further changes. This slice adds a pure canonical projection module and tests, plus docs/CANONICAL-READS.md. Local suite: 31 passed. Source domains remain separate; source UUIDs/status values and bounded coverage preserved; missing joins/revision/evidence/access remain explicit. Browser stays unavailable and decision controls disabled. No live DB capture claimed.

Inspected DRB-002 at 842f0cd on drb-002-governed-query (issue #144). Its read service remains an unactivated prototype. Its lane response lacks UUID required by PI's canonical work-item identity. Coordinate via durable evidence; do not merge or change DRB work solely for PI convenience.

Next: independently review projection contracts and field semantics, resolve lane UUID/field contract with DRB and authored attention/revision/evidence contract with Foundry. Establish tested trusted-server operator read access under separate activation authority before browser integration. Keep #143 draft and stacked on #139; OC #119 stays separate. Inspect exact-head CI after publication. P0 VE/RunBook/evidence integration remains open.

## Lane presentation and DRB reconciliation checkpoint

Joseph authorized proceeding with the tested lane contract. Integration PR #146 merged into drb-002-governed-query at 720209a518e440f29d2418145b962ba8232ca164; DRB #145 remains a separate unmerged development PR. No dependency production merge or deployment. PI adopts the identical pure DRB lane adapter/test, adds read-only lane list/detail presentation, preserves filters/history and displays bounded coverage/provenance plus explicit integration gaps. Browser entry remains missing live source and contains no fixture records.

Local suite: 34 tests passed; no-placeholder gate passed. Expanded synthetic browser proof requires exact-head CI before acceptance. Verify current #143/#145/#139 heads and reconcile newer changes before further work. Next: complete browser proof, verify lane source contract remains compatible with DRB, then implement reviewed operator read transport in isolation. Identity/TLS/audit/live activation remain open. No live RunBook capture occurred. Decision controls remain disabled. Record exact-head CI in PR #143 after readback; do not infer earlier CI proves newer changes.

Browser run 39070043604 failed at exact accessible-name lookup for the lifecycle select. Native wrapped label included option text in its computed name. Added explicit aria-label to lane search/lifecycle controls; preserved exact-name assertions. Repaired head requires its own browser CI proof.

Second browser run 39070141658 passed accessible-name selection but failed filter retention. Proof clicked a preexisting one-record link before hashchange rendered its filtered URL. Added an explicit wait for the rendered detail link to include both q=Synthetic and state=review before keyboard activation. Filter/history assertions remain unchanged; repaired proof requires exact-head readback.

## Trusted read isolation checkpoint

Joseph authorized building/testing the trusted connection in isolation. Integration branch pi-trusted-read-isolation combines PI d889f23 and current DRB 5331d4 without changing either source branch or main. It adds a loopback-only PI gateway, separate private operator-session/backend credential files, current expiry/revocation/scope checks, bounded upstream fetch, allowlisted response validation and fail-closed audit. Browser readTrustedLanes uses only same-origin session cookies and clears unavailable reads. Default browser entry stays disconnected.

Read docs/TRUSTED-READ-ISOLATION.md and docs/provenance/2026-10-17-primary-interface-trusted-read.md, integration PR and exact-head CI first. Local gateway tests and build passed; actual PostgreSQL extension and connected browser proof require exact-head CI before success claims. No production activation or real operator session issuer established. Next: finish isolated proof, independently review credentials/origin/scope/audit/failure paths, then reconcile/adopt with current PI/DRB heads. Deployment still needs confirmed host/TLS/proxy/session issuer/audit storage and explicit activation authority. No live RunBook capture claimed. Preserve evidence and do not leave jobs silently running.

## Trusted reader review and usable isolated page checkpoint

Remote #147 remained at dd946ce, PI #143 at d889f23 and DRB #145 at 5331d4 during review. Continued T1 development on #147, preserving the production deferral pending PDP-001 #140/#141. Added opt-in reader.html with an explicit project read form, and request controller with cancellation, generation checks, immediate old-source clearing, stop cleanup and bfcache reload. Only the latest request can publish; late older success cannot replace newer denial or another project.

Local 40 PI tests pass. New regression first failed because the controller API did not yet exist; implemented and verified the missing sequencing behavior. Browser proof now uses the actual connected page/form instead of manually mounting fetched results, and verifies revocation, project denial and mobile overflow. Exact-head CI must verify these new browser steps. No source branch adoption/production merge, host choice, live records or RunBook capture. Engineering review is not independent security sign-off. Next: verify this checkpoint, review gateway capacity/timeout denial proofs, then reconcile only reviewed development changes while deployment remains staged.

## Project decisions trusted-read extension

Starting remote heads were re-read: PR #147 `5be8e23f76a7af66ac1de6c91ef5e7dd6569316c` draft/open/cleanly mergeable; #143 `d889f2395648af90bb0b8235c43226168d2c4534`; #145 `5331d4e1625797ae8257120fc76faf9efa8a6af4`; #139 `c5fc5d8bfd818a3feb22f5585bde93059a255658`; #119 `f831b89e405351cbdbaaaf113f291f7a56d72215`. The 11 workflows on #147 exact head were terminal success. No predecessor branch or main changed.

T1 isolated development extends the PI/DRB test integration with `GET /api/pi/decisions`, a fixed allowlisted `decisions` query, explicit PM ledger columns, UUID joins through `pm_work_items` and `pm_projects`, a canonical PI adapter, and separate browser rendering. Both lane and decision endpoints use the existing same-origin operator cookie, project checks, distinct server-only backend identity, bounded response/time/concurrency, private audit and fail-closed behavior. `reader.html` remains opt-in; `index.html` remains disconnected. PM decisions remain distinct from Foundry authorizations and from PI's human-action assessment. No decision buttons are added.

The isolated PostgreSQL test fixture adds SELECT and a COMIND-only policy for `pm_decision_records`, verifies missing privilege is rejected, and checks no OTHER project rows are returned. This is under `db/test/`, not a production migration or grant. No live database or RunBook writes occurred. Foundry project UUID to PM project-key mapping remains unresolved, so Foundry reads stay blocked rather than being combined by assumption.

Local validation: TypeScript build; 65 focused PI/server contract tests; full server suite (209 passed, 7 database-dependent skips); no-placeholder and whitespace checks passed. Local browser proof could not start because this worktree has no Playwright Chromium binary; local PostgreSQL and Docker are unavailable. The exact-head CI below supplies browser and disposable PostgreSQL/RLS proof. Review docs/CANONICAL-READS.md, docs/TRUSTED-READ-ISOLATION.md and docs/provenance/2026-10-18-primary-interface-read-lifecycle.md. Preserve #143's BRAND stack and do not edit #119 files.

On implementation head `1f2ba55664e2b831e656302417f238ae46a864e7`, all 11 returned exact-head workflow runs completed successfully and PR #147 remained draft/open/mergeable. Primary Interface browser proof: https://github.com/jlhogarth/CoMind/actions/runs/39086241132 . DRB PostgreSQL 17 restricted-reader and PI gateway proof: https://github.com/jlhogarth/CoMind/actions/runs/39086241115 . Main CI: https://github.com/jlhogarth/CoMind/actions/runs/39086241071 . No Placeholder: https://github.com/jlhogarth/CoMind/actions/runs/39086241066 . Other passed runs: LF-3 https://github.com/jlhogarth/CoMind/actions/runs/39086241051 ; Governed Provider https://github.com/jlhogarth/CoMind/actions/runs/39086241053 ; Foundry Runtime https://github.com/jlhogarth/CoMind/actions/runs/39086241067 ; Stage 1 https://github.com/jlhogarth/CoMind/actions/runs/39086241072 ; Runtime Budget https://github.com/jlhogarth/CoMind/actions/runs/39086241102 ; LF-2 https://github.com/jlhogarth/CoMind/actions/runs/39086241124 ; Work Lease https://github.com/jlhogarth/CoMind/actions/runs/39086241222. No live reads or RunBook capture occurred. Continue Foundry join/access contract only after evidence establishes its project mapping and reviewed read role. Keep production staged pending PDP-001, independent review and explicit C4.

Repository definitions confirm the Foundry/PM scope gap: Foundry authorization requests reference `comind.cm_project.project_id`; PM rows use `comind_pm.pm_projects.id` and `project_key`. PM `source_ref` and `pm_links.external_id` are free-form references, not a declared crosswalk. An owner-reviewed mapping, cardinality/lifecycle rules and corresponding scoped read role are necessary before connecting Foundry requests to a PM-selected project. PI, Foundry and PM source owners resolve this. Do not infer equivalence from matching strings or UUID values.

## Native Foundry UUID read checkpoint

The PM crosswalk is not needed to inspect Foundry in its own domain. A new isolated path reads only `comind.cm_foundry_authorization_request` under its canonical Foundry `project_id` UUID. It uses optional PI session `foundryProjectIds` scope, a separate `PI_FOUNDRY_DATABASE_URL` and pool, a fixed 15-column query, a read-only transaction, 3-second DB timeout, 1..100 page bound, source envelope validation and metadata audit. Startup rejects the wrong DB login, table owner, missing RLS, role membership, broad SELECT, write/DDL access or accessible security-definer functions. No PM key or inferred join is used.

`reader.html` now has a third, separate Foundry request form and renders source fields as text. Request status, reason, requested authority and evidence references remain source claims. They do not establish current approval authority, verified evidence, a lane relationship or a complete attention assessment. All decision controls remain unavailable. The default index remains disconnected.

Test changes are in scope. `db/test/pi_foundry_reader.sql` is only a disposable CI role/grant and one-fixed-UUID RLS fixture, not a migration or deployment instruction. The first disposable PostgreSQL attempt caught a UUID/slug parameter ordering error in the fixture; the next reached startup and failed least-privilege preflight. The diagnostic run identified PostgreSQL's default PUBLIC EXECUTE on a `SECURITY DEFINER` function. The fixture now revokes function execution from PUBLIC and the reader role. The preflight continues to block such access in any live configuration.

Implementation head `c6723fd3a4b7a6bc02f5d2d1ee494881b3e4694e` passed all 11 returned workflows. Primary Interface, including actual-page browser proof: https://github.com/jlhogarth/CoMind/actions/runs/39087449526 . Main CI, including server tests and PostgreSQL 17 Foundry restricted-reader/RLS proof: https://github.com/jlhogarth/CoMind/actions/runs/39087449516 . DRB query contract: https://github.com/jlhogarth/CoMind/actions/runs/39087449513 . No Placeholder: https://github.com/jlhogarth/CoMind/actions/runs/39087449540 . Also passed: Stage 1 https://github.com/jlhogarth/CoMind/actions/runs/39087449515 ; Runtime Budget https://github.com/jlhogarth/CoMind/actions/runs/39087449521 ; Governed Provider https://github.com/jlhogarth/CoMind/actions/runs/39087449507 ; LF-3 https://github.com/jlhogarth/CoMind/actions/runs/39087449517 ; Work Lease https://github.com/jlhogarth/CoMind/actions/runs/39087449514 ; Foundry Runtime https://github.com/jlhogarth/CoMind/actions/runs/39087449535 ; LF-2 https://github.com/jlhogarth/CoMind/actions/runs/39087449506 .

Local build, complete server suite (210 passed, 8 database-dependent skips), PI suite (48 passed), no-placeholder and diff checks passed. The local PostgreSQL integration skips because this worktree has no PostgreSQL service. CI used synthetic Foundry projects/requests and a disposable Test database. No live database access or RunBook capture occurred.

Production Foundry reads remain blocked on a reviewed production login and row policy, operator UUID assignments, host/TLS/session issuer, persistent audit review, independent security review and explicit production authority. No production database connection, data read, grant, migration, or RunBook capture occurred.

Next: verify current #147 remote head before publishing, run exact-head PostgreSQL and browser jobs, diagnose any failures, then record terminal results in this continuation and provenance. Preserve #143's BRAND dependency and #119 ownership. The cross-domain project mapping and complete attention evidence/revision/RunBook contract remain open. No user action is currently required.


## DRB Test system integration candidate

Joseph now requires end-to-end Test acceptance before production-platform selection. Continued on a separate branch from inspected #147 head 6ffcabc1cad349241149286af5ea2a44c8edebd0. Adds read-only RunBook events, optional lane filter and a mandatory actual PostgreSQL capture-to-browser acceptance proof. Read docs/runbook/DRB-002-TEST-SYSTEM.md for exact boundaries, reproduction and evidence outputs. Production deferral does not block this isolated development. No predecessor branch, production schema or live grant changed. Local build and focused projection/gateway tests passed; PostgreSQL/browser proof must pass on the candidate's exact head before acceptance. Reinspect remote heads before adoption; coordinate with PI through the stacked reviewable diff. No recurring service or monitor is installed.

## Exact-head isolated Test acceptance checkpoint

Remote review before continuation: #147 was `6ffcabc1cad349241149286af5ea2a44c8edebd0`; #143 remained `d889f2395648af90bb0b8235c43226168d2c4534`, stacked on BRAND #139 `c5fc5d8bfd818a3feb22f5585bde93059a255658`; DRB #145 had advanced to `19b7cf8ad9e38dc1f6738925b6f7b4a09f09359a`, with only `docs/runbook/DRB-002.md` changed relative to integrated runtime `5331d4e`; OC #119 remained separate at `f831b89e405351cbdbaaaf113f291f7a56d72215`. No dependency was merged or retargeted.

Candidate head `0d0155285db497af51745964a08928aea8789686` passed all 11 returned exact-head workflows. The first system proof at `0b4309967840c89f2616656b2bfa75dd2d41f747` failed at database capture because the fixture used unsupported source category `isolated-e2e`. The repository constraint permits `manual`, `supabase`, `github`, `notion`, `drive`, `linear`, and `chatgpt`. The fixture now uses `manual` and asserts an unsupported source is rejected without inserting a partial event. On the repaired exact head, Primary Interface run [39168308952](https://github.com/jlhogarth/CoMind/actions/runs/39168308952) passed the real PostgreSQL capture-to-RunBook-to-browser proof; DRB Query Contract [39168308948](https://github.com/jlhogarth/CoMind/actions/runs/39168308948), Main CI [39168308973](https://github.com/jlhogarth/CoMind/actions/runs/39168308973), and No Placeholder [39168308951](https://github.com/jlhogarth/CoMind/actions/runs/39168308951) also passed. All seven other returned workflows passed. The Primary Interface run preserved `drb-test-system-evidence` (acceptance JSON and browser screenshot) for 14 days.

Local TypeScript build passed. Complete server suite: 211 passed, 8 database-dependent tests skipped; PI contract suite: 51 passed; focused gateway/RunBook/security suite: 22 passed. The isolated system acceptance itself ran in CI with fresh PostgreSQL 17 and synthetic rows. It verified append-only capture/recovery, project RLS, read-only UI, secret separation, revocation, audit failure, database loss, SQL timeout, service restart, payload-free audit and no source mutation from reads. No live database was read or written. No production integration, host selection, production authorization, independent security approval, or activation is claimed.

PR #147 remains draft, open, unmerged and mergeable, based on PI #143. The local recovery checkout preserves the same final tree; its local checkpoint commit ID differs because GitHub's connected repository writer created the remote commit. Continue from current remote heads, not a guessed matching local branch name. Keep production staged and resolve the Foundry-to-PM project crosswalk and complete attention/evidence/revision semantics before claiming a unified projection.

## Canonical RunBook event projection follow-up

Current remote checkpoint before this follow-up: PR #147 `5304139659b5a612a2fca37bf94470edda542810`, draft/open/unmerged/mergeable; #143 `d889f2395648af90bb0b8235c43226168d2c4534`; #139 `c5fc5d8bfd818a3feb22f5585bde93059a255658`; #145 `19b7cf8ad9e38dc1f6738925b6f7b4a09f09359a`; #119 `f831b89e405351cbdbaaaf113f291f7a56d72215`. The #147 head returned 11 successful workflows and no submitted reviews. Dependencies remain separate and unchanged.

Follow-up aligns the RunBook event adapter with `pi-canonical-read.v1`, gives each projected event source relation/ID/observation/revision/blocker fields, and makes the opt-in browser render projected records. It adds no source joins or authority. Local validation: PI suite 52 passed; full server suite 211 passed and 8 database-dependent tests skipped; trusted-reader build passed; gateway/RunBook focused server tests 17 passed; no-placeholder and diff checks passed. Local browser proof could not start because the pinned Playwright Chromium binary is absent. Exact implementation head `2d718223bc0d120085d5470a413109ff107c62a5` then passed all 11 returned workflows. Primary Interface run 39171293609 passed browser navigation, connected-reader browser proof and actual PostgreSQL capture-to-RunBook-to-browser acceptance. It uploaded `drb-test-system-evidence` (acceptance JSON and browser screenshot), retained through 2026-11-01 22:14 UTC. DRB Query Contract run 39171293512, Main CI run 39171293678 and No Placeholder run 39171293483 passed; the other seven returned workflows also passed. This verifies the isolated synthetic Test path only.

The source still has no event concurrency revision, cursor or authored evidence verification state. The Foundry-to-PM mapping, lane/decision/authorization/verification relationships, freshness thresholds and evidence verification/expiry/conflict policy remain open. Do not infer a unified attention assessment. Keep `index.html` disconnected, `reader.html` opt-in, decisions disabled, all fixture data isolated, and production staged. No Joseph action is required unless a contract owner decision or activation boundary is reached.


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


## Owner-reviewed crosswalk continuation, 2026-10-18

Re-read PR #147 at `5026c26cea1f0e433e76aca0f580e6e1453ebccb`, its dependencies, reviews and exact-head checks before this checkpoint. #147 remains draft/open/unmerged/mergeable, based on #143 at `d889f2395648af90bb0b8235c43226168d2c4534`; #143 remains based on #139 at `c5fc5d8bfd818a3feb22f5585bde93059a255658`. #145 at `19b7cf8ad9e38dc1f6738925b6f7b4a09f09359a` and #119 at `f831b89e405351cbdbaaaf113f291f7a56d72215` remain separate. No PR #147 reviews are submitted. All 11 workflows returned for #147 head 5026c26 completed successfully, including the browser and actual PostgreSQL 17 capture-to-RunBook-to-browser acceptance. Artifact `drb-test-system-evidence` is retained through 2026-11-01 23:50 UTC.

Source-boundary review found no declared Foundry UUID to PM project relationship. Foundry requests use `comind.cm_project.project_id`; PM records use `comind_pm.pm_projects.id` and `project_key`. Free-form refs and external links do not prove equivalence. No owner-reviewed mapping, cardinality, lifecycle rule, read policy or mapping provenance was available in the source contracts. No mapping is inferred or added.

For the source owners' review, a durable crosswalk must identify both canonical keys, explicitly choose supported cardinality, define effective and revoked lifecycle behavior, identify mapping record authority and immutable revision/provenance, and specify separate read authorization and row policy for the mapping and each source. Resolution must fail closed for absent, inactive, unauthorized, or ambiguous mappings; it must never choose a first match. These are acceptance requirements, not a decision that cardinality is one-to-one or one-to-many. Until owners supply that evidence, native Foundry UUID reads and PM project-key reads remain separate and no unified operational assessment is allowed.

Continue by obtaining and recording the joint PI, Foundry and PM owner decision. Do not add source joins or real mapping values before it. Keep the disconnected `index.html`, opt-in `reader.html`, disabled decisions, isolated fixtures and production boundary unchanged.


## Exact-head owner-review gate verification

Re-read remote state before this checkpoint. PR #147 head `105abe451c46281a464bd7de2bf9c8956988d010`, draft/open/unmerged/mergeable, based on #143 head `d889f2395648af90bb0b8235c43226168d2c4534`. #143 remains based on BRAND #139 head `c5fc5d8bfd818a3feb22f5585bde93059a255658`. DRB #145 remains draft/open on `19b7cf8ad9e38dc1f6738925b6f7b4a09f09359a`; OC #119 remains separate at `f831b89e405351cbdbaaaf113f291f7a56d72215`. PR #147 has no submitted reviews or unresolved inline review threads.

Head `105abe451c46281a464bd7de2bf9c8956988d010` records the source-owner review gate for a Foundry UUID to PM project crosswalk. All 11 returned pull-request workflows passed on this exact head: Primary Interface run 39178583301, DRB-002 Query Contract 39178583330, Main CI 39178583290, No Placeholder Policy 39178584127, and the seven other returned workflows. The Primary Interface run passed browser navigation, trusted-reader browser proof, and actual PostgreSQL 17 capture-to-RunBook-to-browser acceptance. That acceptance used disposable PostgreSQL and synthetic records/identities; it is not a live database read or production access proof.

No production grants, database changes, deployment, activation, or live RunBook read occurred. The Foundry UUID to PM project relationship remains unestablished. Preserve separate native-scope reads; do not add a cross-domain join or mapping value until PI, Foundry and PM owners provide a reviewed mapping contract with cardinality, lifecycle, authority, revision/provenance and independent read policy. This continuation update is documentation only and requires fresh exact-head checks on its resulting commit.


## PI-001 Canonical RunBook event identity #006

Resume PR #147, branch `pi-trusted-read-isolation`, from the current remote head recorded in the latest provenance section. This milestone extends the tested event projection using the existing declared foreign keys: the event source now exposes canonical PM project UUID, optional event project UUID, optional linked work-item UUID, linked work-item project UUID, and item type. The restricted query explicitly joins `v_runbook_timeline` to `pm_events` by event UUID and `pm_work_items` by `work_item_id`. The opt-in browser shows the UUIDs separately from text keys. No schema, grant, identity, Foundry mapping, authority, or production access changes are included.

Read `AGENTS.md`, `apps/primary-interface/docs/CANONICAL-READS.md`, `apps/primary-interface/docs/TRUSTED-READ-ISOLATION.md`, `docs/runbook/DRB-002-TEST-SYSTEM.md`, and the newest `docs/provenance/2026-10-18-pi001-test-system.md` section. Then inspect current PR #147/#143/#145/#146 heads, reviews, mergeability and exact-head checks before continuing. Test work is synthetic and disposable. Production remains staged pending platform decision, independent security review and explicit C4 authorization. PM decisions, RunBook events, Foundry requests and human-action assessment remain distinct.



## Current verified continuation, PI-001 Canonical Read Projections and Test System #006

**Latest verified implementation head:** `976de5bf8f2dc30456ca7936b14a0bad7db05eef`  
**PR:** https://github.com/jlhogarth/CoMind/pull/147  
**Branch:** `pi-trusted-read-isolation`  
**State:** open, draft, unmerged, mergeable, based on PI foundation #143 at `d889f2395648af90bb0b8235c43226168d2c4534`. No submitted reviews or inline review threads.

The event projection now carries canonical PM project and event UUIDs, optional linked work-item UUID and project UUID, and item type. The trusted query uses the declared `pm_events.work_item_id` foreign key to `pm_work_items.id`. The opt-in browser displays UUIDs distinctly from work keys. Events without a linked item remain explicit; project mismatch produces a blocker. PM decisions, RunBook events, Foundry authorization requests, and human-action assessments remain separate.

All 11 returned exact-head workflows passed on `976de5b`, including Primary Interface, DRB-002 Query Contract, main CI, and No Placeholder Policy. The Primary Interface job passed browser navigation, trusted-reader browser proof, and actual PostgreSQL 17.11 capture-to-RunBook-to-PI-to-Chromium acceptance. The system proof passed 13 checks covering capture validation, actual migrations, append-only behavior, RLS/project isolation, canonical event and lane UUIDs, browser text rendering, revocation, audit failure, database loss, SQL timeout, recovery, service restart, and unchanged source data. All rows and identities were synthetic and confined to disposable Test infrastructure.

Acceptance artifact: https://github.com/jlhogarth/CoMind/actions/runs/39179222357/artifacts/12154873581 (SHA-256 `a159e10831c39f624ec0a81cc801090e1c983437f8674fa409804ba13964ae8b`, retained through 2026-11-02 00:06:51 UTC).

The first candidate `d9455a6` failed on stale test fixtures and an overly narrow SQL assertion. A concurrent commit `976de5b` updated the reader and gateway fixtures to the three-relation event envelope and corrected the assertion to test the COALESCE expression and selected FK fields separately. Runtime validation stayed strict. All 11 workflows passed after these repairs.

Append-only live RunBook event: `668a64e1-2a8f-499b-81a6-6e8a4473bd9e`. It was read back from `comind_pm.v_runbook_timeline` with outcome pass. It is attached to COMIND project scope with null `work_key`: the live ledger contains no PI-001 work item, so no lane association was invented. Existing RunBook state is on active Supabase project `sbgfuanxiqepcoboxzcl`, PostgreSQL 17.11.

Dependencies at this checkpoint: #143 remains draft on BRAND #139 head `c5fc5d8`; #145 remains separate and draft at `19b7cf8`; #146 is closed and merged into its DRB development history. PR #147 remains stacked on #143. No source dependency was overwritten.

**Open:** the Foundry UUID to PM project crosswalk is still unresolved; no unified cross-domain assessment is allowed. Event coverage is still bounded and has no cursor. Timestamp-only `since` filtering can omit same-timestamp ties, so the next useful T1 task is stable tuple-cursor pagination using `(occurred_at,event_id)`, with same-timestamp, overflow, project-scope, and browser tests. Decision/authorization/verification relationship semantics and evidence verification remain explicit gaps.

Production remains staged pending platform selection, independent security review, host/TLS/session issuer and durable audit review, and explicit C4 authorization. No production grants, identities, migrations, routing, paid resources, deployment, or activation changed here.

Resume by re-reading current #147/#143/#145/#139 heads, reviews, mergeability and exact-head checks before editing. Preserve the project-only RunBook event and the separate domain reads. Continue with the bounded event cursor only in isolated Test; do not infer the Foundry crosswalk or create a production path.


## PI-001 stable RunBook event pagination #007, implementation candidate

Starting remote checkpoint was PR #147 head `72dea41631f58bf2bd6bc1aca48f7282cb1eaabc`. PR #147 remains the only implementation target. The isolated worktree branch `pi-001-event-pagination-007` is based on the remote `pi-trusted-read-isolation` head; publish only after local verification. #143 remains `d889f2395648af90bb0b8235c43226168d2c4534` on #139 `c5fc5d8bfd818a3feb22f5585bde93059a255658`; #145 remains separate at `19b7cf8ad9e38dc1f6738925b6f7b4a09f09359a`.

Implementation adds descending RunBook event keyset pagination on `(occurred_at,event_id)`, strict paired cursor validation, `limit + 1` overflow detection, exact six-digit UTC timestamp serialization, cursor lineage/order checks, and opt-in browser older-page plus browser Back navigation. Event `since` is rejected because timestamp-only filtering cannot represent tied boundary rows. Other source kinds and domain boundaries are unchanged. The UI continues to describe every page as bounded and never claims a complete or lossless archive.

Disposable PostgreSQL/Chromium acceptance adds three equal-timestamp synthetic events through the real append-only capture function, checks order, page overflow, cursor continuation, project isolation, and browser page navigation. Local build, 55 PI tests, focused gateway/query tests, and full server suite (213 passed, 8 database-dependent skips) passed. Local PostgreSQL, Chromium and Docker are unavailable, so actual database/browser acceptance and exact-head GitHub Actions remain required before this is a verified milestone. No production read/write, migration, grant, identity, routing, paid resource, deployment, activation or live RunBook append occurred.

Open: run the exact-head workflows, repair any failures, retrieve the actual acceptance artifact, and record resulting commit/head and workflow IDs in this continuation, canonical read docs, Test-system guide and provenance. Confirm the event cursor survives the complete PostgreSQL-to-RunBook-to-PI-to-Chromium path; do not treat these local tests as that proof. Keep #147 draft and unmerged. Production remains staged pending platform selection, independent security review and explicit C4 authorization. PM decisions, Foundry requests and human-action assessment remain separate; Foundry-to-PM crosswalk and event/decision/evidence verification links remain unresolved.
