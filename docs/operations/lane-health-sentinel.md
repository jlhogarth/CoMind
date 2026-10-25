# CoMind Lane Health Sentinel

Status: tested read-only lane-health system for Issue #115. The pull-request observer has been demonstrated against live GitHub workflow data. The trusted background watcher is implemented and exact-head verified but is not called operational until it is merged to `main` and demonstrated from trusted default-branch code on a controlled pull request.

No PR commenting, automatic rerun, merge authority, branch mutation, deployment, paid-resource action, or production mutation is enabled by this implementation.

## Purpose

The Lane Health Sentinel makes GitHub development work observable at the timescale of the workflows themselves. It distinguishes absence, waiting, queue delay, active progress, deterministic failure, orchestration failure, cancellation, timeout, stale-head evidence, and successful completion without collapsing those states into a generic red or green label.

Governing doctrine:

Detect -> Diagnose -> Remediate -> Verify -> Harden.

Monitoring does not itself confer remediation authority.

## Exact-head invariant

Every lane-health decision is bound to one expected pull-request head SHA.

Evidence from another SHA is `stale_head_evidence` and cannot establish current lane health, even when that older evidence is successful.

A lane summary fails closed if any workflow classification was produced for a different expected head.

## Observation states

The classifier distinguishes:

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

## GitHub run and job reconciliation

GitHub can briefly report a workflow run as `queued` while one or more jobs under that run are already `in_progress`.

The sentinel therefore records both:

- `reportedRunStatus`: the status returned by the workflow-run endpoint
- `effectiveRunStatus`: the status derived from the run plus current job evidence

Rules:

- a terminal run status or conclusion remains authoritative
- a nonterminal run with any active job is effectively `in_progress`
- a nonterminal run with queued jobs and no active job remains `queued`

This behavior was discovered during live PR #180 observation and then covered by dedicated regression tests before the observer was accepted.

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

## Suppression signals

The read-only GitHub ingestion layer surfaces bounded suppression evidence, including:

- `action_required_zero_jobs` when GitHub requires action but created no executable jobs
- `bot_authored_required_run_absent` when a bot-authored exact head has exceeded the required-run appearance threshold

A suppression signal is evidence for diagnosis. It does not authorize rerun or remediation.

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

## Pull-request observer

`.github/workflows/lane-health-sentinel-observe.yml` is the PR-local evidence collector.

It runs with only:

- `actions: read`
- `contents: read`
- `pull-requests: read`

It collects the exact PR head, governed workflow runs, jobs and steps, recent successful runtime samples, lane state, suppression signals, and escalation payloads. It writes an operator summary and uploads `lane-health.json` as a 14-day GitHub Actions artifact.

It cannot comment, rerun, merge, modify a branch, mutate a database, or deploy anything.

### Live observer evidence

The first live observer proof ran successfully on PR #180:

- run: https://github.com/jlhogarth/CoMind/actions/runs/40237289101
- artifact: https://github.com/jlhogarth/CoMind/actions/runs/40237289101/artifacts/12615766551
- observed state: `in_progress`
- severity: `info`
- attention required: `false`
- suppression signals: `0`
- authority: `observe_only`

That proof exposed the lagging top-level run-status behavior described above.

The corrected live observer proof then preserved both reported and effective status:

- run: https://github.com/jlhogarth/CoMind/actions/runs/40237413585
- artifact: https://github.com/jlhogarth/CoMind/actions/runs/40237413585/artifacts/12615612242
- active job evidence correctly converted lagging `queued` run reports to effective `in_progress`
- genuinely queued jobs remained queued
- no suppression signals were invented

## Trusted background watcher

`.github/workflows/lane-health-sentinel-background.yml` is the unattended observer candidate.

Security boundary:

- it does not run as a `pull_request` workflow
- it explicitly checks out `main`
- checkout credentials are not persisted
- permissions are limited to `actions: read`, `contents: read`, and `pull-requests: read`
- pull-request code therefore cannot redefine the code the trusted watcher executes

Triggers:

