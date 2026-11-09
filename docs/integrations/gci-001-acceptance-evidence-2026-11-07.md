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
