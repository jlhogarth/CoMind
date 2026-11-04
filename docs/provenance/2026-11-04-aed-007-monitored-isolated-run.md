# AED-007 monitored isolated execution, 2026-11-04

Issue #540; draft PR #541; exact run head `c0db33fdee434718aa14102e73c1c8a1cb3c5e9f`.
GitHub Actions run: https://github.com/jlhogarth/CoMind/actions/runs/41930781131
Job `recovery-proof` completed successfully. Artifact ID `13372300468`, SHA-256 `22bb7b56950658ad212e64f16b681fd3c691f70afbe03f2f313129b576a862e1`, expiry 2027-02-02 23:04:56 UTC. Four files: recovery and Temporal proof JSONL, plus their transaction JSONL. Retain the artifact outside Actions before expiry if full replay evidence is needed later. This record remains the permanent summary.

## Observed

- Isolated PostgreSQL 17 pgvector and local Temporal development server ran on a standard GitHub-hosted public-repository runner. No Railway deployment, Temporal Cloud, model request or Production change.
- Recovery monitor execution `15ab71ba3f532b14a5836ad1`: 1,425 ms, exit 0; one `RECOVERED` with advanced semantic progress and fencing epoch 1. Stale lease and failed CLEAR each stopped without recovery mutation.
- Temporal monitor execution `c5185caa83321da18ed2e046`: 2,988 ms, exit 0; external signal and durable timer woke separate workflows. Worker stopped and restarted; the same Workflow execution retained its waiting state and accepted a signal after restart. Heartbeats did not change semantic progress.
- JSONL records contain execution ID, UTC timestamp, monotonic elapsed duration, sequence, output byte/hash, whitelisted state/wake/outcome events and process exit. `aed_transaction_report.py` queries cases and aggregates. `chatgpt_work_cost` remains unknown; recorded third-party expense is zero for the isolated fixture, not a provider billing receipt.
- Workflow was manually enabled for the single dispatch and disabled again after the successful job. GitHub's public standard-runner policy is the cost basis; no paid host was activated.

## Acceptance boundary

This test replays a fixture whose expected-progress timestamp is historical. The recovery test directly starts a recovery Workflow after creating a stalled task. It does **not** prove that AED independently monitors a healthy workload, detects a newly introduced interruption, and dispatches recovery without a test harness starting that Workflow. The Temporal worker interruption uses graceful shutdown/replacement rather than `SIGKILL`. The recovered database task stays `in_progress` and the test verifies semantic progress advancement, but does not execute another independent implementation action. No Operator Console retrieval or financial authorization blocking was exercised in this run. No authenticated browser profile or originating ChatGPT conversation return was attempted.

PTQ qualification is limited to functionally validated isolated recovery and Temporal wake/replay conditions. Live end-to-end AED and conversation return remain unqualified. Next test must start a normal progressing workload, interrupt it, allow the AED controller itself to detect and recover it, verify a subsequent action, and query durable state. Conversation return follows issue #489's external authenticated profile prerequisite.
