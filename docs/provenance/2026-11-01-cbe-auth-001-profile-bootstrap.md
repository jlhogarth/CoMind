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
6. verifies the ordinary ChatGPT composer is visible;
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
