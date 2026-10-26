# CoMind Lane Health Sentinel

Status: observation and deduplicated PR notification are operationally proven from trusted default-branch code. One-shot transient workflow retry is implemented and exact-head tested in PR #204, but is not called operational until merged to `main` and demonstrated through the controlled retry proof defined in Issue #194.

The sentinel is split into independent authority surfaces. Observation is read-only. Notification may write only the governed PR conversation comment. Retry may request only one bounded GitHub Actions rerun for a narrowly proven transient workflow failure. None of these authorities implies merge, branch mutation, check bypass, deployment, database mutation, secret-management, provider execution, paid-resource authority, or production mutation.

## Purpose

The Lane Health Sentinel makes GitHub development work observable at the timescale of the workflows themselves. It distinguishes absence, waiting, queue delay, active progress, deterministic failure, orchestration failure, cancellation, timeout, stale-head evidence, and successful completion without collapsing those states into a generic red or green label.

Governing doctrine:

Detect -> Diagnose -> Remediate -> Verify -> Harden.

Monitoring does not itself confer remediation authority.

## Exact-head invariant

Every lane-health decision is bound to one expected pull-request head SHA.

Evidence from another SHA is `stale_head_evidence` and cannot establish current lane health, even when that older evidence is successful.

A lane summary fails closed if any workflow classification was produced for a different expected head.

Notification and retry add a second exact-head check immediately before their write operation. If the PR head moved after the Background observation, the write is rejected or becomes a no-op.

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
- `action_required_zero_jobs`: GitHub reports `action_required` but created no executable jobs.
- `action_required`: GitHub requires explicit operator action.
- `cancelled`: the workflow was cancelled.
- `timed_out`: the workflow exceeded its execution timeout.
- `terminal_startup_failure`: GitHub failed to start the workflow execution.
- `stale_head_evidence`: evidence belongs to another commit.
- `unknown`: a state outside the current contract was observed and must not be normalized to healthy.

## Timing policy

Repository policy is stored in `.github/lane-health-sentinel.json`.

Initial defaults:

- expected workflow run: 75 seconds
- queue stall: 90 seconds
- runtime stall: the greater of 120 seconds or 2 times measured normal runtime
- recent successful runtime sample size: 5
- maximum automatic transient retriggers: exactly 1

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

This behavior was discovered during live PR #180 observation and then covered by regression tests before acceptance.

## Machine-readable lane summary

Individual workflow classifications are aggregated into one per-PR, per-head lane summary.

Lane states:

- `healthy`: all observed workflows are successful.
- `in_progress`: no warning or critical condition exists, but at least one workflow is still progressing.
- `degraded`: at least one warning exists and no critical condition exists.
- `attention_required`: at least one critical condition exists.

The summary preserves the exact head SHA, workflow states, direct evidence URLs, and a deterministic alert fingerprint.

Unchanged warning or critical evidence produces the same fingerprint. A materially changed attention state produces a new fingerprint.

## Job and step evidence

When GitHub job evidence is available, the sentinel records workflow run, job, and focal-step evidence. Focal-step selection prefers terminal failure, then active work, then pending work, then the most recent completed step.

A step-specific URL is not fabricated when GitHub has not supplied a verified stable step URL. The direct job URL plus exact step name and number are retained instead.

## Suppression signals

The read-only ingestion layer surfaces bounded suppression evidence, including:

- `action_required_zero_jobs` when GitHub requires action but created no executable jobs
- `bot_authored_required_run_absent` when a bot-authored exact head exceeds the required-run appearance threshold

A suppression signal is evidence for diagnosis. It does not authorize retry or remediation.

## Pull-request observer

`.github/workflows/lane-health-sentinel-observe.yml` is the PR-local evidence collector.

Permissions:

- `actions: read`
- `contents: read`
- `pull-requests: read`

It collects exact-head workflow, job, step, runtime, suppression, summary, and escalation evidence and uploads a 14-day artifact.

It cannot comment, rerun, merge, modify a branch, mutate a database, or deploy anything.

### Live observer evidence

First live observer proof on PR #180:

- run: https://github.com/jlhogarth/CoMind/actions/runs/40237289101
- artifact: https://github.com/jlhogarth/CoMind/actions/runs/40237289101/artifacts/12615766551
- state: `in_progress`
- severity: `info`
- authority: `observe_only`

Corrected live-status proof:

