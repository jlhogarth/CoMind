# DRB-002 database, RunBook and application system proof

## Objective and authority

Joseph directed an end-to-end tested system before any production-platform decision, then authorized development that benefits the Test database, RunBook and CoMind application. Production selection is not a prerequisite for this isolated proof. It remains a prerequisite for the later host-specific production proposal. Earlier broad authority is not used to create paid infrastructure or activate production.

T1 reversible isolated implementation and synthetic Test database mutations; T2 scoped repository publication and existing RunBook append. Proposed NIST AC-3/AC-6/AU-3/AU-9/CP-10 mappings only. Affected identities: temporary Test capture role service_role, dedicated comind_runbook_query_login and generated Test backend/operator identities. No production identity or grant changes. No exceptions. Recovery: stop isolated processes, retain acceptance evidence, discard the dedicated CI service through normal runner teardown or revert the scoped development commit. No live database rollback is involved.

## Application advantage

The opt-in reader now exposes RunBook history alongside lanes, PM decisions and native-UUID Foundry reads. GET /api/pi/events uses the same server-owned credentials, current private-file operator session, fixed query allowlist, project checks, limits and audit boundary. It adds no browser database credential and no write endpoint. Events display canonical UUID, occurrence time, action/result, outcome, next action and source/evidence references as text. All evidence remains source data, not instructions or verified authority. Optional lane filtering applies to lanes, PM decisions and events. Switching source or starting another read clears old data.

A successful page is a bounded window, not a full archive or lossless feed. An empty page, denial and unavailable reader are distinct. Foundry and PM projects remain separate; no cross-domain mapping is inferred. The disconnected default index remains unchanged.

## Database and RunBook advantage

server/test/runbook-system.e2e.mjs requires a fresh loopback database named drb_system_test and PostgreSQL 17 or later. It refuses another database, remote host, URL options or existing application tables before applying schema changes. It applies actual repository PM and DRB-001 migrations plus the existing disposable reader fixture. It captures synthetic operational events through record_runbook_event under SET LOCAL ROLE service_role, rather than manufacturing query results. This uses the existing Test capture authority, not a new production writer design.

The restricted reader is a separate login with generated temporary password and existing COMIND-only fixture RLS. Operator and backend identities are distinct, expire after one hour, and are stored in temporary owner-only files. The browser receives only the HttpOnly operator cookie through Playwright fixture provisioning. That is not a production login/session issuer.

The proof connects a real browser to the actual reader page, same-origin PI gateway, loopback RunBook HTTP service and actual PostgreSQL read-only transaction adapter. Its local HTTP fixture server serves only allowlisted application assets and the PI routes. No external listener, cloud endpoint or paid provider is created.

## Required acceptance

The test fails rather than skips when DRB_SYSTEM_ADMIN_URL is missing. CI provides a dedicated disposable PostgreSQL service. Acceptance includes:

- real function capture and automatic canonical lane-summary projection;
- browser event UUID/source/result and matching lane UUID;
- literal evidence rendering without injected HTML;
- database RLS excludes OTHER even when the backend HTTP identity allows OTHER;
- application project denial, no reader writes and append-only UPDATE/DELETE rejection;
- failure and corrective recovery events retained together;
- operator/backend revocation and unsafe DRB/PI audit files clear displayed results;
- real reader connection loss and real SQL lock timeout fail closed, then recover;
- reader service stop/restart recovers the original database history and audit paths;
- no source mutation from reads, payload-free audits and no backend secret/direct DRB request in browser traffic.

These are synthetic event contents in a real Test database. They do not establish production readiness, full CoMind feature acceptance, independent security approval, backup/disaster recovery, or a deployed operational environment. The Test database login-loss case is not a database-server power-loss test. Service restart is in-process server teardown/recreation, not host reboot. Startup execution and certificate/session issuance remain separately unproven.

## Reproduce and inspect

Primary Interface CI builds server code, installs pinned Playwright, creates fresh postgres:17 and runs both the earlier isolated proofs and the new combined system proof. The latter runs:

```sh
cd server
node test/runbook-system.e2e.mjs
```

Required environment: DRB_SYSTEM_ADMIN_URL is a direct administrator URL for the fresh dedicated loopback Test database. PI_PLAYWRIGHT_MODULE points to the installed Playwright module. DRB_SYSTEM_ARTIFACT_DIR chooses the evidence directory outside the temporary credential directory. Do not supply live credentials. The proof refuses to reset an existing database; recreate only disposable infrastructure through its owner-controlled workflow.

CI uploads drb-test-system-evidence for 14 days. acceptance.json records executed checks and synthetic event UUIDs; runbook-test-timeline.png shows the rendered actual Test rows. Neither contains credential files. Durable provenance records the CI run links because runner artifacts expire. Browser and database helpers terminate in finally; no background monitor or persistent user-accessible deployment is created.

## Dependencies and continuation

The integration branch is stacked on PR #147 at inspected head 6ffcabc1cad349241149286af5ea2a44c8edebd0. It preserves the separate #143/#139 stack, #145 and #119. DRB #145 has newer deployment documentation at 19b7cf8; no runtime difference was observed there. Do not merge predecessor branches or retarget for convenience.

Next: verify exact-head CI and diagnose failures before claiming acceptance. Review/adopt the Test integration with the current PI lane without overwriting concurrent work. After acceptance, expand toward a reusable operator Test environment and any remaining attention/evidence contracts. Production decisions, host-specific grants, independent security review and explicit activation authority remain separate. Read current AGENTS.md, remote heads, this guide and live RunBook before resuming. Update this continuation and provenance at each material checkpoint.

