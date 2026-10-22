# Temporal UI Sandbox

Purpose: isolated, disposable evaluation of Temporal's real Web UI for CoMind Activity HUD design reference.

This experiment is **not a CoMind runtime dependency** and must not be connected to CoMind production data.

## Runtime

Pinned image: `temporalio/temporal:1.9.1`

The container starts:

```text
temporal server start-dev --ip 0.0.0.0 --ui-port 8233
```

Temporal's development server automatically provides:

- Temporal Server on port `7233`
- Temporal Web UI on port `8233`
- the `default` namespace
- development persistence managed by the Temporal dev server

## Railway deployment plan

Create a dedicated project named `Temporal UI Sandbox` with an environment named `sandbox`.

Create one service from this repository/branch with:

- branch: `experiment-temporal-render-free`
- root directory: `/experiments/temporal-ui-sandbox`
- Dockerfile: `Dockerfile`
- public domain target port: `8233`
- health check: `/`
- no CoMind secrets or environment variables
- no connection to OC-002

The gRPC port `7233` should remain private unless a separate demo worker requires it. A Railway public TCP proxy is not required merely to inspect the Web UI.

## Evaluation boundary

The first acceptance condition is intentionally small:

1. Temporal dev server starts successfully.
2. Temporal Web UI is reachable over HTTPS.
3. The `default` namespace is visible.
4. The workflow list and execution-detail surfaces can be inspected.

Representative workflow states can be seeded in a later step with a disposable demo worker. Temporal native execution states must not be relabeled as CoMind `Hung`; CoMind `Hung` remains a derived operational condition based on expected progress/heartbeat semantics.

## Teardown

This project is disposable. Remove the Railway project when the UI evaluation is complete unless a later explicit decision retains it.
