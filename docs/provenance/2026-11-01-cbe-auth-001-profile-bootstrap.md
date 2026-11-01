# CBE-AUTH-001 External ChatGPT Profile Bootstrap

Date: 2026-11-01
Issue: #489
Production change: false
Paid-service commitment: false
Authority expansion: false

## Purpose

CBE-003 can return repaired work to an exact registered ChatGPT conversation only when its self-hosted Playwright runtime has an authenticated persistent browser profile. The authentication material must remain outside the repository and outside durable evidence.

CBE-AUTH-001 provides a bounded interactive bootstrap utility so the human prerequisite is limited to normal ChatGPT sign-in and MFA in a Playwright browser window.

## Command

From `server/` after installing dependencies and Playwright Chromium:

```text
CBE_PROFILE_DIR=/absolute/path/outside/repository/comind-chatgpt-profile npm run cbe:chatgpt-auth-bootstrap
```

On Windows PowerShell, set `CBE_PROFILE_DIR` to a persistent directory outside the repository before running the npm command.

The utility:

1. rejects profile paths inside the repository;
2. creates the external profile directory with restrictive local permissions where supported;
3. launches a headed persistent Playwright Chromium context;
4. opens `https://chatgpt.com/`;
5. asks the operator to complete normal sign-in and MFA in that browser only;
6. requires the ChatGPT composer and signed-in account control, and rejects a visible login button;
7. closes the browser while preserving the external persistent profile.

No cookie, password, MFA value, browser token, local storage state, or session material is printed, copied into a job payload, committed to GitHub, or emitted as evidence.

## Security boundary

The profile directory is a local credential-bearing browser asset and must be treated accordingly:

- keep it outside the repository;
- do not sync it into GitHub, Google Drive, logs, artifacts, or RunBook evidence;
- restrict host access to the runtime operator/service identity;
- invalidate/re-bootstrap it if the ChatGPT session is logged out or the host is compromised;
- CBE evidence may record that authentication was verified, but never the authentication material itself.

## First live return

After bootstrap, the same `CBE_PROFILE_DIR` can be supplied to the CBE-003 actuator. The first accepted proof remains `NOTEBOOK-001` and must satisfy all of the following:

- exact MP-007/MP-008 registered conversation UUID and URL;
- valid Foundry recovery lease and fencing epoch;
- bounded MP-006 handoff;
- handoff observed in the exact conversation;
- ChatGPT response generation observed;
- `RETURNED` and `conversationReturned=true`;
- recovery ownership released;
- `controllerMayContinueImplementation=false`;
- ordinary Notebook continuation resumes in the originating conversation.

The bootstrap utility does not itself post a recovery message and does not claim a successful return.

## Recovery verification repair, 2026-11-01

Tier: T2 for authenticated conversation delivery; this commit changes development code only and grants no execution authority.
Authority: standing L4A grant, source chatgpt:2026-10-30:l4a-authorization-grant; Development Environment Contract v1.2.
Affected resources: existing Issue #489 / PR #490 branch, authentication bootstrap, and CBE handoff response observation.
Dependencies: exact conversation binding, canonical lease/fencing, CLEAR, reachable authenticated external runtime.
Relevant controls: AGENTS.md evidence requirements; Contract completion standard and credential custody; MP-006 verified return.
Rollback: revert this bounded repair commit. No database migration, credential export, Production activation, or paid commitment.
Overhead: no new service; bounded response observation retains the existing 30-second maximum wait. No material expected runtime cost change.

### Changes

A visible composer alone no longer establishes authentication. The bootstrap requires the signed-in account control and fails closed if selectors are absent or ambiguous. Selectors still require live validation; synthetic tests do not establish that the current ChatGPT UI is compatible.

Browser cleanup now covers navigation and authentication failures. The prior code placed navigation before its cleanup block.

An existing recovery message no longer sets responseStarted unconditionally. Both new delivery and retry require a nonempty assistant message after the recovery message and before any subsequent user turn. This proves response observation only, not successful development progress.

### Executed validation

Node v24.22.1: script syntax check passed; 18 targeted tests passed, including authentication rejection, failure cleanup, handoff correlation, authority/lease rejection and handoff formatting with the explicit Proceed instruction.

The handoff TypeScript was transformed using Node's stripTypeScriptTypes in transform mode for local behavioral tests. This was not a full TypeScript build or whole-server acceptance. The local runtime's available Playwright package was used; repository npm ci was not performed.

A separate real-browser synthetic DOM check was attempted but could not launch because the local Chromium headless-shell executable is absent. No live ChatGPT interaction occurred.

GitHub check-run 124786642875 on predecessor head cf8f064cf87caed2c2b5550265e9a3f282686a96 reports that the job did not start because recent payments failed or the spending limit needs increasing. This was a provider execution block, not an observed test assertion failure. GitHub Actions execution resumed later on 2026-11-01 and exact-head acceptance was restarted.

## Cross-lane profile serialization, 2026-11-01

The canonical CBE-003 CLI now acquires an exclusive filesystem lock adjacent to the external persistent ChatGPT profile before it opens the database pool or constructs the browser driver. This closes a cross-lane race that the lane-specific Foundry work lease alone could not prevent: two different recovery tasks could each hold valid leases while still targeting the same persistent Chromium profile.

The lock is host and process identified, contains no browser authentication material, and is never written inside the repository. A second actuator fails closed with `conversation_actuator_unavailable` while the profile is owned. Existing locks are never stolen automatically, including locks that appear stale or originate on the same host. This deliberately favors cross-lane safety over automatic stale-lock recovery. Release requires the current lock token to match, preventing one process from deleting another process's lock. A residual lock after abnormal process termination therefore requires a separate governed cleanup decision rather than opportunistic takeover.

Deterministic acceptance now covers:

- second concurrent actuator denied for the same profile;
- existing same-host lock remains fail-closed rather than being reclaimed;
- different-host lock remains fail-closed;
- dedicated CBE-AUTH workflow builds the server and runs the profile-lock tests alongside authentication/cleanup tests.

This serialization affects only the shared browser profile actuator. It does not claim or pause unrelated CoMind development lanes, and it does not broaden AED authority.

## Exact-head CI repair

When GitHub Actions execution resumed, the first live exact-head matrix exposed one real repository-policy failure: `server/test/cbe-chatgpt-auth-bootstrap.test.mjs` still used the prohibited `example.com` marker for its wrong-origin fixture. The test was corrected to use the real `openai.com` host. No Placeholder policy was not weakened.

### Remaining acceptance and continuation

Keep Issue #489 open until live return acceptance is complete. Complete exact-head acceptance, then attach a reachable external authenticated runtime and perform the governed NOTEBOOK-001 return. The exact registered target is held in the private lane registry. Preserve the current branch and PR. Do not mark RETURNED from synthetic tests, a successful bootstrap alone, or message presence alone. Verify material development progress separately after response observation.
