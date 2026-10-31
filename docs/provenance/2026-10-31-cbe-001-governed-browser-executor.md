# CBE-001 Governed Browser Executor provenance

Date: 2026-10-31
Issue: #449
PR: #450
Branch: `cbe-001-governed-browser-executor`
Production change: false
Paid browser service required: false

## Decision
Adopt Playwright with Chromium as the initial self-hosted browser execution substrate for CoMind. Keep CoMind governance authoritative above the browser layer. CBE is an execution substrate, not a new authority source.

## Verified dependency bootstrap
- Initial successful GitHub Actions bootstrap run: `41179679454`.
- Initial generated artifact: `cbe-001-playwright-bootstrap`.
- Initial artifact ID: `13034382737`.
- Initial artifact digest: `sha256:7b5d137857cd415b473282583321ed80a646e2536b8d90bbf1bf2fef5928e38d`.
- Resolved Playwright version: `1.64.1`.
- Generated `package.json` and `package-lock.json` were ingested into the CBE branch.
- The original No Placeholder failure was traced to a deterministic test using a reserved example network hostname. The test now uses `playwright.dev` as a real disallowed host.

## Canonical lease reuse
CBE does not create a second work ownership system. The canonical verifier checks presented task ID, lease token, worker instance ID, fencing epoch, state, and lease expiry against `comind.cm_foundry_work_lease` before browser execution.

CI and isolated browser-runtime proofs use a synthetic valid-lease verifier because those environments do not have a live CoMind database connection. The canonical Foundry lease verifier is independently tested against the exact database contract. This keeps browser-runtime proof separate from database-connectivity proof without introducing a second lease implementation.

## Security boundaries
- Exact host allowlist and HTTPS are mandatory.
- Embedded URL credentials are rejected.
- Consequential actions require authority and CLEAR at policy level.
- CBE-001 executes only read-side actions: navigate, read, screenshot.
- Mutation actions remain non-executable in this milestone.
- Lease tokens and credential-like evidence keys are redacted.
- URL query and fragment data are stripped from canonical evidence.
- Persistent Chromium storage is isolated from emitted evidence.
- Authenticated browser profiles are prohibited from repository paths.
- The optional interactive VNC listener binds only to localhost inside a Codespace.
- The optional Codespaces forwarded noVNC port must remain Private.
- Production activation is excluded.

## Governed worker implementation
The worker contract includes caller provenance, target URL, explicit action scope, bounded timeout, expected-result assertions, and a canonical Foundry lease reference. It recognizes navigation, read, screenshot, click, type, download, and upload policy classes. CBE-001 deliberately binds only navigation, read, and screenshot execution. Consequential actions are policy modeled but cannot execute in this milestone.

The Playwright driver supports both ephemeral contexts and an isolated persistent context directory. Screenshot bytes are not emitted into canonical evidence. The worker emits only screenshot SHA-256 and byte length together with bounded navigation metadata.

Explicit recoverable failure states cover browser start failure, timeout, browser interruption, cleanup failure, and lease-verification infrastructure failure. Policy rejection, invalid canonical lease state, and expected-result mismatches remain explicit non-recoverable outcomes for the submitted job.

