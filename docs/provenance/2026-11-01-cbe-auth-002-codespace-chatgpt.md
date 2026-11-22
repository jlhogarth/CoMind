# CBE-AUTH-002 Codespaces ChatGPT Bootstrap

Date: 2026-11-01
Issue: #492
Parent acceptance lane: #489
Production change: false
Paid-service expansion: false
Authority expansion: false

## Purpose

CBE-AUTH-001 established a governed external persistent ChatGPT browser profile and a fail-closed profile-global single-writer guard. The first live return still requires a human to complete normal ChatGPT sign-in and MFA in a visible browser.

The CoMind devcontainer already contains an isolated interactive browser bridge using Xvfb, Openbox, x11vnc, noVNC, and private forwarded port 6080. CBE-AUTH-002 reuses that existing capability for ChatGPT authentication instead of requiring a separate local desktop host.

## Execution contract

From the repository root in an available CoMind Codespace:

```text
bash scripts/cbe_chatgpt_codespace_auth.sh
```

The wrapper:

1. keeps the persistent profile at `/workspaces/.comind-chatgpt-profile` by default, outside the repository;
2. installs the repository-pinned Playwright Chromium runtime and builds the server;
3. starts Xvfb and Openbox on the isolated display;
4. binds x11vnc only to localhost;
5. binds noVNC/websockify only to loopback port 6080, which the devcontainer forwards privately;
6. launches ChatGPT in headed Chromium;
7. requires the canonical CBE-AUTH-001 composer and signed-in account controls, with no visible login control;
8. polls for successful authentication for a bounded 30-minute window;
9. preserves no passwords, MFA values, cookies, tokens, local storage, or browser authentication material in repository evidence;
10. closes the interactive browser after authentication while preserving the external profile for CBE-003.

The human interaction is limited to opening private port 6080 and completing normal ChatGPT sign-in and MFA inside the visible browser. Successful sign-in is detected automatically.

## Shared-resource safety

The ChatGPT authentication session acquires the same profile-global filesystem lock used by the governed CBE-003 actuator. If the external profile is already owned, authentication fails closed with `profile_actuator_busy`. Existing locks are not stolen automatically.

This lock protects only the shared browser profile. It does not claim, pause, merge, or alter unrelated development lanes.

## Verification

Exact-head acceptance includes:

- shell syntax validation;
- Node syntax validation;
- full TypeScript server build;
- static verification that port 6080 remains the declared private CBE interactive browser path;
- verification that the devcontainer retains Xvfb, x11vnc, noVNC, websockify, and Openbox;
- verification that VNC and noVNC listeners remain loopback-bound;
- verification that the ChatGPT session reuses canonical authentication selectors and the profile-global lock;
- existing authentication-selector and profile-lock regression tests.

Synthetic acceptance does not claim successful ChatGPT sign-in and does not claim a returned development conversation.

## Completion boundary

Issue #492 completes when the one-command Codespaces authentication path is exact-head green and merged. Parent Issue #489 remains open until a real governed NOTEBOOK-001 return is observed in the exact registered conversation, ChatGPT response generation is observed, `RETURNED` and `conversationReturned=true` are durably recorded, recovery ownership is released, and ordinary Notebook continuation resumes in the originating conversation.
