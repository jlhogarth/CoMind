# GCI-001 Acceptance Evidence | 2026-11-07

Repository: `jlhogarth/CoMind`
Issue: #544
Draft PR: #545
Test branch: `gci-001-on-demand-gemini-review`
Verified commit: `554e683a039fbe0122fdebd54b85555a133435a0`
Test classification: Test only. No Production deployment.

## Executed tests

GitHub Actions protocol job: https://github.com/jlhogarth/CoMind/actions/runs/42421484405/job/128550648204
GitHub Actions check result: **success**.
Started 2026-11-07 22:37:35 UTC; completed 22:37:42 UTC.
Runner log: **Ran 11 tests in 0.009s; OK.**

Checks exercised:
- Eligible complete CHATGPT exchange only; partial, wrong-session and Gemini messages excluded.
- Existing claim and reply markers block reprocessing.
- Repeated question markers processed once in parser.
- Default-off mode never opens Google session.
- Missing federation credential fails closed without Google access.
- Deterministic end-to-end fake-client simulation: one completed question, one mocked Gemini invocation, one claim and one reply, and 240 seconds of *simulated* inactivity before `idle_stopped`.
- Empty simulated document: no Gemini invocation and `idle_stopped` at 240 seconds.

**The 240-second result is an accelerated simulated clock, NOT four minutes of live elapsed wall time.**
**The Gemini invocation and document writes are mocks, NOT real Google/Gemini API calls.**
No secret content was read or logged, no actual Google Cloud changes were made, and no billable Gemini request was issued.

## Other CI and limitations

The global "Reject unresolved development markers" check failed on this branch.
Earlier inspection on 2026-11-05 identified the inherited baseline failure at `server/test/chatgpt-successor-registry.test.mjs:106`, also failing on baseline commit `be7c2c4`. This remains an open repository-level CI defect, not a claim that all checks passed.

## Live acceptance gates not satisfied

1. Google Cloud project `comind-513807` and numeric service account `102716239802737631124` were identified from an operator-provided URL; the actual IAM service-account email and assignments have not been read back with Google Cloud IAM.
2. The Cloud Shell WIF bootstrap has been authored but **not executed**. GitHub repository variables `GCI_WIF_PROVIDER` and `GCI_SERVICE_ACCOUNT_EMAIL` have not been verified. GitHub secret `GEMINI_API_KEY` was reported by operator but its presence and validity are unverified.
3. No confirmed service-account Editor grant on a designated isolated test Google Doc.
4. No live `workflow_dispatch`, live Gemini generation, live Google Doc response readback, or live 240-second idle shutdown observed.

## Acceptance decision

**Partial PASS: isolated protocol and deterministic simulation.**
**NOT ACCEPTED: live integration and four-minute wall-time proof.**
Do not merge as accepted, deploy to Production, claim verified authentication or disable the existing hourly Gemini Review Watch until live acceptance succeeds.

## 2026-11-09 continuation | Test hardening and live blockers

