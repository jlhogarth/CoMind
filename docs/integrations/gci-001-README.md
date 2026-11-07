# GCI-001 | On-demand Gemini Collaboration (TEST ONLY)

Issue: #544. Source specifications: GCI-001 through GCI-004 in CoMind Google Drive. No production deployment.

The workflow is **manually dispatched and off by default**. To run, select a fresh `session_id`, authorized Google Doc `document_id`, and explicitly set `enable_live=true`. After startup, the runner immediately inspects the document, checks metadata every 15 seconds, and stops after 240 seconds of inactivity or 30 minutes total. It invokes Gemini only for complete CHATGPT-origin envelopes belonging to the active session.

Required GitHub Actions secret: `GEMINI_API_KEY` (reported installed by the operator; secret value and current validity not independently verified). Google Drive authentication now uses keyless GitHub OIDC, via `google-github-actions/auth@v3` and scoped Workload Identity Federation, instead of a long-lived JSON key. Required repository **variables**: `GCI_WIF_PROVIDER` and `GCI_SERVICE_ACCOUNT_EMAIL`, whose real values are printed by `scripts/gci/bootstrap-google-oidc.sh` after Google Cloud setup. Never store any private key in the public repository. No live dispatch may proceed until both variables, the provider IAM policy, and service-account document sharing are read back.

## Send a completed request

Use a designated collaborative Google Doc and enter the exact markers:

```text
[COMIND_EXCHANGE_START id=question0001 role=CHATGPT session=session001]
What alternative architecture would you recommend?
[COMIND_EXCHANGE_COMPLETE id=question0001]
```

The runner appends `[COMIND_CLAIM ...]` before invoking Gemini, then appends `[COMIND_REPLY ...]` and a GEMINI envelope after a response. Existing claims are never automatically retried, to avoid unbounded duplicate billable calls. If a call fails after the claim, reconcile manually before retrying or using a new exchange ID.

## Current limitations

Initial implementation uses the Google Doc itself as the durable minimal claim/reply record. This is *not* a transactional Supabase ledger; two independent writers or an interrupted append can still require operator reconciliation. Never use parallel live workflows for the same doc. This code does not automatically resume a dormant ChatGPT conversation. It has no authenticated operator-console toggle yet. No hourly existing automation is modified. No service account secret is presumed to exist. Credential and live integration validation remain required before acceptance.

## Tests

`python -m pip install -r scripts/gci/requirements.txt`

`python -m unittest discover -s tests/gci -v`

## Rollback

Disable the GitHub workflow or cancel its active run; no schedulers or persistent server remain. The document is not deleted. Review orphaned claims manually.

## Security

The repository is public. Do not publish transcript content, sensitive prompts, session secrets, credential JSON, or internal URLs. Current implementation assumes the designated Google Doc is safe for Gemini disclosure and relies on operator consent prior to each session. Future improvements include stricter allowlisting, durable transactional leases, redaction, usage budgets, retry/backoff and complete operator-console readback.

## Google Cloud bootstrap (not yet executed)

Cloud project verified from operator-provided console URL: `comind-513807`. Service-account numeric ID: `102716239802737631124`; its actual email cannot be inferred without Google Cloud IAM readback. The file `scripts/gci/bootstrap-google-oidc.sh` is an auditable, fail-closed Cloud Shell helper that finds the service account by numeric ID; enables IAM, IAM Credentials, Security Token Service, Drive and Docs APIs; creates a repo-and-workflow-and-branch-scoped GitHub OIDC provider; and grants `roles/iam.workloadIdentityUser` **on that service account**, not broadly on the project. It prints the two GitHub **variable** values. This is a Google Cloud write operation and MUST be inspected and executed by the project administrator. It was not executed by ChatGPT, which lacks Google Cloud Console/IAM administrative access.

After applying the script, set the printed repository variables in GitHub Settings > Secrets and variables > Actions > Variables. The only secret needed is the previously reported `GEMINI_API_KEY`. Share ONLY an isolated designated test Google Doc with the returned service-account email, as **Editor**. The test file's permissions must be rechecked; the CoMind project root stays Restricted. Review project policies and any billing/API quotas before actual API requests. The WIF condition is restricted to this **test branch**. Before merging this workflow to `main`, create a separately reviewed production/ref IAM binding and change the provider condition. Do not loosen it automatically.

Do not dispatch a live run until all prerequisites are proven. The expected evidence is a workflow run ID, isolated protocol test result, one claim marker, one Gemini reply marker, Google Doc readback hash, elapsed idle duration, and explicit `idle_stopped` event. This application does not autonomously wake ChatGPT.

### Current evidence checkpoint

- Security: November 5, 2026 Drive metadata readback showed owner-only access on CoMind root, Architecture, Exports, GCI documents, PDF, and original collaboration document. No broad-link grants remained on inspected items.
- Code: PR #545, branch `gci-001-on-demand-gemini-review`. Keyless workflow and Cloud Shell bootstrap committed, but Google Cloud configuration and live API/idle tests are unverified.
- Isolation: existing hourly Gemini Review Watch and AED workflows untouched.
