# CBE-001 Governed Browser Executor provenance

Date: 2026-10-31
Issue: #449
PR: #450
Branch: `cbe-001-governed-browser-executor`
Production change: false

## Decision
Adopt Playwright with Chromium as the initial self-hosted browser execution substrate for CoMind. Keep CoMind governance authoritative above the browser layer.

## Verified dependency bootstrap
- Successful GitHub Actions bootstrap run: `41179679454`.
- Generated artifact: `cbe-001-playwright-bootstrap`.
- Artifact ID: `13034382737`.
- Artifact digest: `sha256:7b5d137857cd415b473282583321ed80a646e2536b8d90bbf1bf2fef5928e38d`.
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

## Associated capture architecture
Playwright remains the browser control plane. A later CFR-002 slice can attach Chrome DevTools Protocol as an observation plane for Network, SSE, and WebSocket capture, with raw append-only archival followed by secret scrubbing, normalization, reconciliation, and drift detection. CDP is a backup and forensic observation path, not a replacement authority plane.

## Acceptance evidence target
The branch workflow must prove:
1. Pinned Playwright on Node 24.
2. Deterministic policy and worker lifecycle tests.
3. Allowlisted real Chromium navigation with bounded evidence.
4. Pre-execution rejection of disallowed navigation.
5. Explicit recoverable interruption semantics.
6. No credential or lease-token material in emitted evidence.
7. Governed public GitHub navigation through the CBE worker.

The authenticated GitHub/Codespaces proof remains an interactive Test step because CI does not possess a human-authenticated browser profile. It must not be simulated or satisfied by storing credentials in repository or workflow state.

## Resume condition
After CBE-001 acceptance, return to AED-002 Temporal durable liveness work using CBE where browser execution materially removes the prior dependency.
