# GCI-001 access recovery, November 15, 2026 (Indianapolis)

## Outcome and scope

PARTIALLY COMPLETE. A button-based Google Colab adapter replaces terminal copying and
manual OIDC field entry with the existing reviewed bootstrap. Live Google IAM authentication,
provider creation and end-to-end Gemini acceptance remain NOT VERIFIED.
Colab's public home page loaded in Cloud Browser; Google Console still returned Site Unavailable.
This is a prepared alternative, not proof that Google login or the iPhone flow succeeds.

Authority: Joseph's current instruction and standing L4A Test development scope.
T1 repository development; actual IAM application is a security-sensitive operation under the
existing explicit GCI authorization, using Joseph's Google-admin sign-in. No new generalized
admin service or long-lived service-account credentials. Proposed NIST AC-6 and AU-3 mapping
is least privilege and evidence, not a compliance certification.

Canonical lane: [issue #544](https://github.com/jlhogarth/CoMind/issues/544),
[draft PR #545](https://github.com/jlhogarth/CoMind/pull/545),
branch `gci-001-on-demand-gemini-review`. Recovery predecessor
`e7a44041652a4b5ed770e3a1f77f4b1a43078600`; main independently read as
`e69a32c7ff8669e9bbe19d9845b9c422d4819ea7`. All 26 returned open PR file lists
were checked; no other open PR changed GCI paths. No default-branch change or merge.

## Friction evidence and diagnosis

| Observation | Classification | Resolution or boundary |
| --- | --- | --- |
| Repeated iPhone terminal paste failures and twelve manual field copy operations, supplied by Joseph | User-observed, recurring, high impact | Notebook buttons; no terminal instructions in the primary path |
| Uploaded Bash script reached gcloud, which reported no active account | Screenshot evidence | Missing Google credentials, separate from script file location |
| Google Accounts generic 403 | Screenshot evidence, cause unknown | Do not label bot detection or IAM denial from this alone |
| Google Console returned Site Unavailable in this Cloud Browser on this continuation | Independently observed | Stop repeated browser retries; no claim to fix Google's or ChatGPT's browser platform |
| Colab home loaded successfully in the same browser | Independently observed public access only | Notebook adapter; sign-in remains a human security boundary |
| Connected tool search and plugin search did not expose Google Cloud IAM administration | Observed discovery result | Do not reuse Gmail/Drive tokens or claim those connectors grant IAM access |
| Cloud Shell repository launch opens non-Google repositories without user credentials | Official documentation | Possible contributor to prior failure, not established root cause of this session |
| Two CoMind Codespaces are stopped; both report clean, unpushed=false, ref=main | Authenticated GitHub API read | Reuse if later needed; no new Codespace, deletion, startup or billing action |

Codespaces: `organic-lamp-w469jqpj7p93gxw9` and `curly-meme-9xvq4gr46xjh9x97`.
The repository workflow registry has 138 entries across two inspected pages. GCI CI is active
as `407775343`; the on-demand workflow is active as `412660377`. Prior successful disabled
dispatch: https://github.com/jlhogarth/CoMind/actions/runs/42715449568 . Registration is already
done and must not be recreated by merging the implementation. No recurring watch changed.
Fresh repository-variable inventory has `GCI_SERVICE_ACCOUNT_EMAIL` set correctly;
`GCI_WIF_PROVIDER` remains absent.

## Implemented recovery path

`scripts/gci/gci-001-access-setup.ipynb` embeds the bootstrap and the adapter source;
`build_access_notebook.py` regenerates it deterministically. The code cell only displays
controls. Sign-in/check must succeed before Apply is enabled; Apply rechecks existing state.
Colab uses its own Google dialog authentication. An older runtime requiring copied auth codes
is rejected explicitly, rather than sending Joseph back to a terminal. Runtime dependencies
are checked, never installed or purchased silently. Use free CPU, no GPU or Enterprise.

`bootstrap-google-oidc.sh` now pins project number `373198958202`, verifies prerequisites,
and has `--verify`, which fails for incomplete setup. Apply rereads API, provider, key and
direct policy state before reporting readiness. Existing trust mismatch remains a stop.
Inherited organization/folder policies and external file access still need independent checks;
these direct-policy tests do not prove globally exclusive service-account access.

Safe JSON receipts include script SHA-256, mode, UTC timing, readiness, classification,
known bootstrap messages and zero Gemini requests. Raw stderr, OAuth responses and tokens
are excluded. A timeout is UNKNOWN, not success; no automatic apply retry follows it.
The receipt stays in the temporary notebook runtime until downloaded. The notebook suppresses
saved cell outputs. It never mounts Drive, requests GitHub credentials, or invokes a model.
Joseph's admin OAuth credential is broader than this script's operations; disconnect/delete
the temporary Colab runtime afterward. This is not a permanently scoped admin worker.

## Tests and acceptance boundary

Offline tests exercise missing authentication, wrong project, incomplete setup, unexpected
provider, altered trust, project role, user key, broad impersonation, idempotent repeated apply,
lost provider write/readback, source digest mismatch, sanitized errors, timeout ambiguity,
disabled Apply before audit and notebook/source consistency. Existing poller tests are retained.
The opt-in 240-second test remains skipped during this setup-only change. Neither mocked IAM
nor protocol tests establish live OIDC, Docs delivery or actual idle-stop acceptance.

During local setup, the first poller run lacked Python dependencies and the registry file in
the partial checkout; both were retrieved from the exact baseline before rerunning. One new
error-classification test caught singular 'credential' not matching 'credentials'; corrected.
Final test counts and exact-head CI links are recorded in the issue/PR continuation comment.

## Safe continuation

1. Open the committed notebook in Colab; use the existing browser's secure sign-in handoff
   when available. A sign-in on Joseph's separate phone browser does not authenticate Work's browser.
2. Run the display cell, then Sign in and check. Do not transmit credentials through chat.
3. Apply only after successful audit. Verify and download the nonsecret receipt. If a Google
   permission or unexpected-policy check fails, preserve the classification and resolve that
   specific boundary; do not weaken the trust condition or create a key.
4. Use authenticated readback to validate the provider and binding. Set `GCI_WIF_PROVIDER`
   using the existing GitHub connector, then dispatch the existing read-only preflight.
5. Only after preflight passes, proceed to the previously authorized single synthetic Gemini
   request, independent Docs readback, repeat inspection and actual 240-second idle evidence.
6. Append the receipt and run links to #544/#545. No unattended worker or conversation-wake
   capability has been created. Work Standard, Medium remains adequate.

Rollback: revert this additive notebook/adapter change in the same branch; retain evidence.
For any actual IAM apply, audit current state first and remove only grants/resources verified
as created for this lane if retirement is authorized. Never delete shared or unexplained resources.

## Researched alternatives

Colab has official MCP and runtime APIs, but their setup also needs authentication and enabled
MCP service access. No eligible installed connector was found; introducing another credential
bootstrap now would not solve this prerequisite. A future approved integration can reuse the
same reviewed script, safe receipts and existing GitHub workflow rather than a competing runner.
Cloud Shell tutorial links were rejected as the primary solution because they retain the
credential/session dependency. Long-lived JSON keys and broad admin delegation were rejected.

Sources:
- https://docs.cloud.google.com/shell/docs/open-in-cloud-shell (non-Google repository credential isolation)
- https://docs.cloud.google.com/shell/docs/auth (Cloud Shell authorization)
- https://github.com/googlecolab/colabtools/blob/main/google/colab/auth.py (dialog authentication and gcloud support)
- https://research.google.com/colaboratory/faq.html (free runtime, GitHub notebooks, runtime deletion)
- https://developers.google.com/colab/api/reference/mcp (future integration prerequisites)
