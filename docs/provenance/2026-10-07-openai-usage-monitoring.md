# OpenAI provider usage monitoring

Date: 2026-10-07
Issue: #31
Branch: `issue-31-openai-usage-monitoring`

## Purpose

Add structured provider-usage monitoring before repeating paid OpenAI live smoke verification.

## Changes

- Successful OpenAI Responses calls now persist provider, model, endpoint, response id, status, duration, token usage, sanitized raw usage, and cost-estimation metadata on the assistant message.
- Usage extraction records input, prompt, cached input, cache read, cache write, output, completion, reasoning, and total tokens when the provider supplies them.
- Failed OpenAI provider calls now attach sanitized provider diagnostics to the thrown error so route logging can include status, request id, error code, endpoint, model, and duration without prompt text, response text, or credentials.
- The guarded live smoke script now asserts that persisted assistant metadata includes endpoint, status, duration, usage, and rate-card metadata. It prints a concise usage summary after a successful live call.

## Cost-estimation status

The patch captures token usage and duration immediately. USD estimation remains deliberately unconfigured:

- `estimated_cost_usd`: `null`
- `currency`: `USD`
- `rate_card_version`: `not_configured`

This avoids inventing model pricing. A follow-on can add a reviewed committed rate card or an approved pricing source before CoMind reports dollar estimates.

## Verification

- `npm run build`: success
- `npm test`: success, 40 passed, 0 failed, with elevated execution for child-process environment tests
- `npm audit --audit-level=high`: success, 0 vulnerabilities
- `python3 scripts/check_no_placeholders.py .`: success

No paid OpenAI API call was made for this issue. Live Supabase was not mutated.
