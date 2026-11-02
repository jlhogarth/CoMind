# CBE-MOBILE-003 Deployable Runtime Provenance

Date: 2026-11-01
Issue: #500
Production change: false

## Purpose

Prepare the accepted CBE mobile control execution plane for provider-neutral Development/Test hosting without activating hosting, creating paid infrastructure, or exposing browser credentials.

## Accepted design

- Playwright is an exact runtime dependency at `1.64.1`.
- The browser image is pinned to `mcr.microsoft.com/playwright:v1.64.1-noble`.
- Node is pinned separately to the official `node:24.22.1-bookworm-slim` image and overlaid into the Playwright runtime so the deployed server remains within its `>=24 <25` engine contract.
- The application executes as the non-root `pwuser` account.
- The container preserves the repository/server relationship as `/app/server`, allowing the existing repository-boundary guard to continue rejecting browser profiles stored inside `/app`.
- Persistent authenticated browser state is external to the repository at `/var/lib/comind/cbe-profile`.
- The existing Fastify `/health` endpoint is the container health signal.
- `CBE_CONTROL_TOKEN` remains a server-side capability and is never committed.
- `CBE_HUMAN_AUTH_URL` is the bounded phone-safe handoff for authentication requiring human participation.
- Routine operation remains the CoMind mobile control plane. Codespaces, noVNC, Steel, and provider dashboards are not required operator surfaces.
- CI builds and smoke-tests the image but does not publish or deploy it.

## CI-discovered corrections

The first deployable-runtime smoke test built the image successfully and then failed during server startup. The evidence identified two deployment-contract mismatches rather than application-logic failures:

1. The original container flattened the `server` package into `/app`. The CBE profile guard derives the repository root from the compiled module location, so the flattened layout caused that root to resolve to `/` and correctly rejected every absolute profile path. The container now preserves `/app/server`, restoring the intended repository root at `/app` without weakening the guard.
2. The pinned Playwright 1.64.1 Noble image supplied a Node 26 runtime at the time of CI execution. CoMind requires Node 24. The container now overlays the pinned official Node 24.22.1 toolchain, and CI explicitly verifies `v24.22.1` before the health smoke test.

The legacy CBE-001 Playwright bootstrap guard was also updated to require Playwright from runtime `dependencies` rather than the former development-only location.

## Authority boundary

This artifact authorizes repository preparation and deterministic Development/Test verification only. It does not authorize Production activation, a paid hosting commitment, public exposure, domain changes, secret creation, or secret disclosure.

## Next dependency

After exact-head CI acceptance and merge, select and stage an explicitly bounded Development/Test execution host with persistent storage, bind the mobile control endpoint and bearer capability through the host secret store, then complete the exact PM work-item to Foundry recovery task/lease resolver before a live conversation-wake acceptance test.