- run: https://github.com/jlhogarth/CoMind/actions/runs/40237413585
- artifact: https://github.com/jlhogarth/CoMind/actions/runs/40237413585/artifacts/12615612242

Active job evidence correctly converted lagging top-level `queued` reports to effective `in_progress` while genuinely queued work remained queued.

## Trusted background watcher

`.github/workflows/lane-health-sentinel-background.yml` is the unattended observer.

Trust boundary:

- it does not run as a `pull_request` workflow
- it explicitly checks out `main`
- checkout credentials are not persisted
- permissions are limited to `actions: read`, `contents: read`, and `pull-requests: read`
- pull-request code cannot redefine the code executed by the trusted watcher

Triggers:

- governed `workflow_run` lifecycle events: requested, in progress, completed
- five-minute scheduled fallback for missing usable lifecycle events
- manual dispatch for controlled verification or targeted PR observation

Behavior:

- resolves the associated open PR from the workflow event
- falls back to commit-associated PR lookup when direct association is absent
- scans open PRs on scheduled fallback
- uses one concurrency group per observed head so newer events cancel stale watchers
- rechecks active lanes every 60 seconds for up to eight observations
- uploads a machine-readable Background bundle

The Background watcher remains strictly read-only.

### Background operational proof

Controlled PR #188 established the trusted unattended path after PR #180 merged:

- Background run: https://github.com/jlhogarth/CoMind/actions/runs/40238241135
- controlled failing run: https://github.com/jlhogarth/CoMind/actions/runs/40238161144
- artifact: https://github.com/jlhogarth/CoMind/actions/runs/40238241135/artifacts/12615244588

The watcher executed reviewed `main` code, resolved the controlled PR, classified the exact-head deterministic failure, created direct workflow/job/step evidence, and exercised no write authority.

## Deduplicated PR notification

`.github/workflows/lane-health-sentinel-notify.yml` consumes a successful trusted Background artifact and publishes one governed sentinel comment on the affected PR.

Permissions:

- `actions: read`
- `contents: read`
- `pull-requests: write`

It has no `actions: write`, merge, branch-write, deployment, database, secret, or paid-resource authority.

Notification rules:

- exact PR head must still match the Background snapshot
- first actionable fingerprint creates one sentinel comment
- unchanged fingerprint is a no-op
- changed actionable fingerprint updates the same comment
- `in_progress` never resolves an existing alert
- only a fully `healthy` exact head may update the existing comment to `resolved`

### Notification acceptance history

The first controlled proof exposed a real GitHub integration boundary: an Issues-write token was rejected with HTTP 403 when posting to the PR conversation. Corrective PR #201 moved the permission to `pull-requests: write` and added healthy-only resolution semantics.

Controlled PR #197 then proved the complete contract:

- failure head: `9e7efa525f761c450a10156a3c44398cef7eaff9`
- intentional failure run: https://github.com/jlhogarth/CoMind/actions/runs/40255376841
- exactly one sentinel comment: https://github.com/jlhogarth/CoMind/pull/197#issuecomment-6406384041
- recovery head: `8541204456f94e58d19175c2abc3573be0986e43`
- all 11 returned workflow families succeeded on recovery
- the alert remained unresolved while the recovery lane was nonterminal
- Notify run 40256366385 updated the same comment ID to resolved
- notification artifact: https://github.com/jlhogarth/CoMind/actions/runs/40256366385/artifacts/12622781546

PR #197 was closed without merge after acceptance.

## One-shot transient retry

`.github/workflows/lane-health-sentinel-retry.yml` is the separately permissioned bounded retry executor introduced by Issue #194.

Permissions:

- `actions: write`
- `contents: read`
- `pull-requests: read`

It has no PR-comment write, merge, branch-write, deployment, database, secret-management, provider, or paid-resource authority.

The retry executor consumes the exact trusted Background artifact, then re-fetches current GitHub state immediately before any write.

An automatic retry is eligible only when all of these are true:

1. repository policy explicitly sets `allowTransientRetrigger` for the workflow;
2. the Background state is `timed_out` or `terminal_startup_failure`;
3. the observed workflow belongs to the exact PR head;
4. the workflow event is `pull_request`;
5. the PR remains open and still has the exact same head;
6. the original run ID and workflow name still match;
7. the run remains terminal with conclusion exactly `timed_out` or `startup_failure`;
8. `run_attempt === 1`;
9. `policy.defaults.maxAutoRetriggers === 1`.

