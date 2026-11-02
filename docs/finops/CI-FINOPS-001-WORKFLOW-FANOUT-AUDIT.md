# CI-FINOPS-001 Workflow Fan-out Audit

## Purpose

Record the evidence behind the first bounded GitHub Actions FinOps repair. This document does not weaken test, security, governance, or exact-head acceptance requirements.

## Verified billing boundary

- GitHub account plan: Pro.
- November 2026 Actions Linux usage reached exactly 3,000 included minutes.
- Billing usage reported $18.00 gross Actions Linux compute, $18.00 discount, and $0.00 net before overage.
- After the included allowance was exhausted, representative workflow jobs failed before runner assignment with runner_id=0, no runner name, zero executed steps, and no job log blob.
- Founder authorization exists for a maximum $1 GitHub Actions overage budget. External GitHub budget activation remains a separate UI state and must be verified before paid Actions are resumed.

## Workflow inventory

GitHub's workflow registry reported 126 active workflow registrations.

Repository readback on `main` found:

- 108 live workflow files.
- 18 registered workflow paths no longer present on `main`.
- 101 live workflows triggered by `pull_request`.
- 33 live workflows triggered by `push`.
- 13 pull-request workflows with no path filter.
- 15 push workflows with no path filter.
- 11 workflows broad on both pull request and push.
- Only 24 of 108 live workflows had top-level concurrency controls.
- Only 17 of 101 pull-request workflows had top-level concurrency controls.

## Immediate high-value defect

Rapid commits to the same pull request can leave superseded workflow runs consuming runner capacity when a workflow lacks a concurrency group with `cancel-in-progress: true`.

This failure mode was observed operationally during CBE development, where obsolete workflow runs from earlier heads remained queued or running after a newer exact head existed.

The safe invariant is:

> Current-head evidence must remain intact. Only superseded runs for the same workflow and pull request or ref may be cancelled automatically.

## First bounded repair

The following 11 broad pull-request workflows lacked top-level concurrency controls and were updated on branch `ci-finops-001-budget-aware-ci`:

1. `.github/workflows/blank.yml`
2. `.github/workflows/ci.yml`
3. `.github/workflows/foundry-runtime-orchestration.yml`
4. `.github/workflows/foundry-work-lease-kernel.yml`
5. `.github/workflows/governed-provider-execution.yml`
6. `.github/workflows/lane-health-sentinel-observe.yml`
7. `.github/workflows/live-foundry-lf3-readiness.yml`
8. `.github/workflows/live-foundry-lf2-readiness.yml`
9. `.github/workflows/live-foundry-stage1-readiness.yml`
10. `.github/workflows/no-placeholders.yml`
11. `.github/workflows/runtime-budget-authority-adapter.yml`

Each now uses:

```yaml
concurrency:
  group: ${{ github.workflow }}-${{ github.event.pull_request.number || github.ref }}
  cancel-in-progress: true
```

This does not skip the newest candidate. It only allows GitHub to cancel a superseded run in the same workflow group.

## Independent verification

All 11 committed branch workflow files were fetched back from GitHub and parsed successfully. Each contained:

- a top-level concurrency map;
- a group keyed by workflow plus pull-request number or ref; and
- `cancel-in-progress: true`.

No path filters were added in this first repair because subsystem dependency mapping is not yet complete enough to prove safe skipping for every broad workflow.

## Path-scoping analysis

The 13 broad pull-request workflows divide into two classes:

### Preserve broad coverage unless stronger evidence exists

Repository-wide integrity, governance, placeholder, and lane-health checks can legitimately depend on changes anywhere in the repository. Narrowing these based only on apparent file names would create false negatives.

### Candidate for later dependency-aware path scoping

Foundry, runtime-budget, and governed-provider workflows are subsystem-oriented, but their shell scripts and database dependencies must be mapped before any path-based skip is accepted.

Therefore concurrency cancellation is the first repair. Path scoping follows only after dependency evidence is complete.

## Cost observation

A prior clean 21-check exact-head matrix used approximately 17 aggregate wall-clock job-minutes and about 28 per-job rounded billable minutes. At the observed Linux rate of $0.006 per minute, that is approximately $0.17 for one clean matrix.

The dominant FinOps risk is therefore not one clean acceptance matrix. It is repeated whole-repository fan-out across intermediate commits and superseded heads.

## Next actions

1. Activate and verify the founder-authorized $1 GitHub Actions overage budget with a hard stop.
2. Rerun PR #509 exact-head checks and merge only if the canonical gate passes.
3. Open the CI-FINOPS-001 PR only after Actions capacity is available, to avoid intentionally creating another dead pull-request matrix.
4. Run the CI-FINOPS branch through exact-head CI.
5. Continue dependency mapping for subsystem-specific path filters.
6. Audit the 18 stale workflow registrations and determine whether GitHub-side disable/delete cleanup is required.
7. Evaluate a governed self-hosted runner for sustained high-volume CoMind development without weakening provenance or acceptance gates.

Production change: false.
