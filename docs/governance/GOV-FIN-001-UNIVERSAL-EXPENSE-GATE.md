# GOV-FIN-001 Universal Expense Gate

Approved 2026-11-03. Applies to CoMind development and assistant decisions in conversations where this policy is available. It cannot change ChatGPT billing, enforce cross-conversation settings, or see hidden reasoning tokens.

## Preflight
Before any identifiable incremental third-party charge or potentially expensive ChatGPT Work operation, show: provider, task, expected price, credible maximum, uncertainty, alternatives, suspicious pricing/usage, stop condition, and an explicit **Approve [scope and budget] / Decline** choice. Do not proceed until affirmative approval. L4A does not override this gate. An existing subscription does not authorize incremental metered charges. Recurring spending needs separate approval.

## Invisible-cost diagnostics
Zero-cost baseline first. Suggested cumulative diagnostic exposure stages are 0.25%, 0.5%, 1% of a verified available Work-credit balance, only when metering and stopping are technically enforceable. These are NOT automatic authorizations. When balance, cost, or stop mechanism cannot be verified, stop and request an explicitly approved bounded experiment. Think Harder remains off by default; do not run an A/B test until separately authorized.

## Forensics
Use pre-usage Python payload analysis when feasible. Log timestamp, action, model/mode if known, visible input/output token estimates, bytes, tool invocations, retries, time, reported usage before/after, actual third-party charges, approval reference, prediction, observed result and unexplained discrepancy. Never assert visibility into hidden reasoning or a hard Work-credit cap unless the provider supplies it. Flag >2x expected usage, unexplained repeated requests and uncertain price.

## Enforcement
This policy is a durable operating contract, not a billing-system feature. Automations may prepare reports and block CoMind-controlled actions, but cannot prevent all ChatGPT product usage or enforce platform-side Work credit limits. No paid Railway activation is authorized by this change.