## Canonical event projection follow-up, 2026-10-18

The PI adapter now returns RunBook events under the shared canonical-read envelope with relation-namespaced event IDs, per-record observed-at time, null revision, bounded coverage and explicit blockers for missing event relationships and evidence policy. The connected Test reader renders those projected records, not raw source rows. This does not add event-to-decision, authorization, lane, or verification joins.

Exact implementation head `2d718223bc0d120085d5470a413109ff107c62a5` passed all 11 returned PR workflows. Primary Interface run 39171293609 completed browser navigation, trusted reader browser proof, and actual PostgreSQL 17 capture-to-RunBook-to-browser acceptance successfully. `drb-test-system-evidence` contains acceptance JSON and screenshot and is retained through 2026-11-01 22:14 UTC. DRB Query Contract 39171293512, Main CI 39171293678 and No Placeholder Policy 39171293483 passed; all other returned workflows passed. This was synthetic isolated Test data and did not access or write live RunBook data.

## Exact-head acceptance evidence

Verified isolated Test candidate: `0d0155285db497af51745964a08928aea8789686` on PR #147. All 11 returned workflows completed successfully. Primary Interface run [39168308952](https://github.com/jlhogarth/CoMind/actions/runs/39168308952) passed the actual PostgreSQL 17 capture-to-RunBook-to-PI-browser proof and preserved artifact `drb-test-system-evidence` for 14 days. DRB query contract [39168308948](https://github.com/jlhogarth/CoMind/actions/runs/39168308948), Main CI [39168308973](https://github.com/jlhogarth/CoMind/actions/runs/39168308973), and No Placeholder [39168308951](https://github.com/jlhogarth/CoMind/actions/runs/39168308951) passed. Seven other returned workflows passed as well.

Failure and repair are retained in the PR history. The first candidate `0b4309967840c89f2616656b2bfa75dd2d41f747` was rejected by the real schema because `isolated-e2e` is not an allowed `pm_events.source_system`. The fixture now uses existing allowed category `manual`; it also confirms an invalid category is rejected and leaves no event behind. The failed run touched only its disposable PostgreSQL service, which CI destroyed after failure.

The final system proof used only synthetic rows, generated temporary identities and a loopback HTTP server. It did not contact Supabase, alter production, deploy a persistent service, create a production grant, or capture an event in the live RunBook. PR #147 remains draft/open/unmerged. At final readback it targets #143 head `d889f2395648af90bb0b8235c43226168d2c4534`, which remains stacked on BRAND #139; DRB #145 is separate. Its newer head `19b7cf8ad9e38dc1f6738925b6f7b4a09f09359a` changes only DRB deployment documentation relative to the runtime snapshot in this test stack. OC #119 is untouched.


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


## Canonical event-to-work-item identity

The bounded event projection returns the canonical event UUID, project UUID, nullable event project UUID, nullable work-item UUID, nullable linked work-item project UUID, and nullable item type. Its SQL follows the declared PM foreign key from `pm_events.work_item_id` to `pm_work_items.id`; the text work key remains a display/filter value. The response lineage names the timeline view and both base relations. Existing restricted Test-reader grants and RLS policies cover the joins, so no migration or grant change is needed.

A row with no linked work item stays readable with null relationship fields. A conflicting event/work-item project association is surfaced as a blocker with both UUIDs retained. No PM-to-Foundry mapping or authority is inferred. Acceptance must compare the actual PostgreSQL FK result through the gateway and browser against the canonical work-item row.

## PI-001 stable RunBook event pagination

The isolated query now pages events with a strict descending keyset `(occurred_at,event_id)`, using the canonical event UUID to disambiguate identical timestamps. It requests `limit + 1` rows and returns a next cursor only when overflow is proven. PostgreSQL timestamp text retains six fractional digits so cursor round trips do not lose sub-millisecond precision in JavaScript. The PI adapter verifies ordering and cursor lineage; each request independently repeats session, project, lane and database RLS checks. Timestamp-only `since` is invalid for event queries.

The actual PostgreSQL 17.11 and Chromium proof adds three same-timestamp synthetic events through `record_runbook_event`, pages them with a two-row bound, checks deterministic UUID order, cursor continuation, no duplicates or omissions, and exclusion of OTHER project records. The browser reads the older page and returns to the first page with browser Back. A bounded response with no reported next cursor remains a bounded observation, not proof of complete history. Read failures continue to clear the displayed snapshot and report denied, malformed or unavailable state. The test does not claim snapshot isolation across separate page requests or a lossless archive feed.

### Exact-head acceptance, 2026-10-19

On PR #147 head `56ea984215a2cce68ce84ed21b58626360158d52`, all 11 returned workflows passed. Primary Interface run [39181368911](https://github.com/jlhogarth/CoMind/actions/runs/39181368911) passed the full PostgreSQL 17.11 capture-to-RunBook-to-PI-to-Chromium proof. The 17 checks cover same-timestamp UUID ordering, two-row overflow, cursor continuation without omissions or duplicates, project isolation, browser older-page and history navigation, bounded final-page status, canonical UUID display, append-only preservation, revocation, audit failure, DB loss/timeout and recovery, restart, and unchanged ledger. All data and identities were synthetic and disposable. Artifact [12156730726](https://github.com/jlhogarth/CoMind/actions/runs/39181368911/artifacts/12156730726), SHA-256 `8321abafe3c3ba63bed8b5ceccb7355f0debfc57fb574c024d96ed946267a97d`, retained until 2026-11-02 00:35:26 UTC. Exact workflow set and open boundaries are recorded in the PI-001 provenance file.
