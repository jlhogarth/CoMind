# PI trusted read connection, isolated development

T1 reversible isolated implementation authorized by Joseph. This is an executable loopback connection, not a production deployment or approved operator identity provider. No live grants, migrations, provider calls, VE authority or paid resources. Proposed NIST AC-3/AC-6/AU-3 traceability only; no assessed compliance.

## Connection and boundaries

Browser GET /api/pi/lanes or /api/pi/decisions -> PI gateway -> DRB POST /v1/runbook/query -> restricted PostgreSQL reader. Browser supplies only its opaque operator session cookie; backend DRB token is reread from a separate private server file. Both identities must be enabled, unexpired and project-scoped. File replacement/revocation affects subsequent requests; admitted reads may complete.

The PI gateway uses the existing private-file loader and durable audit sink from DRB at 5331d4. PM lane and decision operations use the loopback DRB API with project key, optional work key and limit 1..100. Arbitrary query fields and SQL are rejected. The decisions query selects reviewed fields from `pm_decision_records`, joined by canonical UUID to `pm_work_items` and `pm_projects`; project scope is enforced by the restricted DRB reader's RLS policy and PI session/backend scope checks.

The Foundry request operation is a separate native UUID path. It uses `PI_FOUNDRY_DATABASE_URL` with its own connection pool and database login, never the PM/DRB identity. The operator session must list that exact UUID in optional `foundryProjectIds`. Before listening, the server verifies the login is `comind_foundry_query_login`, not a member/owner/privileged role, has SELECT only on the RLS-enabled request relation, and has no write, DDL or security-definer function access. The request runs in a read-only transaction with a 3-second statement timeout, fixed columns, stable ordering and limit+1. No PM key or crosswalk is used. If the optional Foundry URL is absent, this endpoint returns unavailable.

For PM reads, upstream HTTP origin must be literal 127.0.0.1 with no credentials/path/query/fragment. No redirect following or retries. Reads time out within 5 seconds and accept at most 256 KiB upstream data, 100 rows and four concurrent reads. A process-wide 120 requests/minute ceiling applies before authentication. This is single-process development capacity, not a distributed deployment guarantee.

Gateway compares a separately configured PI origin and rejects browser cross-site/same-site fetches and mismatched Origin headers. No CORS is enabled. Missing, duplicate, malformed, expired or disabled __Host-comind_pi cookies are denied. Session lookup is timing-safe after digesting and uses current private-file content. Project scope is checked before backend credential loading or network access. The gateway validates and strips the upstream envelope/rows, reuses the canonical PI projection validator and requires returned project/filter/limit to match the requested scope. No source success, raw credentials or upstream exception messages leak on denial.

Responses are no-store, vary on Cookie, and have nosniff. A metadata-only audit is synchronized before releasing a response; audit failure withholds data. The audit excludes session/backend tokens, URLs and response payloads. Existing audit limitations remain: one POSIX writer, local fsync rather than immutable/off-host retention; private parent directories and deployment alarms require host review. The browser reader makes a fixed same-origin GET, uses same-origin credentials, has a 7-second timeout, and returns an unavailable state on failure instead of retaining a previous successful envelope.

## Executable API runner

Build: npm ci --prefix server --ignore-scripts --no-audit --no-fund, then npm run build --prefix server.
Run: node server/dist/primary-interface/read-index.js with:

| Configuration | Required meaning |
| --- | --- |
| PI_DRB_ORIGIN | Actual loopback DRB origin, http://127.0.0.1 with its real running port |
| PI_UI_ORIGIN | Actual isolated same-origin UI proxy origin, literal 127.0.0.1 |
| PI_DRB_ID | Exact backend reader principal ID in the DRB credential file |
| PI_SESSIONS_FILE | Absolute owner-only session file, existing DRB principal schema |
| PI_DRB_CREDENTIALS_FILE | Separate absolute owner-only backend credential file |
| PI_FOUNDRY_DATABASE_URL | Optional dedicated restricted Foundry PostgreSQL login; never falls back to DRB or application URL |
| PI_AUDIT_FILE | Separate absolute private metadata audit ledger |
| PI_READ_PORT | Deliberately chosen local gateway port |

Credential/session files must use mode 0600, be owned by the runtime UID and not final-component symlinks. Parent directory must be private. Files must be distinct. Runtime binds only 127.0.0.1, checks files, and appends service.start before listening. There is no database connection fallback and no backend token in browser configuration. Static UI hosting and same-origin /api proxy are separate from this API runner; the test harness provides them only for isolation.

