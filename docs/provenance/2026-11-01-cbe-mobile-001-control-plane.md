# CBE-MOBILE-001 Provenance

Date: 2026-11-01
Issue: #496
Branch: `cbe-mobile-001-mobile-control-plane`
Production change: false

## Decision

Separate the CoMind CBE control plane from its execution plane. Joseph's routine operator surface must be phone-first and must not require a desktop IDE, cloud terminal, or infrastructure dashboard for ordinary control actions.

## Implemented slice

- Added `/cbe-control` to the existing Operator Console.
- Added an iPhone-first control layout with large bounded actions and safe-area support.
- Added explicit lane selection for actions that require a target. The UI never guesses the target lane.
- Added `/api/cbe-control` GET/POST contract.
- Added a strict allowlist for `start_browser`, `stop_browser`, `retry_recovery`, `open_auth`, and `wake_conversation`.
- Added a server-side execution adapter binding using `COMIND_CBE_CONTROL_ENDPOINT` and optional `COMIND_CBE_CONTROL_TOKEN`.
- The token is never returned to the client and is not included in status output.
- The endpoint status exposes origin only, never path/query material.
- Human-action URLs are suppressed unless their hostname is explicitly listed in `COMIND_CBE_HUMAN_AUTH_HOSTS`.
- The adapter accepts HTTPS endpoints only, except localhost Development/Test bindings.
- Every forwarded request declares `environment=development-test` and `production_change=false`.
- When no execution endpoint is configured, controls fail closed and visibly report unavailable. No success is simulated.
- Added model tests for fail-closed behavior, action bounds, explicit targeting, and endpoint redaction.
- Added a Control Plane navigation and quick-action entry for the mobile surface.

## Authority

This slice does not grant Production authority, bypass authentication, create credentials, expose terminal access, or weaken existing CBE lease/authority contracts. The execution plane remains responsible for canonical authority, CLEAR, lease/fencing, idempotency, semantic verification, and recovery-release requirements.

## Follow-on dependency

Bind a governed execution-plane service to the new server-side adapter. The adapter contract is intentionally provider-neutral so Codespaces, a self-hosted CBE worker, or another approved runtime can be attached without changing the mobile UI.
