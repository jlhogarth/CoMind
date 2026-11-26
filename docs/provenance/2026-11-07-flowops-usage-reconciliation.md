# FlowOps Usage reconciliation

Issue #546 depends on AED-007 issue #540 and draft PR #541. T1 reversible Development/Test. This read-only tool joins one terminal AED transaction JSONL execution to two manually observed, timestamped ChatGPT Settings > Usage readings. It does not access private web endpoints or store account credentials.

## Observation contract

Supply a JSON object with exactly these keys: `execution_id`, `before`, `after`, `concurrent_activity`, and `reset_occurred`. Both flags are booleans. Each reading has `observed_at` (ISO 8601 with timezone), `source` set to `chatgpt_settings_usage_ui`, `five_hour_remaining_pct`, `weekly_remaining_pct`, and `purchased_credits_remaining`. A lowercase 64-character `evidence_sha256` may reference a separately preserved screenshot or observation artifact. Do not put login credentials, private conversation content, or screenshot bytes in this JSON.

Record the before reading before the first AED transaction timestamp. Record the after reading after the terminal timestamp and after the UI settles. The execution ID must match the transaction file. Run:

`python3 server/scripts/aed_usage_reconcile.py TRANSACTION_JSONL OBSERVATIONS_JSON`

The tool outputs percentage-point consumption for five-hour and weekly allowances, and a separate purchased-credit delta. It never converts percentage points into credits or infers reasoning tokens. If there is concurrent activity, a reset, or a balance increase, attribution is withheld. Even an isolated-window candidate is an observed account change, not a provider receipt or proof of which internal step consumed it. UI rounding and reporting delay remain limitations. Preserve the original observations and evidence digest alongside the report.

## Verification and integration boundary

Local verification on 2026-11-07: `python3 -m unittest discover -s server/test -p 'test_aed_usage_reconcile.py' -v` passed five deterministic cases. This branch is based on main and does not alter the actively changing AED-007 PR #541. An actual before/after UI run, upload to the private AED Supabase projection, operator console display, and provider-level reconciliation have not been tested or implemented in this slice. Do not claim them until an isolated run and durable readback establish them. No new service or Production change.
