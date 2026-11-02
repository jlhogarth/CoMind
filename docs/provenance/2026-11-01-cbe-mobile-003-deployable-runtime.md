# CBE-MOBILE-003 Deployable Runtime Provenance

Date: 2026-11-01
Issue: #500
Production change: false

## Purpose

Prepare the accepted CBE mobile control execution plane for provider-neutral Development/Test hosting without activating hosting, creating paid infrastructure, or exposing browser credentials.

## Accepted design

- Playwright is an exact runtime dependency at `1.64.1`.
- The runtime image is pinned to `mcr.microsoft.com/playwright:v1.64.1-noble`.
- The application executes as the non-root `pwuser` account.
- Persistent authenticated browser state is external to the repository at `/var/lib/comind/cbe-profile`.
- The existing Fastify `/health` endpoint is the container health signal.
- `CBE_CONTROL_TOKEN` remains a server-side capability and is never committed.
- `CBE_HUMAN_AUTH_URL` is the bounded phone-safe handoff for authentication requiring human participation.
- Routine operation remains the CoMind mobile control plane. Codespaces, noVNC, Steel, and provider dashboards are not required operator surfaces.
- CI builds and smoke-tests the image but does not publish or deploy it.

## Authority boundary

This artifact authorizes repository preparation and deterministic Development/Test verification only. It does not authorize Production activation, a paid hosting commitment, public exposure, domain changes, secret creation, or secret disclosure.

## Next dependency

After exact-head CI acceptance and merge, select and stage an explicitly bounded Development/Test execution host with persistent storage, bind the mobile control endpoint and bearer capability through the host secret store, then complete the exact PM work-item to Foundry recovery task/lease resolver before a live conversation-wake acceptance test.
