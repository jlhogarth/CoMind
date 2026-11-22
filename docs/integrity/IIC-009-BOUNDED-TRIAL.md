# IIC-009 | Finite continuous source trial, no recurring spend

## Decision and financial governance
Founder requested a short continuous Test observation followed by automatic shutdown and an ad-hoc state. No indefinite worker or cron is authorized. Verified GitHub repo public. GitHub documents standard GitHub-hosted Actions runners as free on public repositories. This lane uses standard ubuntu-24.04, not larger runners, with **zero requested incremental paid provider usage**. Any future paid host needs a separately approved concrete dollar ceiling and stop mechanism.

## Execution
- Pull request change triggers a 60-second finite sampling acceptance window.
- Once merged on default main, an operator can manually select `IIC Bounded Test Trial` > `Run workflow` > choose 60, 90, 180, or 300 seconds. The workflow_dispatch button requires the workflow on the default branch. No recurring `schedule:`, no external worker, no polling after the job exits, and no Production environment.
- Poll 15 seconds, max 300-second window, max 30 observations, max 8-minute GitHub Actions job timeout. Concurrency cancels superseded runs on the same branch. HTTP timeouts 8 seconds, response max 500 KB, endpoints fixed to CoMind main and canonical Implementation Integrity run list.
- GitHub's ephemeral built-in workflow token is read-only for repo contents and Actions runs; never logged. No database, hosted subscription, model invocation, credentials or private RunBook data transmitted.
- Every sample must match exact GitHub main SHA, repository, workflow path, push event, main branch, canonical run URL, terminal success, and be within a 24-hour source TTL. A stale, failed, mismatched, pending, or unavailable source is not successful. Independent per-sample observations and counts are written to a short-retention GitHub artifact **even on trial failure**, preserving negative evidence.
- After the window, GitHub runner exits by design. No dedicated stop action needed. Subsequent use is ad hoc, not always-on.

## Evidence interpretation and follow-on
A trial reporting all observations `current` only establishes bounded public GitHub CI source availability within that window. It does not prove private RunBook connection, event-driven wake, persisted independent scheduler, full IIC-008 graph, the deployed Operator Console, Production readiness or payment entitlements beyond the standard-runner public-repository rule.
The later IIC-009 persistent Test reader remains separate and requires credential/source binding, environment separation, bounded authority, idempotency/lease, alerting and an explicit cost/stop proposal.

## Forward impact, recovery, and acceptance
This workflow consumes GitHub standard runner time, source API quota, and 7-day workflow artifact storage; no new metered service is activated. Revert this commit to remove the manual workflow. If the repository visibility or runner type changes, the financial gate must be re-evaluated before re-running. Verify synthetic tests, observed finite duration, auto-stop, JSON artifact readback, and CI, then merge under Development Contract v1.4.
