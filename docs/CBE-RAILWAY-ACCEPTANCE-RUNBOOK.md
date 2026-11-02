# CBE Railway Development/Test Acceptance Runbook

## Purpose

This runbook defines the bounded evidence procedure for a future CBE Railway Development/Test acceptance deployment. It does not authorize deployment, paid usage, Production activation, or secret disclosure.

The acceptance experiment answers one question first: can the deployable CBE runtime operate reliably within Railway's available resource envelope while preserving persistent authenticated browser state and CoMind governance boundaries?

## Preconditions

Before any live run:

1. CBE-HOST-001 and CBE-HOST-002 are merged on `main`.
2. A separate Railway service is used for CBE execution. Do not repurpose `operator-console-oc002`.
3. The service uses `/server` as the source root and `Dockerfile.cbe` as its Dockerfile.
4. The persistent profile volume is mounted at `/var/lib/comind/cbe-profile`.
5. `CBE_CONTROL_TOKEN` and `DATABASE_URL` exist only in the Railway secret store or equivalent governed secret surface.
6. `PORT=3000`, `CBE_PROFILE_DIR=/var/lib/comind/cbe-profile`, and `CBE_HEADLESS=true` are configured.
7. Conversation wake and recovery remain fail-closed. This acceptance run invokes only browser lifecycle controls.
8. A maximum acceptance-test cost has been explicitly authorized before any action that can incur paid usage.
9. Production change is false.

## Control path

Routine control should use Railway private networking when both control and execution services are hosted in the same project/environment.

The acceptance runner reads:

- `CBE_ACCEPTANCE_ENDPOINT`
- `CBE_CONTROL_TOKEN`
- optional `CBE_ACCEPTANCE_HOLD_MS`
- optional `CBE_ACCEPTANCE_REQUEST_TIMEOUT_MS`

The bearer token must never be copied into chat, GitHub, logs, screenshots, evidence JSON, or RunBook prose.

Public plaintext HTTP is rejected by the runner. Plaintext HTTP is accepted only for localhost and `*.railway.internal` private-network hosts. Public endpoints must use HTTPS.

## Experiment A: deterministic runtime baseline

Start with Railway Serverless disabled so measurements are not distorted by sleep/wake behavior.

Record the container deployment start time and the first successful `/health` time. This yields `container_start_to_health_seconds`.

With the browser stopped, collect Railway service metrics for a bounded baseline window:

- `MEMORY_USAGE_GB`
- `CPU_USAGE`
- `DISK_USAGE_GB`
- `NETWORK_RX_GB`
- `NETWORK_TX_GB`

Record the idle memory value as `server_idle_memory_gb`.

Run:

`npm run cbe:railway-acceptance`

The runner performs exactly:

1. `stop_browser` to establish an idempotent baseline;
2. `start_browser`;
3. bounded hold, default 10 seconds and maximum 60 seconds;
4. `stop_browser` and profile-lock release.

Capture the sanitized JSON output. Do not capture environment variables.

Collect Railway metrics spanning the browser-start and hold interval. Derive:

- `browser_start_peak_memory_gb`
- `browser_steady_memory_gb`
- `peak_cpu_vcpu`
- disk and network usage

The runner's `start_browser.duration_ms` supplies the control-path browser startup duration. Railway telemetry supplies total container resource consumption.

## Experiment B: persistent profile proof

After a successful browser lifecycle run:

1. stop the browser cleanly;
2. restart or redeploy the CBE service without deleting/replacing the profile volume;
3. start the browser again using the same mounted profile;
4. verify the expected governed profile state remains available without exporting cookies or credentials;
5. record `profile_persistence.verified`, restart count, and `same_profile_state_verified`.

No cookie, local-storage value, password, MFA value, bearer token, or other authentication material belongs in evidence.

## Experiment C: Serverless evaluation

Only after the deterministic baseline succeeds may Serverless be enabled for a separate bounded test.

Evaluate:

1. whether the service sleeps with the browser closed;
2. wake latency for the first governed control request;
3. behavior while a browser context remains open;
4. whether browser/database outbound traffic prevents sleep.

CBE process residency is never AED liveness authority. Durable recovery state, leases, fencing, and return semantics remain external to this browser process.

## Free vs Hobby decision gate

Railway Free currently documents a 0.5 GB memory ceiling per service. Treat this as a hypothesis to test, not a target to force.

Recommend `free` only if the measured browser startup peak and steady-state memory remain safely within the Free limit with reasonable operating headroom and the acceptance run remains stable.

Recommend `hobby` only when empirical evidence shows Free is insufficient and the additional cost has been explicitly authorized.

Recommend `undetermined` when evidence is incomplete, unstable, conflicting, or lacks sufficient operating headroom.

Do not tune away governance, profile isolation, browser reliability, or safety controls merely to fit the Free tier.

## Evidence package

The final acceptance evidence conforms to:

`config/cbe_railway_acceptance_evidence_schema.json`

The durable evidence should include:

- sanitized runner output;
- Railway metrics summary;
- deployment-to-health timing;
- persistent-profile result;
- Serverless result if evaluated;
- bounded test cost;
- Free/Hobby/undetermined recommendation and rationale.

It must not include secrets or authenticated browser contents.

## Terminal states

`ACCEPTED_FREE`: bounded CBE runtime is stable within the Free resource envelope.

`ACCEPTED_HOBBY`: bounded CBE runtime is stable but evidence demonstrates a paid resource envelope is required and separately authorized.

`REJECTED_RESOURCE`: runtime is not stable within the tested resource envelope.

`REJECTED_RUNTIME`: browser/runtime behavior fails acceptance independently of resource limits.

`INCOMPLETE`: required evidence is missing or contradictory.

A hosting acceptance result does not prove conversation wake. The exact PM work-item to Foundry recovery task/lease resolver remains a separate dependency before live AED conversation-return acceptance.
