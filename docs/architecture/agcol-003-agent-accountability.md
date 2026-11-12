# AGCOL-003 Agent accountability and service activation boundary

## Where work happens now

AGCOL-002's bounded invocation executes inside the process that calls `runParallelCollaboration`. The verified Test path runs in GitHub Actions with a local read-only MCP child process. Foundry records execution context, authorization, adapter result, and terminal outcome in Supabase Test. The task lease and fencing epoch live there too. AGCOL progress and manifest evidence are immutable Test evidence rows. A GitHub issue or PR tracks development, not the location of an executing specialist. No persistent AGCOL worker host or scheduler is activated.

## One Console, source-native decisions

The `/agent-work` route reads the capability-gated `operator_console_agcol_work` projection. Its first slice covers the latest 20 AGCOL Test manifests. It shows the latest recorded phase, lease status, expiry, blocker code, result reference, and source freshness. Unknown and unavailable are displayed as such. The browser never receives the capability, lease token, raw task input, MCP credential, or privileged database key.

The management plane keeps lane, authority, and PR/CI attention. The approval portal owns approval decisions. The Console links to it until an authenticated approval inbox can route commands to that owner API and independently read back the decision. Brainstorming needs a governed proposal intake with author, context, scope, version, disposition, and a human promotion action before any proposal becomes an agent task. A chat idea alone is not authorization.

| Concern | Canonical source | Console action |
| --- | --- | --- |
| Specialist work | Foundry task, lease, execution, AGCOL evidence | Read-only projection |
| Development progress | RunBook and GitHub issue/PR/CI evidence | Management view and links |
| Approval | Foundry authorization and governed approval portal | Link to owner until command routing is accepted |
| Stops and stalls | Lease expiry, progress timestamps, blocked evidence, AED recovery ledger | Show attention and reconciliation status |
| Brainstorming | Governed proposal intake, to be implemented | No write action in this slice |

## AED handoff and recovery

AED should compare a durable run manifest with each task's latest progress and fenced lease. A missing heartbeat or expired lease is an alert, not proof that execution never happened. AED must check execution context, terminal outcome, adapter receipt, and evidence before reclaiming. A blocked task with a recorded side effect needs reconciliation and human attention. AED cannot infer authority from a Console label or replay an MCP call because the page says stale. Recovery decisions and their evidence belong in AED's durable ledger and should project back into the same Console view.

## Switch-ready service gate

The bounded runner now has manifest persistence, canonical completion reload, fenced renewal, stop signal, and progress observation. To operate continuously, a separately accepted host adapter must provide durable run acquisition, singleton or fenced service ownership, crash restart, health and shutdown behavior, scoped MCP process isolation, credential rotation, budget enforcement, observability, and AED reconciliation. Activation configuration defaults off. A Test-hosted run and failure injection must precede any Production authorization. A green bounded Test invocation is evidence for the runner, not evidence that an always-running service exists.

## Evidence and limitations

- AGCOL-002 exact head `cfdf475da0852e7d0f322b41cad7c0b264db14b8`: workflow run 43133639478 passed contract, isolated lease, and Supabase Test acceptance.
- Independent Test readback on 2026-11-12: one manifest, three tasks, nine progress events, three completed leases, three result references. All were synthetic Test work.
- AGCOL-003 draft PR #560: local typecheck, API deny and response tests, and Next build passed. Additive Test migration applied. Hosted Console readback and AED recovery linkage remain unverified.

## Persistent Test operations

Supabase pg_cron hosts the operations worker. The named job runs every minute, with a 20-second statement limit and a transaction lock to prevent overlap. A successful transaction records its heartbeat. The Console shows a heartbeat as stale after three minutes. Use `db/operations/agcol_test_operations_start.sql` after the migration verifier passes and bind the established Test Auth operator explicitly. To stop scheduling, run `SELECT cron.unschedule('agcol-test-operations');` on CoMind Test. The last heartbeat and audit records remain available. Scheduled cycles run SQL and do not launch the AGCOL specialist graph or invoke models.

AED examines expired and exhausted one-attempt AGCOL Test leases. It records the task and fencing epoch. A matching isolated execution outcome and MCP receipt allow it to repair the lease and append the canonical completion event without repeating the adapter operation. Claims with missing or mismatched proof remain for review. Later evidence can produce a new reconciliation observation for the same epoch.

Agent Work shows the 50 most recent approval proposals and indicates whether a live decision link exists. Existing approval links are one-time credentials and the authority stores only their hashes. Open the original link to decide in the existing approval portal, then refresh Agent Work to see the canonical decision identifier. The intake stores an operator's idea and records a separate decision to accept it for planning or decline it, with a reason. Acceptance does not grant work authority.

The operations RPCs require an authenticated Supabase user in the Test operator registry. Browser roles have no direct table access. The scheduler uses the database host identity. The Test migration verifier exercises authorization, submission replay, disposition, stalled claims, verified completion repair and rollback. Approval decisions and persistent specialist execution retain their existing authority boundaries.