GitHub reruns retain the same workflow run ID and increment `run_attempt`. That GitHub-native attempt counter is the durable one-retry guard. Attempt 2 can never satisfy the automatic retry gate again.

The retry workflow also uses a single global concurrency group and permits at most one rerun POST per executor invocation. This prevents one Background completion from fanning out into multiple automatic writes and reduces race risk across concurrent lifecycle events.

The following never qualify automatically:

- ordinary deterministic `failure`
- deterministic test/build failure
- dependency or security audit failure
- cancellation
- `action_required`
- stale-head evidence
- source or workflow identity mismatch
- ambiguous failure classification
- attempt 2 or later
- a failure whose remediation changes code, data, schema, security, credentials, production state, cost authority, provider execution, or external commitments

### Controlled retry proof workflow

`.github/workflows/lane-health-sentinel-retry-proof.yml` is a path-gated acceptance fixture. It runs only when a PR touches `docs/provenance/lane-health-retry-proof/**`.

Supported fixture modes:

- `transient-repeat-timeout`: one-job workflow intentionally exceeds its one-minute timeout on every attempt. Acceptance requires exactly one automatic rerun from attempt 1 to attempt 2 and no attempt 3.
- `deterministic-failure`: exits with code 1. Acceptance requires zero automatic reruns.
- `healthy`: succeeds without a retry.

The proof workflow itself has only `contents: read`.

### Retry activation boundary

The retry implementation and nine deterministic retry tests passed on PR #204 before this documentation update. The pre-documentation exact head `5b317b362e6d3d1ef4b3f95d67f605643c48876c` passed all 12 returned workflow families. Main CI reported 277 tests, 270 passed, 7 skipped, 0 failed, with zero production dependency vulnerabilities.

Retry authority is not called operationally proven until PR #204 is merged to trusted `main` and both controlled post-merge fixtures are completed with machine-readable retry evidence.

## Authority matrix

| Surface | GitHub write authority | Explicitly excluded |
| --- | --- | --- |
| PR observer | none | comments, reruns, merge, branch write, deployment, data mutation |
| Background watcher | none | comments, reruns, merge, branch write, deployment, data mutation |
| Notify | PR conversation comment only | actions rerun, merge, branch write, deployment, data mutation |
| Retry | Actions rerun only | comments, merge, branch write, deployment, data mutation, secrets, provider or paid action |

Notification authority is not retry authority. Retry authority is not general remediation authority.

## Human escalation boundary

Joseph is required when the next action needs a product decision, missing access, explicit authority, production action, schema/security/grant change, credential or secret action, paid-resource authority, destructive action, or a choice among materially different consequential remedies.

A deterministic technical defect that is safe, reversible, already authorized, and inside the active development lane may be repaired without additional approval, but its failure, repair, and verification remain visible in the evidence.

## Active-session behavior

While a development session is actively working a lane, the current executor must inspect and respond at the workflow's own timescale. The Background watcher is a fallback for unattended periods, not a reason for the active executor to wait passively.

No authority is called operational until its default-branch deployment, trigger, permissions, and post-merge execution evidence have been verified.

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
- `.github/workflows/lane-health-sentinel-notify.yml`
- `.github/workflows/lane-health-sentinel-retry.yml`
- `.github/workflows/lane-health-sentinel-retry-proof.yml`

Runtime modules:

- `scripts/lane_health_sentinel.mjs`
- `scripts/lane_health_summary.mjs`
- `scripts/lane_health_evidence.mjs`
- `scripts/lane_health_github.mjs`
- `scripts/lane_health_background.mjs`
- `scripts/lane_health_notify.mjs`
- `scripts/lane_health_retry.mjs`

Regression tests:

- `server/test/lane-health-sentinel.test.mjs`
- `server/test/lane-health-summary.test.mjs`
- `server/test/lane-health-evidence.test.mjs`
- `server/test/lane-health-github.test.mjs`
- `server/test/lane-health-github-live-status.test.mjs`
- `server/test/lane-health-background.test.mjs`
- `server/test/lane-health-notify.test.mjs`
- `server/test/lane-health-retry.test.mjs`

## Current acceptance checkpoint

Observation, unattended Background detection, and deduplicated notification are operationally proven.

The next acceptance step is the full exact-head verification of this documentation-complete PR #204 candidate, followed by merge to `main`, one controlled repeated-timeout proof, one controlled deterministic-failure proof, and evidence write-through to Issues #194 and #115.
