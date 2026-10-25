# CoMind Lane Health Sentinel

Status: repository design and tested classification foundation for Issue #115. No background sentinel, PR commenting, automatic rerun, merge authority, deployment, or external notification is claimed by this document.

## Purpose

The Lane Health Sentinel makes GitHub development work observable at the timescale of the workflows themselves. It must distinguish absence, waiting, queue delay, active progress, deterministic failure, orchestration failure, cancellation, timeout, stale-head evidence, and successful completion without collapsing those states into a generic red or green label.

Governing doctrine:

Detect -> Diagnose -> Remediate -> Verify -> Harden.

Monitoring does not itself confer remediation authority.

## Exact-head invariant

Every lane-health decision is bound to one expected pull-request head SHA.

Evidence from another SHA is `stale_head_evidence` and cannot establish current lane health, even when that older evidence is successful.

A lane summary must fail closed if any workflow classification was produced for a different expected head.

## Observation states

The classifier currently distinguishes:

- `waiting_for_run`: the expected workflow has not appeared, but is still within the configured trigger interval.
- `expected_run_absent`: the workflow has not appeared after the configured trigger interval.
- `queued`: a run exists and remains within the queue threshold.
- `queue_stall`: a run exists but executable work has not started before the queue threshold.
- `in_progress`: the workflow is progressing within its measured runtime envelope.
- `runtime_stall`: an in-progress workflow has no meaningful transition beyond its runtime threshold.
- `healthy_success`: exact-head workflow completion succeeded.
- `terminal_failure`: the workflow completed with failure.
- `action_required_zero_jobs`: GitHub reports `action_required` but created no executable jobs. Issue #115 records PR #113 as the canonical regression case.
- `action_required`: GitHub requires explicit operator action.
- `cancelled`: the workflow was cancelled.
- `timed_out`: the workflow exceeded its execution timeout.
- `stale_head_evidence`: evidence belongs to another commit.
- `unknown`: a state outside the current contract was observed and must not be normalized to healthy.

## Timing policy

Repository policy is stored in `.github/lane-health-sentinel.json`.

The initial defaults are:

- expected workflow run: 75 seconds
- queue stall: 90 seconds
- runtime stall: the greater of 120 seconds or 2 times measured normal runtime
- recent successful runtime sample size: 5
- maximum future transient retriggers: 1

Measured recent successful runtime is preferred. A configured per-workflow fallback is used when a trustworthy recent sample is unavailable.

These are operational thresholds, not service-level guarantees.

## Machine-readable lane summary

Individual workflow classifications are aggregated into one per-PR, per-head lane summary.

Lane states:

- `healthy`: all observed workflows are successful.
- `in_progress`: no warning or critical condition exists, but at least one workflow is still progressing.
- `degraded`: at least one warning exists and no critical condition exists.
- `attention_required`: at least one critical condition exists.

The summary preserves the exact head SHA, all workflow states, direct PR/run evidence URLs, and a deterministic alert fingerprint.

Unchanged warning or critical evidence produces the same fingerprint and must not create a duplicate notification transition. A materially changed attention state produces a new fingerprint.

## Job and step evidence

When GitHub job evidence is available, the sentinel records:

- workflow name
- workflow run ID and URL
- job ID, job name, and direct GitHub job URL
- focal step number and name
- step status and conclusion

The focal step is selected in this order:

1. terminal failure/cancellation/timeout/action-required step
2. active in-progress step
3. pending/queued step
4. most recent completed step

A step-specific URL is not fabricated when GitHub has not supplied a verified stable step URL. The direct job URL plus exact step name and number are retained instead.

## Escalation payload

When operator attention is required, the bounded payload is:

```json
{
  "schemaVersion": 1,
  "kind": "lane_health_escalation",
  "prNumber": 180,
  "prUrl": "https://github.com/OWNER/REPOSITORY/pull/NUMBER",
  "exactHeadSha": "FULL_SHA",
  "laneState": "attention_required",
  "laneSeverity": "critical",
  "workflow": "CI",
  "workflowState": "terminal_failure",
  "workflowReason": "Evidence-backed reason",
  "runId": 123,
  "runUrl": "https://github.com/OWNER/REPOSITORY/actions/runs/123",
  "jobId": 456,
  "jobName": "build",
  "jobUrl": "https://github.com/OWNER/REPOSITORY/actions/runs/123/job/456",
  "stepNumber": 6,
  "stepName": "Run server tests",
  "stepStatus": "completed",
  "stepConclusion": "failure",
  "authorityBoundary": "observe_only",
  "requiresHuman": true,
  "recommendedAction": "Evidence-backed next action",
  "alertFingerprint": "SHA256"
}
```

Missing GitHub evidence remains null. It must not be invented.

## Authority boundaries

### Current repository stage: observe only

The code in this PR may:

- classify supplied GitHub workflow metadata
- aggregate per-head lane state
- identify the focal job and step from supplied metadata
- create deterministic alert fingerprints
- construct an explicit escalation payload

It may not:

- post a PR or issue comment
- rerun a workflow or job
- merge or close a PR
- modify a branch
- change required checks
- weaken CI
- use repository secrets
- mutate Supabase or another datastore
- deploy infrastructure
- create paid-resource usage
- claim that a background sentinel is operating

### Future notification authority

A later accepted slice may place deduplicated notifications through a trusted default-branch workflow. That workflow should have only the minimum permission required for the notification surface and must consume reviewed code from the trusted branch, not execute mutable PR code with write credentials.

Notification authority is not remediation authority.

### Future bounded transient rerun authority

A later accepted slice may propose one transient rerun only when evidence identifies a runner/environment failure class that is safe to retry. Any such capability must be isolated in a separately permissioned job and must enforce the configured maximum of one automatic retrigger.

The following do not qualify for automatic rerun:

- deterministic test or build failure
- security or dependency-audit failure
- stale-head evidence
- `action_required` requiring operator approval
- recurring failure after one bounded retry
- ambiguous failure classification
- a failure whose remediation would change code, data, schema, security, credentials, production state, cost authority, or external commitments

### Human escalation boundary

Joseph is required when the next action needs a product decision, missing access, explicit authority, production action, schema/security/grant change, credential or secret action, paid-resource authority, destructive action, or a choice among materially different consequential remedies.

A deterministic technical defect that is safe, reversible, already authorized, and inside the active development lane may be repaired without additional approval, but its failure, repair, and verification remain visible in the lane evidence.

## Active-session behavior

While a development session is actively working a lane, the current executor must inspect and respond at the workflow's own timescale. A future background sentinel is a fallback for unattended periods, not a reason for the active executor to wait passively.

No background execution should be claimed until a deployed workflow, schedule/event trigger, permissions, and observed execution evidence have all been verified.

## Recovery and continuity

Every handoff must preserve:

- active issue and PR
- branch and exact head SHA
- completed checks
- unresolved warning/critical states
- evidence links
- smallest next action
- authority boundary

CFR-001 conversational continuity and the development handoff rule remain complementary: raw conversation/development events are captured first, while execution state is preserved explicitly at handoff.

## Current implementation files

- `.github/lane-health-sentinel.json`
- `scripts/lane_health_sentinel.mjs`
- `scripts/lane_health_summary.mjs`
- `scripts/lane_health_evidence.mjs`
- `server/test/lane-health-sentinel.test.mjs`
- `server/test/lane-health-summary.test.mjs`
- `server/test/lane-health-evidence.test.mjs`

This document defines the current contract. It does not claim operational monitoring until a later event-ingestion workflow has been implemented and demonstrated on a controlled test PR.
