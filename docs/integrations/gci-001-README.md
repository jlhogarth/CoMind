# GCI-001 | On-demand Gemini collaboration in Test

[Issue #544](https://github.com/jlhogarth/CoMind/issues/544) · [Draft PR #545](https://github.com/jlhogarth/CoMind/pull/545)

GCI-001 is an off-by-default, manually dispatched Test workflow. Its current one-shot authorization is the exact synthetic `question0004` prompt in session `gci_site_20261117`. The registry pins its SHA-256 digest and records three prior completed exchanges. Other documents, sessions, exchanges and edited prompt versions are ineligible. The original CM-XAI conversation is preserved separately. The GCI Bridge Return task can post a verified result to its associated ChatGPT conversation; it cannot inject into arbitrary chats or resume an interrupted agent turn.

## Human reading view and Work Chat exchange

The [human reading view](https://docs.google.com/document/d/1bB-sszBHwWmnEGOFIuKPeyH5LZjR1UYxUe1ldMTX7Vs/edit) presents the four verified synthetic exchanges as a question followed by **Gemini, verbatim**, with the reply digest and a separate reading note. The [restricted raw Test Doc](https://docs.google.com/document/d/1dJEOjmLPm9gdw8xsVF8J_dyPK0HDx5N5RmW0ID42cnE/edit) remains the machine-readable record. The view is a derived copy, not a claim, receipt or executable exchange. Check its source revision and regenerate or append only after an independently verified new reply. Never put prompt or response bodies in the public GitHub journal.

When Joseph asks for a **bounded Gemini exchange** in an active Work Chat:

1. Select only the relevant passage from that chat and define the narrow review question. A request that identifies the passage and asks to send it to Gemini is the specific authorization; otherwise show the exact proposed text and get that authorization before transmission. Classify and redact private or proprietary material. Do not silently submit the whole conversation or historical CM-XAI material. The current Test poller rejects a prompt body over 2,048 UTF-8 bytes, so summarize longer context faithfully and show the shortened text when needed.
2. Reconcile current issue #544, PR #545, branch, Doc and claim state. Create a new exchange and session ID; pin the exact payload SHA-256 in the existing allowlist and add one complete ChatGPT envelope to the designated restricted Doc with required-revision control. Keep the prior exchanges intact. These are consequential Test writes, not a general permission for unrestricted model use. Run a read-only preflight and verify identity, scope, eligible exchange, model and zero generation calls.
3. Dispatch one bounded generation run only for that authorized exchange. Independently reread the Doc, verify exactly one correlated Gemini envelope and SHA-256, and check the run's request count, provider usage when available, duplicate inspection and stop reason. Present **Gemini's reply verbatim** in the active Work Chat, followed by a clearly separate ChatGPT assessment of strengths, errors and proposed action, plus links to the Doc and run. Update the human reading view without altering the raw markers.

This can be initiated from any Work Chat that has the required connected tools and authority. The current return automation is bound to one associated conversation; a Drive edit alone does not wake an arbitrary dormant ChatGPT conversation. If the initiating chat is inactive, Joseph can return to it and request readback, or the existing bounded task can deliver only to its verified associated chat. Do not claim universal cross-chat push or automatic continuation until separately demonstrated. Current registry authorization covers **synthetic Test question0004 only**; a real conversation excerpt needs a fresh, explicit scoped authorization and privacy review before the runner will accept it.

## Verified Test state and operating procedure

[Preflight 44423621524](https://github.com/jlhogarth/CoMind/actions/runs/44423621524), [live run 44423725042](https://github.com/jlhogarth/CoMind/actions/runs/44423725042) and [restart 44451778789](https://github.com/jlhogarth/CoMind/actions/runs/44451778789) verify OIDC, one Gemini reply, independent readback, 240 seconds of actual inactivity and zero-call duplicate inspection. See the [acceptance journal](gci-001-acceptance-evidence-2026-11-07.md). PR #545 remains draft. The private Site's dispatch credential remains unverified; these runs used the authorized GitHub connector. The steps below remain useful for audit and newly authorized Test exchanges. Do not regenerate a completed exchange.

For iPhone use, prefer the [button-based Colab setup notebook](../../scripts/gci/gci-001-access-setup.ipynb).
It embeds the reviewed bootstrap with a SHA-256 check and offers separate sign-in/audit,
apply and verification buttons. Opening it or Run all never applies IAM changes.
See the [access recovery evidence and continuation](gci-001-access-recovery-2026-11-15.md)
for the authentication boundary, free CPU requirement, safe receipt and known limitations.
Cloud Shell and Codespaces remain optional; terminal paste is not a prerequisite.

1. Open Google Cloud Console for project `comind-513807`. Use Cloud Shell to retrieve `scripts/gci/bootstrap-google-oidc.sh` from the exact reviewed GCI branch commit. Run `bash -n` and run the script with `--audit`. Confirm the dedicated GCI identity `gci-001-test@comind-513807.iam.gserviceaccount.com` (numeric ID `109699106806527626952`), project access, API state, dedicated provider and effective service-account access. Audit leaves IAM and APIs unchanged. An existing provider with different trust rules, an extra provider, a direct project grant, a user-managed key or an unexpected impersonation binding requires review. The script checks direct project and service-account policy. The administrator must separately check inherited policy and organization constraints.
2. Apply the reviewed script with `--apply` from an authorized administrative session. Apply now performs a fresh `--verify` readback automatically. Verification returns nonzero when any required API, pool, provider or binding is missing. The script scopes GitHub trust to immutable repository and owner IDs, the exact Test branch and workflow, and the dispatch event. It grants impersonation only on the designated service account. Use the printed identifiers for `GCI_WIF_PROVIDER` and `GCI_SERVICE_ACCOUNT_EMAIL` repository variables only after `GCI_SETUP_READY=true`. Confirm `GEMINI_API_KEY` by secret name only.
3. Share only the [isolated synthetic Google Doc](https://docs.google.com/document/d/1dJEOjmLPm9gdw8xsVF8J_dyPK0HDx5N5RmW0ID42cnE/edit) with the verified account as Editor. Read back that file's ACL and preserve human ownership and Restricted general access. The runner verifies its Drive identity and the visible, untrashed Drive inventory before reading the document.
4. Confirm registration for `.github/workflows/gci-001-on-demand-gemini.yml`. An update to this file on the existing Test branch can run a credential-free registration job. Once GitHub lists the workflow, use its numeric workflow ID and the exact Test branch with `enable_live=false` to prove manual dispatch before enabling Google access. GitHub documents default-branch registration, so treat branch-only dispatch as supported for this repository only after a successful run is observed. If GitHub rejects the probe, review an inert default-branch definition and verify its deployment effects before changing the default branch. [GitHub workflow event reference](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#workflow_dispatch)
5. Dispatch the reviewed Test branch with `enable_live=true`, `preflight_only=true`, the registered document and session, and `gemini-3.5-flash-lite`. Verify the identity, Drive inventory, document version, eligible exchange and the key's access to model metadata. The preflight makes zero generation requests and writes nothing.
6. Dispatch once with the same inputs and `preflight_only=false` after confirming the existing Gemini project and cost boundary. The runner sends at most one generation request per run for the registered synthetic input, with a 512-output-token cap and no inference retry. Verify the generation attempt, provider-reported usage if available, reply digest, Docs revision, one logical reply and `idle_stopped` after at least 240 seconds of meaningful inactivity. Google Drive metadata is polled every 15 seconds. The job has a 35-minute outer timeout, and the poller stops scheduling work after its 30-minute deadline.
7. Independently reread the Docs reply and digest. Inspect again in read-only preflight, which verifies an existing complete receipt and sends no generation request. Keep run IDs and sanitized evidence in the [acceptance journal](gci-001-acceptance-evidence-2026-11-07.md). Avoid exposing prompt or response bodies, credentials and tokens in the public repository.

## OIDC provider mappings in Google Cloud Console

Use OpenID Connect (OIDC) in project `comind-513807`, pool ID `comind-gci` and provider ID `github-comind`. Use the issuer `https://token.actions.githubusercontent.com` and Default audience. Google requires a mapping for every claim referenced by the attribute condition. Keep all six mappings below.

| Google attribute | OIDC expression |
| --- | --- |
| `google.subject` | `assertion.sub` |
| `attribute.repository_id` | `assertion.repository_id` |
| `attribute.repository_owner_id` | `assertion.repository_owner_id` |
| `attribute.ref` | `assertion.ref` |
| `attribute.workflow_ref` | `assertion.workflow_ref` |
| `attribute.event_name` | `assertion.event_name` |

Use the full condition below. It restricts admission to the immutable repository and owner IDs, exact Test branch and workflow, and manual dispatch.

```text
assertion.repository_id == '1028814081' && assertion.repository_owner_id == '83435038' && assertion.ref == 'refs/heads/gci-001-on-demand-gemini-review' && assertion.workflow_ref == 'jlhogarth/CoMind/.github/workflows/gci-001-on-demand-gemini.yml@refs/heads/gci-001-on-demand-gemini-review' && assertion.event_name == 'workflow_dispatch'
```

## Concurrency and recovery

GitHub serializes runs for a document. The poller reads the Google Docs text and revision in one request, then applies the claim with `requiredRevisionId`. Competing claims against that revision cannot both succeed. The reply also uses a required revision, so concurrent human edits fail closed. A second Docs read checks parent correlation, the complete envelope and SHA-256 digest before reporting delivery. A claim with a missing, duplicated or invalid receipt is quarantined on restart. A provider timeout or interrupted write must be reconciled before any fresh authorization. Never delete a claim to retry a possibly billed request.

The isolated Test still relies on the document for durable claim and receipt evidence. A document editor can remove both markers, so document revisions alone cannot enforce durable replay protection after deliberate edits. GCI-002 requires a separate transactional exchange ledger, with a unique exchange key and leases, before multi-session or shared-editor use. That larger integration requires an independently validated Test database target and migration. Provider idempotency and exactly-once network execution remain unverified.

## Validation and rollback

Run `python -m pip install -r scripts/gci/requirements.txt`, `bash -n scripts/gci/bootstrap-google-oidc.sh` and `python -m unittest discover -s tests/gci -v`. To run the four-minute timer with stubbed providers and a real clock, set `GCI_TEST_REAL_IDLE=true` and filter to `-k real_elapsed`.

Cancel an active run or disable the workflow to stop execution. Keep the document evidence and review ambiguous claims manually. If the Test is retired, remove only the verified GCI-specific service-account document grant and federation binding. The hourly Gemini Review Watch operates independently.

