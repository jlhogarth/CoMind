# GCI-001 | On-demand Gemini Collaboration (TEST ONLY)

Issue: #544. Source specifications: GCI-001 through GCI-004 in CoMind Google Drive. No production deployment.

The workflow is **manually dispatched and off by default**. To run, select a fresh `session_id`, authorized Google Doc `document_id`, and explicitly set `enable_live=true`. After startup, the runner immediately inspects the document, checks metadata every 15 seconds, and stops after 240 seconds of inactivity or 30 minutes total. It invokes Gemini only for complete CHATGPT-origin envelopes belonging to the active session.

Required GitHub Actions secrets: `GEMINI_API_KEY` (GitHub normalizes secret names to uppercase) and `GDRIVE_SERVICE_ACCOUNT_JSON` (the JSON for a Google service account granted edit permission on the designated document). The user reports adding a Gemini key, but the connector cannot verify secret inventory. Do not print or commit the values. Workflow will fail closed when missing. Model selection must be checked against the project's active Gemini entitlements.

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