- governed `workflow_run` lifecycle events: requested, in progress, completed
- a five-minute scheduled fallback for cases where no usable workflow lifecycle event is emitted
- manual dispatch for controlled verification or a targeted PR

Behavior:

- resolves the associated open pull request from the workflow event
- falls back to commit-associated PR lookup when GitHub omits direct PR association
- scheduled fallback scans open PRs against `main`
- one GitHub Actions concurrency group is used per observed head so newer lifecycle events cancel stale watchers
- if a lane remains active, the watcher rechecks every 60 seconds for up to eight observations
- each observation uses the same exact-head classifier and evidence contract as the PR-local observer
- the workflow uploads a machine-readable background evidence bundle

The workflow remains observe-only. It has no comment, rerun, merge, branch-write, secret-management, database-mutation, or deployment authority.

### Background activation boundary

The background workflow is fully implemented and exact-head tested in PR #180, including six resolver tests and the complete repository workflow matrix.

It is intentionally not called operational before merge because its trust model requires the watcher code itself to exist on `main`.

Operational acceptance therefore requires a post-merge controlled pull request that demonstrates:

1. the watcher executes code checked out from trusted `main`
2. a real `workflow_run` event resolves the controlled PR
3. the watcher produces a machine-readable artifact for the exact PR head
4. a controlled failure or stall is classified without weakening CI
5. no unintended write authority is exercised

## Authority boundaries

### Current implementation: observe only

The sentinel may:

- read GitHub PR, commit, workflow-run, job, and step metadata
- classify exact-head workflow health
- aggregate per-head lane state
- identify focal jobs and steps
- model recent successful runtime
- identify bounded suppression signals
- create deterministic alert fingerprints
- construct explicit escalation payloads
- upload read-only evidence artifacts and step summaries

It may not:

- post a PR or issue comment automatically
- rerun a workflow or job automatically
- merge or close a PR automatically
- modify a branch
- change required checks
- weaken CI
- use application or database secrets
- mutate Supabase or another datastore
- deploy infrastructure
- create paid-resource usage

### Future notification authority

A later accepted slice may place deduplicated notifications through a trusted default-branch workflow. That workflow must have only the minimum permission required for the chosen notification surface and must execute reviewed default-branch code, not mutable PR code.

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

While a development session is actively working a lane, the current executor must inspect and respond at the workflow's own timescale. The background sentinel is a fallback for unattended periods, not a reason for the active executor to wait passively.

No background execution is claimed until the default-branch deployment, event trigger, permissions, and observed post-merge execution evidence have all been verified.

## Recovery and continuity

Every handoff preserves:

- active issue and PR
- branch and exact head SHA
- completed checks
- unresolved warning/critical states
- evidence links
- smallest next action
- authority boundary

CFR-001 conversational continuity and the development handoff rule remain complementary: raw conversation/development events are captured first, while execution state is preserved explicitly at handoff.

## Current implementation files

Policy and workflows:

- `.github/lane-health-sentinel.json`
- `.github/workflows/lane-health-sentinel-observe.yml`
- `.github/workflows/lane-health-sentinel-background.yml`

Runtime modules:

- `scripts/lane_health_sentinel.mjs`
- `scripts/lane_health_summary.mjs`
- `scripts/lane_health_evidence.mjs`
- `scripts/lane_health_github.mjs`
- `scripts/lane_health_background.mjs`

Regression tests:

- `server/test/lane-health-sentinel.test.mjs`
- `server/test/lane-health-summary.test.mjs`
- `server/test/lane-health-evidence.test.mjs`
- `server/test/lane-health-github.test.mjs`
- `server/test/lane-health-github-live-status.test.mjs`
- `server/test/lane-health-background.test.mjs`

## Current acceptance checkpoint

The code candidate before this documentation update passed the full returned exact-head repository matrix on PR #180. Main CI passed all eight jobs and the server suite reported 253 tests, 246 passed, 7 skipped, 0 failed, with zero production dependency vulnerabilities.

The next acceptance step is a full exact-head verification of this documentation-complete candidate, followed by merge to `main` and a controlled post-merge proof of the trusted background watcher.
