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

Test changes are in scope. `db/test/pi_foundry_reader.sql` is only a disposable CI role/grant and one-fixed-UUID RLS fixture, not a migration or deployment instruction. The foundry-agent-substrate CI job now builds the server and runs `server/test/pi-foundry-reader.integration.test.mjs` after the existing Foundry migrations. Exact-head PostgreSQL and actual-page browser CI are pending publication. Local build, complete server tests (210 passed, 8 database-dependent skips), PI tests (48 passed), no-placeholder and whitespace checks passed. The local PostgreSQL integration test skipped because this worktree has no PostgreSQL service; browser proof awaits Chromium CI.

Production Foundry reads remain blocked on a reviewed production login and row policy, operator UUID assignments, host/TLS/session issuer, persistent audit review, independent security review and explicit production authority. No production database connection, data read, grant, migration, or RunBook capture occurred.

Next: verify current #147 remote head before publishing, run exact-head PostgreSQL and browser jobs, diagnose any failures, then record terminal results in this continuation and provenance. Preserve #143's BRAND dependency and #119 ownership. The cross-domain project mapping and complete attention evidence/revision/RunBook contract remain open. No user action is currently required.
