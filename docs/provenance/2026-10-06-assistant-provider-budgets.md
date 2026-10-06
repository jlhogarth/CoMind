# Assistant provider budget controls

Date: 2026-10-06
Issue: https://github.com/jlhogarth/CoMind/issues/19
Branch: `feature/assistant-provider-budgets`
Baseline main: `00392352fe4d9cdf5e7562373dff1961c0a13163`

## Objective

Bound assistant-provider requests before broader provider enablement.

## Implemented controls

- `ASSISTANT_MAX_HISTORY_MESSAGES` limits how many persisted messages are sent to the assistant provider.
- The bounded history keeps the newest retained messages in chronological order.
- The selected conversation remains the only source of provider history.
- No summaries or synthetic assistant messages are generated when earlier history falls outside the retained window.
- `OPENAI_TIMEOUT_MS` configures the OpenAI SDK request timeout.
- `OPENAI_MAX_RETRIES` configures the OpenAI SDK retry count.
- OpenAI provider requests continue to set `store: false`.

## Defaults and validation

| Setting | Default | Validation |
| --- | ---: | --- |
| `ASSISTANT_MAX_HISTORY_MESSAGES` | `40` | Integer from `1` through `200` |
| `OPENAI_TIMEOUT_MS` | `30000` | Integer from `1000` through `120000` |
| `OPENAI_MAX_RETRIES` | `2` | Integer from `0` through `5` |

## Test intent

The route-level tests prove the assistant route trims history before provider invocation. The OpenAI adapter tests prove timeout and retry values are converted into SDK client options. The isolated PostgreSQL recovery test proves a configured history window retains only the newest chronological rows while the complete conversation remains durable in PostgreSQL.

## Boundary

No live OpenAI request is required for this issue. No live Supabase mutation, Neon dependency, production deployment, or committed credential is introduced.
