# SCOUT-003R2 Foundry Runtime Grant Scope Compatibility Repair

Date: 2026-10-30
Issue: #437
Predecessor repair: SCOUT-003R / PR #436 / merge `67a7ee7f283018076c561fcce0db3b36614fd1f1`
Failed live workflow: `41105893818`
Failed live job: `124235629326`

## Failure boundary

The second post-merge live Test attempt progressed through the founder learning-path gate and Scout lifecycle activation. It created an exact C1 research grant, but the accepted Foundry runtime rejected that grant with `grant_not_valid` before creating any execution context.

Independent live readback proved Scout is active in Test at C0-C1, external resources remain zero, the failed research grant was revoked, active research grants are zero, SCOUT-R001 exists once in todo state, authoritative SCOUT-R001 execution contexts are zero, local Ollama `qwen3:0.6b` was healthy, and Production plus paid-provider authority remain false.

## Root cause

`grantScopeAllows()` is intentionally fail-closed. Runtime capability grant scope may contain only `target_refs`, `max_tasks`, and optional `synthetic_only`. SCOUT-003 placed `delegation_allowed` and `assignment_id` inside the executable grant scope. Unknown runtime scope keys are rejected.

## Repair

The executable grant scope is now exactly `{ target_refs: [TARGET_REF], max_tasks: 1 }`. Existing-grant readback requires exactly those two runtime keys.

This does not weaken governance. The SCOUT-003 manifest still requires `grant.delegation_allowed=false`; assignment identity remains SCOUT-R001 in the manifest, canonical task, target ref, authorization evidence, and grant reason; the runtime one-task ceiling remains `max_tasks=1`; authorization remains separately scoped to the exact task and target; and grant revocation remains mandatory after first-day execution.

The Scout contract test now proves the governing manifest remains non-delegable, the canonical runtime grant literal is present, the existing-grant validator requires exactly the allowlisted keys, and the rejected governance-only scope key sequence is absent.

## Restart

After fresh exact-head acceptance and merge, rerun the existing SCOUT-003 workflow with founder-attestation audit UUID `73932620-d4bc-46ec-ae8e-4ce50abc6bfe`. Scout is already active, so the harness must preserve idempotent lifecycle behavior and continue from the existing SCOUT-R001 task without creating a second authoritative assignment.