## Verified automated acceptance evidence
### Dedicated CBE workflow
Verified workflow run `41182017463` (run #14): success.

Artifact:
- Name: `cbe-001-playwright-bootstrap`
- Artifact ID: `13035432250`
- Digest: `sha256:95d85c1897f7734d63fa3c9721ac512d4733ff385078a6787cc3a37cee473244`

Verified in the workflow:
- Node 24 setup: success.
- Committed dependency installation: success.
- Playwright 1.64.1 pin verification: success.
- Codespaces interactive harness static validation: success.
- Chromium and system dependency installation: success.
- CBE build and deterministic tests: success.
- Governed navigation to `https://playwright.dev/`: success.
- Governed navigation to `https://github.com/jlhogarth/CoMind`: success.
- Bounded screenshot evidence: success.
- Evidence artifact upload: success.

Equivalent public-browser evidence was inspected for lease tokens, cookies, authorization material, passwords, MFA material, browser storage state, query strings, fragments, and token-like URL material. None appeared in bounded evidence.

### General repository CI
Verified CI run `41182017420` (run #1452): success.

Verified:
- Devcontainer contract validation: success.
- Devcontainer compose validation: success.
- Devcontainer image build and runtime verification: success.
- Development runtime browser verification: success.
- No Placeholder Policy run `41182017472`: success.
- Implementation Integrity run `41182017400`: success.

Later branch changes also passed dedicated CBE workflow run #23 before the final Codespaces proof infrastructure was exercised.

## Real GitHub Codespaces runtime proof
CBE-001 acceptance includes a real browser job executed inside GitHub Codespaces, not only GitHub Actions.

Proof environment:
- Codespace: `cbe-001-export-proof-6p6r7xq7g4gf4xx4`
- Machine: 2 cores, 8 GB RAM, 32 GB storage.
- Source branch: `cbe-001-governed-browser-executor`.
- Proof devcontainer: `.devcontainer/cbe-proof/devcontainer.json`.
- Browser image: `mcr.microsoft.com/playwright:v1.64.1-noble`.
- Idle timeout: 30 minutes.
- Retention requested: 1 day.
- Production change: false.

The proof-only Codespace executed `server/scripts/cbe-codespace-runtime-proof.mjs` through the governed CBE worker. The runtime asserted `CODESPACES=true` and required the GitHub-provided `CODESPACE_NAME` before execution.

Durable proof file:
`docs/provenance/2026-10-31-cbe-001-codespaces-runtime-proof.json`

Verified result:
- Proof status: `succeeded`.
- Reason: `completed`.
- Recoverable: false.
- Caller: `cbe-001-codespaces-runtime-test`.
- Authority reference: `L4A-CBE-001-Test`.
- Target: `https://github.com/jlhogarth/CoMind`.
- Actions: navigate, read, screenshot.
- Required final host: `github.com`.
- Required HTTP success: true.
- Observed HTTP status: 200.
- Observed HTTP success: true.
- Screenshot SHA-256: `99e915ed149dfd111afd639980e15c994a9eea2da46defff6014e641738bc8fe`.
- Screenshot byte length: 82807.
- Started: `2026-10-31T08:12:12.658Z`.
- Completed: `2026-10-31T08:12:17.093Z`.

The durable proof contains no password, cookie, authorization header, MFA material, browser storage state, raw credential, or lease token. Screenshot bytes are not stored, only digest and byte length.

Authentication was not required because the selected Test target is public. Acceptance item 6 states that Joseph performs interactive authentication when required. That condition was not triggered for this proof. CBE still retains the private persistent-context/noVNC harness for future jobs that genuinely require interactive authentication.

## Codespaces evidence recovery and workaround history
The first attempt to obtain the Codespaces proof through an asynchronous autostart harness was difficult to observe. CBE-001 was therefore changed to a dedicated proof-only devcontainer with synchronous `postCreateCommand` execution.

A proof-only Codespace using the standard Node devcontainer reached Available without publishing durable proof. The proof environment was simplified to the official pinned Playwright image so browser binaries and system dependencies were already present.

The final proof-only Codespace successfully produced an uncommitted evidence file. GitHub reported both `has_uncommitted_changes=true` and `has_unpushed_changes=true`, confirming workspace state after the proof.

GitHub Codespaces export was then used to recover the proof without opening the mobile Codespaces IDE. The first export attempt eventually failed. The preserved stopped Codespace was not deleted. A second export attempt succeeded at `2026-10-31T04:19:43-04:00` and created:
- Export branch: `codespace-cbe-001-export-proof-6p6r7xq7g4gf4xx4`
- Export commit: `1679117480eb9c02192a6cd3d18ca466ac621535`

The exported proof was inspected and then ingested into the canonical CBE branch through the direct GitHub repository connection at commit `3b627626b1964e5f306593a967e00dff2d6d9c84`.

After the proof had succeeded, a later attempt to create another Codespace returned HTTP 402 because the GitHub account had exhausted monthly free Codespaces usage or its configured budget. No budget increase was authorized or performed. This did not invalidate the already completed and exported runtime proof.

## Interactive browser capability retained
The branch retains `scripts/cbe_codespace_browser.sh` for a future authentication-required job. It creates an isolated persistent Chromium profile outside the repository, uses Xvfb/Openbox/x11vnc/noVNC, binds the VNC listener only to localhost, and forwards noVNC on private port 6080.

This interactive path is a capability, not a CBE-001 acceptance blocker. Credentials and MFA must be entered only into the visible browser when a future target requires them, never into terminal commands, repository files, chat, workflows, or canonical evidence.

## External research
Accessed 2026-10-31.

1. Playwright installation documentation
   - URL: https://playwright.dev/docs/next/intro
   - Material finding: current system requirements include Node.js 24 and documented browser installation paths.
2. Microsoft Playwright repository
   - URL: https://github.com/microsoft/playwright
   - Material finding: Playwright supports Chromium browser automation.
3. Playwright package metadata
   - URL: https://github.com/microsoft/playwright/blob/main/packages/playwright/package.json
   - Material finding: package licensing is Apache-2.0 and supported Node engines begin at Node 20.
4. Playwright Docker documentation
   - URL: https://playwright.dev/docs/docker
   - Material finding: `mcr.microsoft.com/playwright:v1.64.1-noble` is an official pinned image containing Playwright browser binaries and system dependencies. The Playwright npm package remains a project dependency.
5. GitHub Codespaces security documentation
   - URL: https://docs.github.com/en/codespaces/reference/security-in-github-codespaces
   - Material finding: Codespaces use isolated networking and short-lived GitHub authentication tokens. Private forwarded ports remain protected by GitHub authentication.
6. GitHub Codespaces port forwarding documentation
   - URL: https://docs.github.com/en/codespaces/developing-in-a-codespace/forwarding-ports-in-your-codespace
   - Material finding: devcontainer configuration can forward and label ports; private forwarded ports require authentication.
7. GitHub Codespaces default environment variables
   - URL: https://docs.github.com/en/codespaces/developing-in-a-codespace/default-environment-variables-for-your-codespace
   - Material finding: Codespaces provide `CODESPACES`, `CODESPACE_NAME`, repository metadata, and a signed user-scoped `GITHUB_TOKEN` for authenticated GitHub API calls.
8. GitHub Codespaces repository authentication troubleshooting
   - URL: https://docs.github.com/en/codespaces/troubleshooting/troubleshooting-authentication-to-a-repository
   - Material finding: a Codespace created from a trusted repository receives a `GITHUB_TOKEN` with read/write access to its source repository and uses HTTPS authentication by default.
9. GitHub Codespaces export documentation
   - URL: https://docs.github.com/en/codespaces/troubleshooting/exporting-changes-to-a-branch
   - Material finding: changes in a Codespace can be exported to a repository branch without launching the Codespace UI.
10. GitHub Codespaces REST API documentation
    - URL: https://docs.github.com/en/rest/codespaces/codespaces
    - Material finding: the API supports creation, lifecycle management, export initiation, and export status inspection.
11. Debian bookworm `x11-utils`
    - URL: https://packages.debian.org/bookworm/x11-utils
    - Material finding: provides `xdpyinfo`, used to verify readiness of the isolated X display.
12. Debian bookworm noVNC package
    - URL: https://packages.debian.org/bookworm/novnc
    - Material finding: noVNC is available as a Debian package.
13. Debian bookworm x11vnc package
    - URL: https://packages.debian.org/bookworm/x11vnc
    - Material finding: x11vnc is available for local VNC exposure of an isolated display.
14. noVNC advanced usage
    - URL: https://github.com/novnc/noVNC/wiki/Advanced-usage
    - Material finding: noVNC uses WebSockets and can be served through `websockify` to a VNC target.

## Associated capture architecture
Playwright remains the browser control plane. A later CFR-002 slice can attach Chrome DevTools Protocol as an observation plane for Network, SSE, and WebSocket capture, with raw append-only archival followed by secret scrubbing, normalization, reconciliation, and drift detection. CDP is a backup and forensic observation path, not a replacement authority plane.

## Acceptance status
CBE-001 acceptance is satisfied in Test. The worker is pinned, governed, bounded, deny-by-default, lease-aware, redaction-aware, deterministically tested, proven against real browser targets, and proven inside a real GitHub Codespaces runtime. No Production activation occurred and no paid browser service is required.

## Resume condition
After PR #450 passes final branch CI and merges under non-Production L4A authority, Issue #449 can close and AED-002 Temporal durable liveness work can resume using CBE where browser execution removes the prior dependency.
