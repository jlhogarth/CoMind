# CBE-001 Governed Browser Executor provenance

Date: 2026-10-31
Issue: #449
PR: #450
Branch: `cbe-001-governed-browser-executor`
Production change: false

## Decision
Adopt Playwright with Chromium as the initial self-hosted browser execution substrate for CoMind. Keep CoMind governance authoritative above the browser layer.

## Verified dependency bootstrap
- Initial successful GitHub Actions bootstrap run: `41179679454`.
- Initial generated artifact: `cbe-001-playwright-bootstrap`.
- Initial artifact ID: `13034382737`.
- Initial artifact digest: `sha256:7b5d137857cd415b473282583321ed80a646e2536b8d90bbf1bf2fef5928e38d`.
- Resolved Playwright version: `1.64.1`.
- Generated `package.json` and `package-lock.json` were ingested into the CBE branch.
- The original no-placeholder failure was traced to a deterministic test using a reserved example network hostname. The test now uses `playwright.dev` as a real disallowed host.

## Canonical lease reuse
CBE does not create a second work ownership system. The worker verifies its presented task ID, lease token, worker instance ID, fencing epoch, and lease expiry against `comind.cm_foundry_work_lease` before browser execution.

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
- The interactive VNC listener binds only to localhost inside the Codespace.
- The Codespaces forwarded noVNC port must remain Private.

## Verified automated acceptance evidence
Current verified branch head with authenticated-browser harness: `a9d339395739636b23ab98d15c5b4e00ac24cbfb`.

Dedicated CBE workflow:
- Workflow run: `41182017463` (run #14).
- Result: success.
- Artifact ID: `13035432250`.
- Artifact digest: `sha256:95d85c1897f7734d63fa3c9721ac512d4733ff385078a6787cc3a37cee473244`.
- Node 24 setup: success.
- Committed dependency installation: success.
- Playwright 1.64.1 pin verification: success.
- Codespaces interactive browser harness validation: success.
- Chromium and system dependency installation: success.
- CBE build and unit tests: success.
- Governed navigation to `https://playwright.dev/`: success.
- Governed navigation to `https://github.com/jlhogarth/CoMind`: success.
- Bounded screenshot evidence: success.
- Evidence artifact upload: success.

The emitted browser evidence from the prior equivalent browser proof was inspected for lease tokens, cookies, authorization material, passwords, MFA material, browser storage state, query strings, fragments, and token-like URL material. None of those values appeared in the bounded evidence. Run #14 executes the same governed public-browser proof plus the new authenticated harness validation.

General repository CI:
- CI run: `41182017420` (run #1452).
- Result: success.
- Devcontainer contract validation: success.
- Devcontainer image build and runtime verification: success.
- Development runtime browser verification: success.
- No Placeholder Policy run: `41182017472`, success.
- Implementation Integrity run: `41182017400`, success.

## Authenticated Codespaces proof harness
The remaining acceptance item is intentionally interactive because CI must not hold or simulate Joseph's GitHub credentials or MFA state.

The branch provides `scripts/cbe_codespace_browser.sh`, which:
1. Uses an authenticated Chromium profile outside the repository.
2. Installs the pinned Chromium browser for the current Playwright dependency.
3. Starts an Xvfb display and Openbox window manager.
4. Starts `x11vnc` on localhost only.
5. Starts noVNC through `websockify` on localhost port 6080.
6. Opens `https://github.com/codespaces` in a visible Playwright persistent context.
7. Waits for human authentication without printing the GitHub username or credential material.
8. Closes the visible session after authentication is detected.
9. Reuses the same persistent profile through the governed CBE worker in headless mode.
10. Requires the final URL to remain on GitHub under `/codespaces` and rejects a sign-in redirect.
11. Emits only bounded CBE evidence.

The Codespaces devcontainer forwards port 6080 and labels it `CBE interactive browser`. GitHub Codespaces forwards ports privately by default, and private forwarded ports require GitHub authentication by the codespace creator. Port 6080 must not be changed to organization or public visibility for this proof.

## External research
Accessed 2026-10-31.

1. Playwright official installation documentation
   - URL: https://playwright.dev/docs/next/intro
   - Material finding: current system requirements include Node.js 24 and the documented installation path supports browser binaries and system dependencies.
2. Microsoft Playwright repository
   - URL: https://github.com/microsoft/playwright
   - Material finding: Playwright supports browser automation scripts and Chromium.
3. Playwright package metadata in the Microsoft repository
   - URL: https://github.com/microsoft/playwright/blob/main/packages/playwright/package.json
   - Material finding: the package declares Apache-2.0 licensing and Node.js engine support beginning at Node 20.
4. GitHub Codespaces security documentation
   - URL: https://docs.github.com/en/codespaces/reference/security-in-github-codespaces
   - Material finding: forwarded ports are private by default and private forwarded ports are accessible only to the codespace creator after GitHub authentication.
5. GitHub Codespaces port forwarding documentation
   - URL: https://docs.github.com/en/codespaces/developing-in-a-codespace/forwarding-ports-in-your-codespace
   - Material finding: devcontainer configuration can forward and label ports, and private is the default visibility.
6. Debian bookworm `x11-utils`
   - URL: https://packages.debian.org/bookworm/x11-utils
   - Material finding: the package includes `xdpyinfo`, used to verify readiness of the isolated X display.
7. Debian bookworm noVNC package
   - URL: https://packages.debian.org/bookworm/novnc
   - Material finding: noVNC is available as a Debian package for the Codespaces base environment.
8. Debian bookworm x11vnc package
   - URL: https://packages.debian.org/bookworm/x11vnc
   - Material finding: x11vnc is available as a Debian package for local VNC exposure of the isolated display.
9. noVNC advanced usage
   - URL: https://github.com/novnc/noVNC/wiki/Advanced-usage
   - Material finding: noVNC uses WebSockets and can be served through `websockify` to a VNC target.

## Associated capture architecture
Playwright remains the browser control plane. A later CFR-002 slice can attach Chrome DevTools Protocol as an observation plane for Network, SSE, and WebSocket capture, with raw append-only archival followed by secret scrubbing, normalization, reconciliation, and drift detection. CDP is a backup and forensic observation path, not a replacement authority plane.

## Acceptance status
Automated CBE-001 acceptance items are verified. The only remaining item is the human-authenticated GitHub/Codespaces proof through the private Codespaces browser surface. It must not be simulated or satisfied by storing credentials in repository, workflow, logs, or canonical evidence.

## Resume condition
After the authenticated Codespaces proof succeeds, CBE-001 can be closed under the existing non-Production L4A authority and AED-002 Temporal durable liveness work can resume using CBE where browser execution materially removes the prior dependency.
