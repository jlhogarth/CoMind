# OpenAI Paid-Test Spending Guardrails

## Scope

GitHub Issue #53 adds a read-only policy evaluation layer on top of persisted assistant-provider telemetry. It does not make provider calls, disable workflows, deploy production changes, mutate live Supabase, or integrate an external billing provider.

Issue: https://github.com/jlhogarth/CoMind/issues/53

Branch: `issue-53-openai-spending-guardrails`

Base main commit: `8b045ab910f5d5f59625503253ab5b47c025c070`

## Control model

The guardrail uses a rolling telemetry window and returns a machine-readable `allow`, `warn`, or `pause` decision plus a human-readable reason set.

Development defaults:

- Evaluation window: 24 hours.
- Hard known-cost budget: USD 0.05.
- Warning threshold: 80 percent of the hard budget.
- Failure-rate warning threshold: 10 percent.
- Failure-rate pause threshold: 25 percent.
- Maximum unknown-cost calls: 0.
- Maximum unknown-status calls: 0.

The cost thresholds are intentionally conservative for paid development smoke tests. The graduated warning plus hard-stop pattern is informed by common cloud FinOps controls. The exact 10 percent and 25 percent failure-rate thresholds are CoMind development defaults, not external mandated standards.

## External control references

- OpenAI project budgets are monitoring thresholds rather than request-stopping hard limits: https://help.openai.com/en/articles/9186755-managing-projects-in-the-api-platform
- AWS Budgets supports threshold-triggered budget actions: https://docs.aws.amazon.com/cost-management/latest/userguide/budgets-controls.html
- Google Cloud budgets support graduated alert thresholds: https://docs.cloud.google.com/billing/docs/how-to/budgets
- Google Cloud spend-cap budgets pause usage when the cap is reached: https://docs.cloud.google.com/billing/docs/how-to/budgets-spend-caps

## Fail-closed conditions

Paid tests are recommended to pause when any of these conditions is observed:

- Known spend reaches or exceeds the hard budget.
- Unknown cost count exceeds the configured maximum.
- Any provider call has unknown status.
- Failure rate reaches or exceeds the configured pause threshold.

A warning is returned when known spend reaches the warning percentage or the failure rate reaches the warning threshold without satisfying a pause condition.

Zero observed usage is explicitly safe and returns `allow` with an explanatory reason.

## Implementation surface

- `server/src/routes/spending-guardrail.ts`: rolling PostgreSQL telemetry query, deterministic policy evaluator, API route, and read-only analytics projection.
- `server/src/env.ts`: validated guardrail configuration.
- `server/.env.example`: non-secret example values.
- `server/test/spending-guardrail.test.mjs`: deterministic allow, zero-use, warning, pause, and dashboard tests.
- `server/test/integration/spending-guardrail.test.mjs`: isolated PostgreSQL rolling-window verification.

API endpoint: `GET /api/analytics/spending-guardrail`

Dashboard: `GET /analytics`

## Safety and cost state

No paid OpenAI call is required or permitted for this issue. No live Supabase mutation is required. No credential value is committed. Automatic enforcement before a future provider request is intentionally deferred to a later milestone after this policy surface is independently verified.
