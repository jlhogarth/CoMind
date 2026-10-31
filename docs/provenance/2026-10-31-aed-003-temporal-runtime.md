# AED-003 Temporal runtime provenance

Date: 2026-10-31
Issue: #452
Branch: `aed-003-temporal-runtime-unattended-recovery`
Production change: false
Paid Temporal service required: false

## Predecessor reconciliation
AED-002 Issue #447 produced merged PR #448 for the adaptive liveness policy foundation. Because remaining Temporal runtime work would otherwise require a second PR against the same issue, the runtime scope moved without relaxation to AED-003 Issue #452. AED-002 was closed explicitly as the policy predecessor rather than falsely marked as full runtime acceptance.

CBE-001 PR #450 is also merged and available as a governed browser execution option, but AED-003 does not make browser automation part of the timely liveness clock.

## Dependency decision
Use official Temporal TypeScript SDK packages pinned coherently at version `1.24.0`. A coherent pin avoids mixing newly staggered package releases across worker, workflow, client, and activity boundaries.

Use Temporal CLI `v1.9.1` as the local/Test Temporal service. The GitHub Actions proof downloads the official Linux amd64 release archive and verifies SHA-256 `09a0326a51db84d02735e53542b9ebd8c4758daf47482a9ab0abce15844e60d5` before execution.

No Temporal Cloud account or paid service is authorized or required.

## AED-002 test-path repair
The AED-002 adaptive policy test had been committed as `server/test/aed-adaptive-liveness.test.js` using CommonJS, while the canonical server test command executes only `test/*.test.mjs`. AED-003 converts the adaptive module to repository-compatible ESM and places its test on the canonical `.test.mjs` path so the predecessor policy is now exercised by normal server tests.

## Implementation boundary
- Adaptive policy remains substrate-independent in `server/lib/aed-adaptive-liveness.js`.
- Deterministic Temporal contracts are in `server/src/aed/temporal/contracts.ts`.
- Side effects, heartbeats, evidence writes, CLEAR defense, and verification are Activities in `activities.ts`.
- Durable signal/timer orchestration is in `workflows.ts`.
- The Temporal Worker is in `worker.ts`.
- The unattended multi-worker integration harness is `server/scripts/aed-003-temporal-proof.mjs`.
- Dedicated isolated proof workflow is `.github/workflows/aed-003-temporal-bootstrap.yml`.

## Intended acceptance evidence
The proof is designed to demonstrate:
1. worker interruption and replay/resume across worker identities;
2. durable timer fallback while the worker is absent;
3. external Signal wake before a longer durable fallback;
4. adaptive timing derived from two different measured lifecycle histories;
5. observation time separated from semantic progress time;
6. real Temporal Activity heartbeat without semantic progress advancement;
7. CLEAR-authorized recovery mutation;
8. fully unattended recovery and verification;
9. exact `CLEAR_REQUIRED` escalation with no mutation when unauthorized;
10. ordered evidence and Operator Console-ready projection;
11. no Production, paid service, credentials, private capture, or GitHub schedule dependency.

## External research
Accessed 2026-10-31.

1. Temporal TypeScript SDK samples
   - URL: https://github.com/temporalio/samples-typescript
   - Material finding: official samples demonstrate Workflows, Workers, Signals, timers, Activities, heartbeats, retries, and local `temporal server start-dev` execution.
2. Temporal TypeScript workflow API
   - URL: https://typescript.temporal.io/api/namespaces/workflow
   - Material finding: `proxyActivities`, Signal definitions/handlers, and Workflow conditions are supported deterministic Workflow primitives.
3. Temporal TypeScript worker sample
   - URL: https://github.com/temporalio/samples-typescript/blob/main/hello-world/src/worker.ts
   - Material finding: Workers connect through `NativeConnection`, bind a task queue, register a workflow path and Activities, and then run until shutdown.
4. Temporal Activity timeout and heartbeat documentation
   - URL: https://docs.temporal.io/develop/typescript/activities/timeouts
   - Material finding: Activity heartbeats report worker/activity liveness and checkpoint details; heartbeat timeout is configured in Activity proxy options.
5. Temporal production deployment documentation
   - URL: https://docs.temporal.io/production-deployment
   - Material finding: the CLI development server is a complete single-binary Temporal Service with no external dependencies and is recommended for local development.
6. Temporal CLI setup and development server documentation
   - URL: https://docs.temporal.io/cli/setup-cli
   - Material finding: `temporal server start-dev --headless` starts the local service without the Web UI; default gRPC port is 7233.
7. Temporal CLI `v1.9.1` release
   - URL: https://github.com/temporalio/cli/releases/tag/v1.9.1
   - Material finding: official Linux amd64 release artifact and digest are available for deterministic CI installation.

## Evidence status
Runtime evidence is pending the first dedicated bootstrap run. The workflow deliberately generates npm lock state with npm before installation because the manifest adds pinned Temporal packages and the existing committed lock has not yet been regenerated.
