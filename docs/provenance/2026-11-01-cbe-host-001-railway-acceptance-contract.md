# CBE-HOST-001 Railway Acceptance Hosting Contract Provenance

Date: 2026-11-01
Issue: #502
Production change: false
Hosting activated: false
Paid commitment authorized: false

## Purpose

Define the Development/Test hosting boundary for the CBE execution runtime after CBE-MOBILE-003 made the runtime deployable. This slice records the target topology, current Railway evidence, FinOps gate, and acceptance measurements without provisioning or modifying Railway infrastructure.

## Verified Railway readback

The connected Railway workspace currently exposes:

- Project: `CoMind OC-002 Acceptance`
- Project ID: `0ddd5aa1-d1e5-4425-b6e8-448bc6d5b6ca`
- Environment: `acceptance`
- Environment ID: `b10f2849-a859-48f1-9613-c731c38e2f33`
- Existing service: `operator-console-oc002`
- Existing service ID: `5b3fcf74-5b2f-4bcb-9eb4-dea75dd06dce`
- Existing service source: `jlhogarth/CoMind`, branch `issue-118-operator-console-live-supabase`, root `/apps/operator-console`
- Existing service region: `us-west2`
- Existing service Serverless setting: enabled
- Existing service latest deployment: none
- Existing volumes: none
- Existing buckets: none
- Existing staged work: none

The existing Operator Console service is a control-plane asset. It must not be repurposed as the CBE browser execution service.

## Target acceptance topology

CBE is a distinct execution service named `cbe-execution-acceptance` in the existing `acceptance` environment.

Its repository contract is:

- source repository: `jlhogarth/CoMind`
- source branch: `main`
- root directory: `/server`
- Dockerfile: `Dockerfile.cbe`
- health endpoint: `/health`
- application port: `3000`
- persistent profile mount: `/var/lib/comind/cbe-profile`
- routine Operator Console to CBE transport: Railway private networking
- public CBE execution domain: not required for routine control

Authenticated Chromium state belongs on a private persistent volume mounted at `/var/lib/comind/cbe-profile`. The volume is operational state, not repository content and not a public artifact.

The mobile Operator Console must remain the normal human control surface. The bearer capability stays server-side. A human authentication URL, when bound, is a separate bounded interaction surface and must not expose the execution bearer token.

## Railway cost boundary

Pricing was checked against current Railway primary documentation on 2026-11-01:

- https://railway.com/pricing
- https://docs.railway.com/pricing
- https://docs.railway.com/volumes/reference
- https://docs.railway.com/deployments/serverless

Current documented limits relevant to acceptance are:

- Free: $0 base monthly price, $1 monthly resource credit after trial, up to 1 vCPU and 0.5 GB RAM per service, 0.5 GB volume storage, three services per project, and one volume per project after trial.
- Hobby: $5 minimum monthly usage with $5 usage included and up to 5 GB volume storage.
- Resource rates: memory $10 per GB-month, CPU $20 per vCPU-month, volume storage $0.15 per GB-month, network egress $0.05 per GB.

The existing project topology can fit a separate CBE service and one profile volume within the documented Free resource-count limits. That does not prove the Free memory limit is adequate for Chromium plus the CoMind Node server.

No paid plan or paid resource is authorized by this document. Plan selection remains blocked on empirical acceptance measurements and explicit human authorization for any paid commitment.

## Resource acceptance gate

Before plan selection, a bounded Development/Test run must measure at minimum:

1. server idle memory;
2. browser startup peak memory;
3. browser steady-state memory;
4. peak CPU;
5. container start-to-health latency;
6. browser startup latency;
7. profile persistence across restart;
8. Serverless behavior with browser closed;
9. Serverless wake latency;
10. Serverless behavior while a browser context remains open;
11. bounded test cost.

The Free 0.5 GB RAM ceiling is therefore a test hypothesis, not an architectural assumption. If measured memory exceeds the Free limit, the evidence will support a paid-plan decision rather than silently increasing spend.

## Serverless and AED liveness

Railway Serverless detects inactivity based on outbound traffic. Browser traffic, database activity, or other outbound packets can keep a service awake. A sleeping service can resume when a request arrives, but CBE process residency must never become AED's liveness authority.

CBE should be treated as a request-driven actuator. Durable AED state, recovery ownership, lease/fencing, and conversation recovery semantics remain outside the ephemeral browser process. The persistent browser profile survives process restart through the mounted volume.

Initial acceptance should run with Serverless disabled so resource usage and browser behavior can be measured deterministically. Serverless can then be tested as a cost optimization after the basic runtime proof succeeds.

## Security boundary

Only variable names are documented here. No secret values belong in GitHub evidence.

Required server-side secret names:

- `CBE_CONTROL_TOKEN`
- `DATABASE_URL`

Required non-secret runtime configuration:

- `PORT=3000`
- `CBE_PROFILE_DIR=/var/lib/comind/cbe-profile`
- `CBE_HEADLESS=true`

`CBE_HUMAN_AUTH_URL` remains unbound until a phone-safe human authentication surface exists. Conversation wake remains fail-closed until the exact PM work-item to Foundry recovery task/lease resolver is implemented.

## Mutation record

No Railway mutation was performed in CBE-HOST-001 preparation. No service, volume, bucket, domain, variable, deployment, source binding, payment, or Production resource was created or changed.

## Next dependency

After this contract passes exact-head CI and merges, the next consequential step is a bounded Development/Test Railway staging run. Before that mutation, confirm the account plan and estimated exposure, define a maximum acceptance-test spend, and obtain explicit human authorization for any paid commitment. The staging run should create a separate CBE service and profile volume, bind secrets through Railway's secret store, collect the required measurements, and stop or sleep the runtime after evidence capture.
