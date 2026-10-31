# AED-002B Temporal runtime binding provenance

Date: 2026-10-31
Parent milestone: #447
Issue: #451
PR: #453
Branch: `aed-002b-temporal-runtime-binding`
Production change: false
Paid Temporal service required: false

## Decision

Bind the existing CoMind adaptive liveness policy to official Temporal durable execution primitives while keeping CoMind authoritative for semantic progress, diagnosis, CLEAR, recovery authority, evidence meaning, and escalation.

Temporal is used here as a durable execution substrate, not as a governance source.

## Dependency decision

All required Temporal TypeScript SDK packages are pinned exactly to `1.25.0`:

- `@temporalio/activity`
- `@temporalio/client`
- `@temporalio/common`
- `@temporalio/worker`
- `@temporalio/workflow`

The generated `package-lock.json` was produced by npm under Node 24 in GitHub Actions run `41185141947` and then committed without hand-editing.

The local/Test Temporal service uses the official verified-publisher image `temporalio/temporal:1.9.1`. The image contains the Temporal CLI development service. No Temporal Cloud account or paid Temporal service is used.

## License and IP review

The Temporal TypeScript SDK is MIT licensed. Temporal CLI and the Temporal service are also distributed under permissive MIT licensing. The current adoption does not impose a source-disclosure obligation on CoMind application code.

This record is not legal advice. License notices and dependency attribution remain subject to normal CoMind dependency governance.

## Workflow determinism boundary

The Temporal Workflow receives a serializable CoMind wake plan as input. The Workflow does not read GitHub, databases, filesystems, network resources, or process environment and does not perform direct side effects. It uses Temporal-safe state, Signal handling, condition/timer waiting, and Activity invocation.

Adaptive timing is calculated outside the Workflow by the existing CoMind policy engine. This keeps policy meaning separate from orchestration mechanics and avoids nondeterministic operational reads during Workflow replay.

## Activity heartbeat boundary

The heartbeat Activity emits Temporal Activity heartbeats as worker/activity liveness evidence. The Activity receives `semanticLastProgressAt` as immutable input and returns it unchanged together with a later observation timestamp.

The runtime proof verifies that heartbeat activity advanced observation time without mutating semantic progress. Temporal heartbeat therefore cannot refresh or substitute for CoMind semantic `last_progress_at`.

## Verified runtime proof

GitHub Actions workflow: `AED-002B Temporal Runtime Proof`
Run ID: `41185141947`
Result: success
Artifact: `aed-002b-temporal-runtime`
Artifact ID: `13036847008`
Artifact digest: `sha256:a92a9f011c6b520ca69bb694e49995b5c8c2b5f3f6e60398c604099fe4d2e1ee`
Artifact expiry: 2026-11-07

Verified steps:

1. Node 24 setup succeeded.
2. npm resolved the exact Temporal package set.
3. Every required `@temporalio/*` package installed at exactly `1.25.0`.
4. TypeScript build succeeded.
5. Standard deterministic server tests succeeded, including the corrected AED adaptive liveness ESM tests.
6. `temporalio/temporal:1.9.1` started a local headless development service on port 7233.
7. External Signal wake completed before its adaptive durable fallback timer.
8. With no Signal, durable timer wake completed from the adaptive timing plan.
9. A waiting Workflow survived first-Worker shutdown and resumed under a second Worker on the same task queue from Temporal history.
10. The same Workflow Execution remained waiting across Worker replacement and completed after a post-restart Signal.
11. Activity heartbeat observation advanced while semantic progress timestamp remained unchanged.
12. Evidence artifact upload and Temporal service cleanup succeeded.

Durable runtime result:

`docs/provenance/2026-10-31-aed-002b-temporal-runtime-proof.json`

## Acceptance exclusions

The proof did not use:

- Production activation;
- Temporal Cloud;
- paid provider/model calls;
- private credentials;
- GitHub scheduled workflows as the timely liveness clock;
- Recovery Sweep assistance;
- Dev Supervisor assistance;
- a ChatGPT turn to wake or recover the Test Workflow;
- Joseph action during the runtime proof.

## External research

Accessed 2026-10-31.

1. Temporal TypeScript SDK releases
   URL: https://github.com/temporalio/sdk-typescript/releases
   Material finding: current SDK release target `1.25.0`.

2. Temporal TypeScript SDK repository
   URL: https://github.com/temporalio/sdk-typescript
   Material findings: official Node 24 support; all Temporal SDK packages in one project should use the same SDK version; Worker runtime uses authentic Node.js capabilities.

3. Temporal TypeScript SDK installation documentation
   URL: https://docs.temporal.io/develop/typescript
   Material finding: official client, Worker, Workflow, and Activity package model.

4. Temporal TypeScript API reference
   URL: https://typescript.temporal.io/api/namespaces/workflow
   Material finding: `condition` with a timeout provides a durable condition-versus-timer boundary and returns whether the condition won before timeout.

5. Temporal Activity heartbeat documentation
   URL: https://docs.temporal.io/develop/typescript/activities
   Material finding: Activity heartbeats report Activity execution liveness and support checkpoint details; they do not define CoMind semantic progress.

6. Temporal CLI documentation
   URL: https://docs.temporal.io/cli
   Material finding: CLI includes a local development Temporal service through `temporal server start-dev`.

7. Temporal CLI Docker image
   URL: https://hub.docker.com/r/temporalio/temporal/tags
   Material finding: verified-publisher `1.9.1` image is available for amd64 and arm64.

8. Temporal TypeScript SDK license
   URL: https://github.com/temporalio/sdk-typescript/blob/main/LICENSE
   Material finding: MIT license.

9. Temporal service repository
   URL: https://github.com/temporalio/temporal
   Material findings: local development through Temporal CLI; MIT license.

## Remaining milestone boundary

AED-002B proves durable orchestration mechanics only. Parent milestone #447 remains open.

The next successor slice must bind these mechanics to CoMind semantic stall detection, CLEAR-gated recovery mutation, canonical lease/fencing ownership, verification of resumed semantic progress, bounded unauthorized escalation, and Operator Console/canonical evidence projection. It must then pass the unattended recovery acceptance defined by #447.
