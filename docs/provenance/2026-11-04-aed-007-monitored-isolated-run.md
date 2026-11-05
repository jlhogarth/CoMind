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

## Isolated PostgreSQL persistence proof, 2026-11-04

Exact tested head: `93ba9e2312e937721c453ccd54535d7a20533275`. [Run #41940846651](https://github.com/jlhogarth/CoMind/actions/runs/41940846651), job `recovery-proof` success, including `Persist and independently query AED monitoring evidence`. Artifact ID `13376537425`, SHA-256 `a013cd169013318b68fbec1da97843da6a9657aabc235def95a45d6eaa916cea`, expiry 2027-02-03 00:22:31 UTC.

The migration applied twice on isolated PostgreSQL 17. Recovery execution `580f3fad73905c8230b2bfc8` read back 65/65 events and source SHA-256 `20c8cb5e98411d906d0a7bf6019d1e70180959507089f40459ffe6b7718e48f5`. Temporal execution `46a39216f4a41b89382a3fb1` read back 122/122 and SHA-256 `99b51c0ad111e0c98e3df02c68182f94a4b01d0c8cf688f87ff804f8f06b1a23`. Separate reader processes ran after ingestion processes exited. Same-source replay remained idempotent; altered-source replay was rejected without changing readback. The workflow was disabled again after the run.

This is a verified migration and ingest/query path on an ephemeral isolated database. The rows do not survive runner termination. The migration has not been applied to primary Supabase and no durable Supabase AED-007 rows exist yet. Applying it there is a separate C4 Production approval boundary. GitHub artifact retention is temporary, and a human-readable Google Drive report has not yet been written.