No login or session-issuance endpoint is introduced. For the isolated harness, test code provisions cryptographically random sessions and a Secure, HttpOnly, SameSite=Strict, Path=/ host cookie. The gateway cannot determine a received cookie's original issuance attributes. Before production, the responsible identity/security owner must supply and test a real authentication/session issuer, revocation policy and TLS gateway that enforce those attributes. Session-file entries and successful tests are not proof of Joseph's authenticated production identity. No automatic session creation or browser token input is allowed as a workaround.

Default index.html remains disconnected and makes no live reads. reader.html is opt-in and offers separate lane, PM decision and Foundry request reads. Browser functions accept no backend origin/token or database URL. Lane data uses the cockpit lane renderer; decision and Foundry rows are displayed separately as raw canonical source records. Foundry evidence refs, reason, requested authority and status are source fields only. No decision controls or human-action assessment is derived from these rows. Browser proof uses synthetic source rows only.

## Verification and recovery

Local: TypeScript build; server/test/pi-read-gateway.test.mjs; apps/primary-interface/test/*.test.mjs. Dedicated DRB CI extends the existing actual PostgreSQL 17 restricted-login proof through real loopback DRB HTTP and PI gateway, including scope denial, session revocation, and failed audit withholding. PI CI runs existing browser navigation plus server/test/pi-read-browser.mjs, which checks the real HTTP read path with synthetic DB replies and an HttpOnly test session. These are complementary proofs, not live Supabase acceptance.

Recovery: stop isolated processes and revoke their fixture credentials. Preserve consequential audit evidence where applicable. Revert the integration branch changes without altering either predecessor branch. No database rollback. One bounded upstream SELECT plus credential reads and two local audits per successful connected request; no model calls/new runtime packages. Host latency/fsync/cost remain unmeasured.

## Continuation and activation blockers

Integration branch combines PI d889f23 and DRB 5331d4 for reproducible isolated testing. Neither dependency PR was merged to main or force-updated. Re-read current heads before adoption, preserve concurrent DRB changes, and review the narrow gateway changes independently of inherited files. OC-002 remains untouched.

Blocked operation: live browser activation. Necessary inputs: confirmed host/TLS/same-origin proxy, trusted operator session issuer, reviewed production restricted role and project associations, persistent private audit mount/retention, gateway limits/alarms and independent security review. Resolvers: PI/DRB security and deployment owners with Joseph for actual activation authority. Supporting evidence: AGENTS.md production C4 boundary and DRB-002 activation checklist. Missing inputs block deployment, not isolated implementation.

## Connected reader interaction hardening

reader.html is an explicit opt-in page. It makes no read until the operator submits a canonical project key; there is no token/password input or backend URL setting. The fixed same-origin transport retains server authorization. index.html stays disconnected. The reader has a polite status region, labeled project input, keyboard-submit form and separate lane filters/detail navigation.

A single request controller owns displayed source state. Starting a read clears the old snapshot, aborts the prior fetch and increments a generation counter. Only the current generation may publish a result, even if an upstream/test reader ignores cancellation. A late earlier success cannot replace a newer denial or another project's result. Pagehide stops the controller and clears the rendered source; bfcache restoration reloads the page so retained DOM does not imply a current session. Stopping the controller prevents new requests and late updates. No automatic polling is introduced.

This is engineering hardening of read lifecycle, not independent production security review. The production-platform decision remains deferred under PDP-001 #140 / #141. No host selection or activation is inferred from this page. Session issuer/TLS/proxy/production role/audit-storage requirements remain unresolved and block live deployment only.

## PM decision source extension

The isolated reader also supports `GET /api/pi/decisions`. It shares cookie authentication, project scope, separate backend credential, origin/fetch-site restrictions, response size/time limits and metadata audit with the lane route. The DRB query service adds a fixed `decisions` kind with explicit columns and parameterized project/work-key filters. A separate PI adapter validates relation names, project, request UUID, row UUIDs and bounded coverage before the UI renders source text.

The disposable database test fixture grants the PM reader SELECT on `pm_decision_records` and a COMIND-only row policy. A separate disposable fixture grants `comind_foundry_query_login` SELECT on only `cm_foundry_authorization_request` and a policy for one synthetic Foundry UUID; it revokes default PUBLIC function execution in the disposable `comind` schema so the reader cannot call security-definer functions. Neither fixture is a migration or production grant. The Foundry UUID to PM ledger `project_key` mapping remains unestablished; native Foundry requests therefore remain a distinct source. Project decision records are not treated as Foundry approval, live authority, verified evidence or a completed human-action assessment.


## PR #147 merged development checkpoint

PR #147 merged into PI branch #143 at `b245ebc0b650baf7b7c289d189d347b07c9e81d6`, from exact implementation head `47fe10c7a08799a881a947f37897f90fe96ac809`. Its bounded event keyset pagination acceptance passed 17 synthetic PostgreSQL 17.11 and Chromium checks. Artifact: [12156730726](https://github.com/jlhogarth/CoMind/actions/runs/39181368911/artifacts/12156730726), SHA-256 `8321abafe3c3ba63bed8b5ceccb7355f0debfc57fb574c024d96ed946267a97d`. PR #145 is also now closed/merged at `524f893fb6ac71aef3954f4cff9d592a2f5090e9`; old statements above that call it unmerged describe the earlier checkpoint. These merges are repository development state only and do not authorize or perform production activation.

PR #149 adds a separate operator-history regression for cursor restoration after changing event context. See `docs/provenance/2026-10-19-primary-interface-event-history-context.md`; final exact-head CI and artifact details will be recorded there after runs complete.

## PI-001 event window under concurrent append

At implementation head `6ca3756a130cdbfc073b743bc06ada19332ef922`, the actual reader status states that event pages independently observe a changing source and do not share a snapshot. The PostgreSQL 17.11/Chromium acceptance appends a newer synthetic event after page one, follows the original cursor, then refreshes page one and observes the append. Primary Interface run `39313866078` passed 20 checks; artifact `12216853647`, SHA-256 `918197845c6ca89d685523713d693c450fff8a276ed3acb8cd3b19aecc59a209`. Exact workflow status and the remaining pending run are recorded in the event-history provenance. This is one bounded test case, not proof of a complete or lossless feed.


## PI-001 event-history context verification

PR #149 implementation head dc5abd25f55b9a3f126ca1fb190ccdb2bb4e25cc passed all 17 returned workflows and 18 PostgreSQL 17.11/Chromium system acceptance checks using synthetic data and disposable identities. All 17 returned workflows passed on implementation head dc5abd25f55b9a3f126ca1fb190ccdb2bb4e25cc. Primary Interface e2e run 39311073401; DRB Query Contract 39311073332; CI/build 39311073284; No Placeholder 39311073311; remaining workflow runs: 39311074531, 39311073486, 39311073476, 39311073517, 39311073359, 39311073428, 39311073344, with the other jobs included in 39311073284. The acceptance completed 18 checks. Artifact drb-test-system-evidence ID 12215094538, retained until 2026-11-02 19:27:57 UTC; SHA-256 zip digest c7329466ed31846d830e46d41e688f8000707298b08c66b2c296c306b0c5dfea.

The initial candidate failed a stale fixture count assertion before reaching the new browser regression; the corrected exact-head run passes. This is test evidence for the isolated reader only. Production remains staged; this does not alter identity, grants, deployment, activation, or security-review requirements.

## Documentation-head CI

After the implementation proof on dc5abd25f55b9a3f126ca1fb190ccdb2bb4e25cc, the documentation-only descendant 0e33b7d103f57b81d35211e3b759f7b0755671aa passed all 17 exact-head workflows and repeated the 18-check synthetic system acceptance. On documentation head 0e33b7d103f57b81d35211e3b759f7b0755671aa, all 17 returned workflows passed: Runtime Budget Authority 39311426565; LF-2 39311426568; Foundry Agent, PM Ledger, Conversation Lifecycle, Build, Devcontainer, FinOps Budget and Dev Runtime checks 39311426614; Stage 1 39311426613; DRB Query Contract 39311426536; LF-3 39311426537; Primary Interface 39311426547; Work Lease 39311426552; Foundry Runtime 39311426538; No Placeholder 39311426521; Governed Provider 39311426506. The PostgreSQL 17.11 and Chromium acceptance passed 18 checks. Artifact 12215357945, retained until 2026-11-02 19:30:45 UTC; SHA-256 zip digest 908f65028be915d210bc8c3cf53a6722064466b45067ff8865140dcf79210c16.
