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
