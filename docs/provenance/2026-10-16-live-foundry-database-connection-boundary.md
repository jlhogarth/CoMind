# Live Foundry Database Connection Boundary

Date: 2026-10-16 UTC
Issue: #129

## Decision

`SUPABASE_SESSION_DATABASE_URL` is a dedicated GitHub Actions connection contract for bounded **read-only** live Supabase connectivity and readback from GitHub-hosted runners.

It is not a migration-execution credential path.

## Reason

The CoMind repository governance in `AGENTS.md` requires direct, non-pooled connections for database migration execution.

The live CoMind direct Supabase PostgreSQL endpoint is IPv6-only in the current project configuration, while GitHub-hosted runners do not have a dependable IPv6 route to that endpoint.

The verified Supabase Shared Pooler Session endpoint provides the required IPv4-compatible route, but using that pooled connection to execute DDL would violate the current repository migration policy.

Therefore:

- GitHub-hosted Actions may use the Session pooler for the explicit read-only connectivity/readback workflow;
- the pooled secret must not be repurposed for schema migration execution;
- future live schema migrations must use an approved direct non-pooled path or an authorized Supabase control-plane migration mechanism;
- LF-1 already demonstrated the bounded Supabase administrative migration service as a viable live execution path after the GitHub data-plane route failed closed;
- changing the direct/non-pooled migration rule is a separate governance decision and is not part of LF-1B or LF-2.

## Operational implication

Repairing `SUPABASE_SESSION_DATABASE_URL` can make GitHub-hosted **read-only production database connectivity and verification** dependable.

It does not, by itself, make GitHub-hosted production DDL dependable or authorized.

Any documentation that previously used the broader phrase "GitHub-hosted live database automation" for this LF-1B connection path should be read narrowly as read-only connectivity and verification unless a separately approved migration mechanism is named.

## Security controls

The manual read-only workflow:

- validates the exact reviewed pooler host, port, username pattern, and database without printing the URI;
- requires SSL;
- sets `default_transaction_read_only=on`;
- starts an explicit `BEGIN READ ONLY` transaction;
- uses only bounded metadata and `SELECT` checks;
- is not a migration runner;
- does not create, rotate, or disclose the database password.

## Authority boundary

This clarification does not reduce Joseph's standing exclusive Live Foundry live Supabase schema-mutation authority. It constrains the technical execution path to remain consistent with repository governance.

A future LF-2 live deployment may proceed only after its readiness and human-approval gates are satisfied and through an approved migration execution path. The Session pooler read-only secret is not that path.

Never substitute plausibility, confidence, verbosity, convenience, or user agreement for epistemic justification.

No Hallucinations. No Lies.