- **Tier T2 for the live capability.** A single external model call and an isolated Google Doc write are consequential. Authority is confined to Test, the registered synthetic prompt, one bounded generation request, and the existing Google and GitHub services. The branch work is reversible. Keep the existing claims and receipts for reconciliation if a workflow is cancelled.
- **Freshness and collisions.** Issue #544 was open, PR #545 was open and draft, source head was `72277191604798984e548ea2926a238905cad4ab`, and default branch was `be7c2c4d8c3c9811c115b40a364c5580d1354262`. The changed-file lists of all other open PRs showed no GCI path overlap. The authenticated Codespaces inventory returned zero accessible for this repository. A local checkout was reused for validation. [Previous isolated CI](https://github.com/jlhogarth/CoMind/actions/runs/42661365396/job/129313491359)
- **CI baseline.** The repository marker scanner rejected exactly one existing example network address at `server/test/chatgpt-successor-registry.test.mjs:106` on both current main and the GCI checkout. The GCI work leaves that independent baseline defect with its owning lane. [Prior failing policy check](https://github.com/jlhogarth/CoMind/actions/runs/42661376574)
- **GitHub configuration.** Authenticated repository settings readback confirmed the `GEMINI_API_KEY` secret name without reading a value. Both `GCI_WIF_PROVIDER` and `GCI_SERVICE_ACCOUNT_EMAIL` are absent. The registered workflow inventory included GCI protocol CI only. The live workflow file was absent from default branch, which blocks manual dispatch. The runbook records an inert registration-only approach and its default-branch approval boundary.
- **Google Cloud.** Both Cloud Console pages and standalone Cloud Shell returned `Site Unavailable` in the requested browser. The service-account email, APIs, active provider, effective IAM access and organization policy remain unverified. No audit or apply command ran against the project. The new audit-only mode is the next Cloud Shell operation.
- **Drive.** An authenticated owner-side read confirmed the isolated Doc contained the single complete synthetic `question0001` in `gci_smoke_20261107`, with zero claim or reply markers. Its permission metadata showed a single owner and no broader grant. The bridge identity had no verified access. The original CM-XAI record was read for continuity and left untouched, with no completed Gemini turn observed. The hourly Gemini Review Watch was left untouched.
- **Hardening.** Prompt digest and exact IDs are pinned before inference. Google Docs snapshot and required-revision writes guard the claim and reply. A non-generating preflight checks identity, visible Drive inventory, model access and existing receipts. Model requests have one attempt per run and a 512-output-token cap. Cancellation, ambiguous failures and invalid restart receipts preserve evidence without automatically regenerating. The workflow confines the Gemini key to the poller step and logs provider telemetry if supplied.
- **Verification boundary.** The fast isolated tests cover document and session restrictions, incomplete and nested envelopes, digest mismatch, duplicate IDs, preflight without writes, revision rejection, logical duplicate prevention, failures and restart. Stubs exercise delivery and shutdown. Live OIDC, service-account read and write, Gemini generation and provider usage, independent live response readback, and live inactivity are **NOT VERIFIED**. No real generation request was issued, no Production change was made and no new billable service was activated.
- **Remaining durability.** The document remains the isolated Test's claim and receipt store. Deleting both markers can defeat replay protection across runs, so keep the exact one-shot authorization and reconcile ambiguous attempts. A separate transaction ledger is still required before broader GCI-002 use. Runtime shutdown and request-attempt telemetry do not establish provider billing or exactly-once execution.

Resume on the existing branch with Work Standard and Medium reasoning. Read the latest PR head and checks, then follow the [live acceptance sequence](gci-001-README.md#resume-live-acceptance). Start with read-only IAM audit in a reachable authenticated Cloud Shell. Confirm the Test registration path before dispatch. Retain the original documents, schedule, and Production boundary.


## 2026-11-17 | Fresh chat return Test exchange

This section supersedes the earlier historical "NOT VERIFIED" statement for the listed live checks. It does not imply general production readiness or exactly-once network execution.

- **Authority and scope:** Joseph requested an end-to-end run in the active GCI-001 lane. Test branch only, existing restricted synthetic Doc `1dJEOjmLPm9gdw8xsVF8J_dyPK0HDx5N5RmW0ID42cnE`, new session `gci_chat_20261117`, exchange `question0002`, model `gemini-3.5-flash-lite`. The prior completed question and reply remained intact. Registry entry preserves prior exchange metadata and pins the new prompt SHA-256 `5c174350af284a1967607c3b926af6eb270b42c352e38500221917cba99ac696`. Source branch commit after fixture repair: `a5a10bc3c4adfbc28072fb946a030a5ac55299f7`.
- **Preparation:** New envelope appended with Google Docs required-revision write control. Independent Docs/registry readback found one complete new question and the old reply. The first read-only preflight [run 44039948616](https://github.com/jlhogarth/CoMind/actions/runs/44039948616) failed before Google authentication because simulation fixtures still referenced the prior session. No Gemini request or Doc write occurred in that run. The existing GCI test fixture was aligned in commit `a5a10bc`.
- **Read-only preflight:** [Run 44040070382](https://github.com/jlhogarth/CoMind/actions/runs/44040070382) succeeded on the exact corrected head. It verified OIDC identity, singleton service-account Drive inventory, Doc version 13, one eligible exchange, model metadata, and `calls=0`.
- **Live automatic invocation:** [Run 44040160014](https://github.com/jlhogarth/CoMind/actions/runs/44040160014) logged one revision-checked claim, one `gemini_request_attempted`, provider response ID `UQT8as7JI6bzqtsP7_ruqAI`, model version `gemini-3.5-flash-lite`, 75 prompt tokens, 70 candidate tokens, 145 total tokens, and one `delivered` event. The reply digest was `a3be32388b5bc1cce30a19786283d782f4c47f48b8433686bee10f35ec1bd717`. No provider billed amount was reported. Prompt and response bodies are kept in the restricted Doc, not this repository.
- **Independent readback:** The Google Drive connector reread the [restricted Test Doc](https://docs.google.com/document/d/1dJEOjmLPm9gdw8xsVF8J_dyPK0HDx5N5RmW0ID42cnE/edit) and found exactly one `question0002` claim and one reply marker. Locally recomputed SHA-256 of the reply text matched both the Doc completion marker and runner delivery event. The response was returned to Joseph in the same active ChatGPT conversation after verification. This return was performed by the active agent, not by automatic waking of a dormant chat.
- **Shutdown and restart:** The live run logged `idle_stopped` at 2026-11-17T07:41:55.024471Z after `idle_seconds=240.0`, `elapsed_seconds=243.281`, 16 checks and one total generation call. [Read-only restart run 44040758314](https://github.com/jlhogarth/CoMind/actions/runs/44040758314) verified the existing reply at Doc version 16 with the same digest and `calls=0`. A fresh Drive read still found one claim and one reply.

**Boundary:** This establishes one fresh chat-initiated, automatically invoked Test exchange with a verified manual agent return to the active conversation. The Site is an evidence workspace, not the dispatch or telemetry backend. The Doc's claim/receipt markers plus GitHub concurrency do not prove exactly-once execution under every crash, provider timeout, or deliberate marker removal. GCI-002 still needs a transactional exchange ledger and governed conversation-return binding before unattended multi-session operation. No Production merge, new paid service, or modification to the original CM-XAI document occurred in this run.


## 2026-11-17 | Event-triggered Work return verification

**Classification:** Test accepted for one scoped exchange and its task-associated conversation. This supersedes the earlier assumption that no dormant ChatGPT conversation could receive a bridge result. It does not establish arbitrary conversation injection or continuation of an already running agent turn.

- **Freshness and authority:** Issue #544 remains open, PR #545 remains draft, branch `gci-001-on-demand-gemini-review` at `f950a4a7043b313ba73011be8b1c221da85633bc` for the live run. No Production merge or new paid service. The registered Test Doc and service account were reused.
- **Ingress:** A new complete `question0003` envelope in session `gci_return_20261117` was appended with Google Docs required-revision control. The registry pins its payload digest `213aed741ec4ec196cf011c901dc792afbe78d235c76867518ad8099b7bb7591`; prior exchanges remain recorded. Independent owner readback found one question and no claim before dispatch.
- **Read-only gate:** [Preflight 44155702979](https://github.com/jlhogarth/CoMind/actions/runs/44155702979) verified identity, scoped Doc, eligible=1, calls=0. Its [sanitized PR receipt](https://github.com/jlhogarth/CoMind/pull/545#issuecomment-6958141813) was emitted automatically and the Work task correctly suppressed a delivery notification because delivery was absent.
- **Live exchange:** [Run 44155839010](https://github.com/jlhogarth/CoMind/actions/runs/44155839010) recorded one claim, one `gemini_request_attempted`, one provider response (60 prompt, 94 candidate, 154 total provider-reported tokens), one `delivered`, and `idle_stopped` at exactly 240.0 seconds with 16 checks and calls=1. Its reply SHA-256 was `0c49da5df52035b460d0f075007baf59c887c20e5a8fb9653b8dc7df51fa3430`.
- **Independent return:** The [runner's public receipt](https://github.com/jlhogarth/CoMind/pull/545#issuecomment-6958263858) contains only run/session/exchange IDs, event names, count and digest, never the reply body. The `GCI Bridge Return` GitHub PR-comment event-triggered Work task matched that receipt. Its recorded run `07967c55-96ac-8327-b87b-5d61640963bb` completed with `chat_ref.type=chatgpt` and `chat_ref.id=6afba93b-8288-83e9-9b0b-016a341ac5fb`, matching the task's associated conversation ID. The task independently read the restricted Doc, found exactly one claim and one reply marker, recomputed the SHA-256 from reply text, and published the verified answer in that associated conversation. Task delivery status was reported as unknown, so a push notification is not established by this record.
- **Duplicate check:** [Read-only restart 44163116993](https://github.com/jlhogarth/CoMind/actions/runs/44163116993) found the existing reply with the same digest and calls=0. No new Gemini invocation occurred.
- **Failure and recovery:** Initial receipt runs [44044333738](https://github.com/jlhogarth/CoMind/actions/runs/44044333738) and [44044562387](https://github.com/jlhogarth/CoMind/actions/runs/44044562387) failed to comment with `Resource not accessible by integration`. The separate receipt job was granted narrowly scoped `issues: write` and `pull-requests: write`; [44044905627](https://github.com/jlhogarth/CoMind/actions/runs/44044905627) posted successfully. The poller never inherited those write permissions. A PR comment is an event source, not proof of Doc delivery; the Work task gates on the delivered event and independent digest readback.

**Platform boundary:** This proves an event-triggered Work task can run from a GitHub PR comment and place its verified result in its associated ChatGPT conversation after that conversation is inactive. It does not prove a general external API to write to any arbitrary ChatGPT chat, guarantee mobile push delivery, or restart an interrupted in-flight agent process. The private Site now reads live GitHub run metadata and has a guarded server-side dispatch endpoint, but no scoped GitHub dispatch credential is configured; the controls remain disabled. The Site does not yet receive the restricted Doc reply body as telemetry. Preserve the return task and its PR #545 trigger for future eligible deliveries.


## 2026-11-17 | Conversation recovery checkpoint

Joseph reported a loss of contact, context, reasoning and chat content after the event-triggered return investigation. Reconciliation from GitHub, Sites and the task record found PR #545 open and draft at `6afbeb7be57410be6c8386d59a339d500384cd73`, this journal's return section present, private Site version 5 live, and the GCI Bridge Return task enabled with associated conversation `6afba93b-8288-83e9-9b0b-016a341ac5fb`. The most recent task run processed the duplicate-check receipt as a suppressed notification; it did not replace the earlier verified delivery result. The narrow continuation is the guarded Site dispatch credential and any desired operator notification verification. No repeated Gemini call, Production change or new paid service was made for recovery.

## 2026-11-17 | Site telemetry and new end-to-end run preparation

- Joseph authorized a scoped GitHub credential, detailed Doc telemetry and a fresh end-to-end Test. This is T2 Test operation: repository-scoped Actions dispatch, a single restricted synthetic Doc, one bounded Gemini attempt, no Production or new paid service.
- Sanitized receipt publisher now emits an explicit metadata allowlist in the existing PR comment, including observed Doc versions/revisions, claim, request attempt, delivery digest and terminal reason. It omits prompt/reply text and arbitrary runner fields. Unit tests passed (2/2); full local suite could not load `google.auth` in this scratch runtime. GitHub commits `10c6d37` and `986a47b`.
- Private Site version 8 deployed from source `54221b2d7e85b5489a7e8ee7f3eac4fb563e8cce`. Its `/api/telemetry` reads only GitHub Actions bot comments with the structured marker; deployed browser read returned `{\"receipts\":[]}` as expected before a new run. The Worker redirect setting initially failed and was corrected; no dispatch occurred. Telemetry is classified unverified runner observation until an independent restricted Doc readback. Site remains owner-only and its runtime secret inventory was empty.
- Registry now pins session `gci_site_20261117`, exchange `question0004`, payload digest `2b65aad97b9cc0f8e30518827edffdc8689d913271f9a40ffa5546dcfa371dd2` in commit `e3d8071`. Prior question0003 remains recorded. A revision-controlled append to the restricted Test Doc was read back: exactly one start and completion marker for question0004, zero claim and reply markers, Docs revision `AHj4eMRpV6DqBhOvbJZqkvOF9BATTUVl4fsvAhkjiJpQ2l4BAWW3I24jjwX7HoMe2CdVbrT7ij7bukUxiWHnSpV87osTtGG-ZlQqehvc7ro`.
- Next boundary: GitHub sudo challenge and fine-grained PAT creation. Request only the `jlhogarth/CoMind` repository, Actions read/write, short expiry. Token entry and creation are an authentication-credential handoff. Store only as `GCI_GITHUB_TOKEN` Site secret; enable `GCI_ALLOW_LIVE_DISPATCH` only for the prepared exchange. Then use Site buttons for preflight and one live run, independently read the Doc and digest, inspect restart with zero calls, and record actual idle stop. The permanent PR return task stays enabled.

### Preparation follow-up

- Registry rotation to question0004 exposed a hardcoded old session in the isolated poller test fixture. GCI CI run https://github.com/jlhogarth/CoMind/actions/runs/44177359457 failed (11 errors, 2 failures); the live workflow was not dispatched. The fixture now reads the current registry session and exchange at commit `b5608870127879c675a844907cb0012ef4c167a6`. Exact-head GCI CI https://github.com/jlhogarth/CoMind/actions/runs/44177796274 and No Placeholder Policy https://github.com/jlhogarth/CoMind/actions/runs/44177796194 passed. This prevents a registry rotation from invalidating the offline tests while preserving the allowlist check.
- GitHub fine-grained token form requires sudo confirmation. A GitHub Mobile request displayed number 30 but timed out before approval. No PAT was created, no Site secret was configured, and no preflight or live run was dispatched. Resume the same authenticated browser flow with Joseph available to approve a fresh GitHub Mobile challenge; do not reuse the expired number.

- Site wording corrected and private version 9 deployed from `433e497ffc32e95fc6dedf1599d0c4c0052cbc36`; the server-side secret is still absent and the fresh Site-driven run remains pending GitHub authentication.

## 2026-11-18 Indianapolis | question0004 live completion and ownership reconciliation

This section supersedes the older "fresh Site-driven run pending" checkpoint above for the bridge workflow. It does not claim Site-driven dispatch.

- **Single execution owner:** Joseph designated the Gemini Bridge Work Continuation conversation as the GCI-001 execution owner. The Site / Bridge Return conversation recorded a read-only development and dispatch handoff in [PR comment #6998759604](https://github.com/jlhogarth/CoMind/pull/545#issuecomment-6998759604). This is a coordination record, not a distributed lock. Check branch head, active runs and new comments before each mutation or dispatch.
- **Exact source and preflight:** Branch head `444f96f24893be58afc073e145af914d4dcbd63a` was used for [preflight run 44423621524](https://github.com/jlhogarth/CoMind/actions/runs/44423621524). Session `gci_site_20261117`, exchange `question0004`, registered restricted Doc `1dJEOjmLPm9gdw8xsVF8J_dyPK0HDx5N5RmW0ID42cnE`. The sanitized receipt reported one eligible exchange, `calls=0`, no delivery.
- **One live request and delivery:** [Run 44423725042](https://github.com/jlhogarth/CoMind/actions/runs/44423725042) recorded one revision-controlled claim, one `gemini_request_attempted`, one `gemini_response_received`, one `delivered`, and `idle_stopped` with `idle_seconds=240.0`, `elapsed_seconds=242.932`, 16 checks and one call. Its reply digest is `e650915f0a86ad7ee3c691e04b71f3751f43e9065e08891637784f6c6d198224`. The [sanitized receipt](https://github.com/jlhogarth/CoMind/pull/545#issuecomment-6995130092) includes Doc version/revision, event times and digest without prompt or reply text. Provider billed amount is UNKNOWN.
- **Independent readback:** The handoff conversation independently read the [restricted Doc](https://docs.google.com/document/d/1dJEOjmLPm9gdw8xsVF8J_dyPK0HDx5N5RmW0ID42cnE/edit), recomputed the reply SHA-256 and found one claim and one reply. This execution owner also reread it after the duplicate check and counted exactly one `question0004` claim and reply with the same completion digest.
- **Read-only restart check:** [Run 44451778789](https://github.com/jlhogarth/CoMind/actions/runs/44451778789) on the same branch commit used `enable_live=true`, `preflight_only=true`. It succeeded after keyless Google authentication, read Doc version 33, logged `existing_reply_verified` with the same digest and `calls=0`. No new Gemini generation occurred in this inspection. Its receipt job must remain classified as a verification, not a new delivery.
- **Dispatch mechanism:** The live Test workflow was dispatched through the previously authorized Composio GitHub connection, not the private Site. The Site's server-side GitHub dispatch secret and enable flag were absent in the last recorded inventory. A PAT reportedly created on iPhone was not successfully handed to the Site; verify its current state and revoke if unused before requesting another credential. The private Site's telemetry rendering and Site-driven dispatch remain separate acceptance gates.

**Decision boundary:** GCI-001's isolated Test exchange, reply readback, duplicate inspection and real inactivity stop are evidenced. PR #545 remains draft and main is unchanged. The claim/reply Doc is not a transactional ledger; marker removal or an ambiguous provider timeout still requires manual reconciliation. No arbitrary ChatGPT conversation wake, mobile push guarantee, exactly-once provider execution or Production readiness is inferred.
