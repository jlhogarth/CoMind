# CIG-002 founder operator access readiness

Issue: [#564](https://github.com/jlhogarth/CoMind/issues/564)  
Environment: Development and Test  
Authority: L4A, subject to the canonical Development Environment Contract and RuleBook  
Production changes: none

## Purpose and ownership

Joseph's connected accounts are the primary operator path during development. They do not create an unrestricted agent identity or override service permissions. CoMind-hosted agents and deployed applications receive separate identities and scopes when their specific runtime integration is ready. CIG-001 remains the integration gateway; this document and the Console's dated observations extend it rather than replacing it.

## Evidence as of November 19, 2026

| Capability | Evidence | What remains unproved |
| --- | --- | --- |
| GitHub account connection | Profile read matched `jlhogarth`; the connected dispatch path produced [GCI run 44423725042](https://github.com/jlhogarth/CoMind/actions/runs/44423725042). | The next action's connection, scope and authorization must be rechecked. |
| Google Drive connected account | Profile read matched Joseph; metadata for the [isolated Test Doc](https://docs.google.com/document/d/1dJEOjmLPm9gdw8xsVF8J_dyPK0HDx5N5RmW0ID42cnE/edit) was read on November 19. Human ownership and two named service-account writer entries were visible in metadata. | This owner-side metadata read is not a fresh write test or a general Google Cloud grant. |
| Gmail, Calendar and Contacts | Each connected profile read matched Joseph on November 19. | Profile reads do not prove every read, write or administrative action. |
| GCI Test runner | [Preflight 44423621524](https://github.com/jlhogarth/CoMind/actions/runs/44423621524), [live 44423725042](https://github.com/jlhogarth/CoMind/actions/runs/44423725042), and [restart 44451778789](https://github.com/jlhogarth/CoMind/actions/runs/44451778789), with independent restricted-Doc readback recorded in [PR #545](https://github.com/jlhogarth/CoMind/pull/545). | These runs do not prove the private Site's own dispatch capability or general IAM administration. |
| Google Cloud administrator via ChatGPT | No direct Google Cloud management connector was available in the current tool inventory; a browser session may support an individually authenticated action. | Direct Cloud IAM/API administration by this agent is NOT VERIFIED. |
| Private Bridge Site dispatch | The Site displayed a missing dispatch credential; an unused broad, nonexpiring GitHub PAT was not installed. [PR #545 checkpoint](https://github.com/jlhogarth/CoMind/pull/545). | Site-originated dispatch is BLOCKED. Existing GitHub connector dispatch remains the Test path. |

The Console displays these as dated evidence. Its initial CIG-001 `ACTIVE` entries are explicitly historical. A displayed proof never acts as a runtime token, permission check, or approval.

## Per-action operating preflight

1. Identify the exact service, account, resource, operation, environment and existing lane authority. Search the capability inventory and current provider connection state. Do not infer write access from a profile read.
2. For a consequential operation, resolve current RuleBook and L4A controls, provider scope and required human/platform confirmation. Check cost and privacy classification. Use the native connected app when it supports the operation; use CIG-001 for coordinated cross-app work.
3. Execute one bounded action. Read back provider state independently where practical. Record the action and result in the owning lane's issue, PR or RunBook, with timestamp, identity label, exact resource and evidence link, without raw credentials or unnecessary content.
4. On `AUTH_REQUIRED`, `SCOPE_REQUIRED`, `EXPIRED`, `HUMAN_CONFIRMATION_REQUIRED` or `BLOCKED`, checkpoint only the dependent action. Continue implementation, tests and other authorized work. Do not invent a credential or substitute a broader identity silently.
5. Before calling a capability operational, prove the actual action from its intended runtime. A successful owner-side browser or connector action does not prove the deployed Site or agent can do the same thing.

## Runtime identity pattern

Use a distinct identity and action allowlist for each deployed agent or application. Prefer provider-managed OAuth or short-lived federation over copied static keys. The GCI Test runner already uses restricted GitHub-to-Google federation and a dedicated service account; keep its Test document/session allowlist and default-off dispatch. A future Site dispatcher should use a CoMind-repository-limited GitHub identity stored server-side, then prove its own read-only preflight before one live invocation. Do not move a PAT through chat, source files, Console telemetry or a mobile terminal. An unused broad token is not a suitable shortcut.

## Recovery and next increments

- Keep GCI-001 #544 / PR #545 as the only Gemini Bridge implementation lane. Finish its private Site credential and Site-originated proof there, without retesting a completed exchange merely to check access.
- Build a Google Cloud management adapter only after confirming the account, supported connector/custom-app entitlement, required OAuth scopes and secure refresh path. A signed-in Cloud Console remains a per-action fallback, not a claim of persistent machine access.
- Replace dated Console observations with live provider checks only when the Console has a verified server-side connection to the source and a protected operator audience. Never put provider credentials or administrative action endpoints in public browser code.
- Review account and agent identities separately. Joseph's connected account is a development operator path; each runtime identity needs its own grant, Test proof, rotation/recovery, and audit trail. Production activation is a separate authority gate.

No new paid service, credential, IAM binding, secret or Production deployment was created in CIG-002.
