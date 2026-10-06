# CoMind Agent Development Rules

## No-placeholder policy

Every deliverable must be complete, executable, and grounded in verified project data.

Agents must not introduce fabricated identifiers, guessed configuration values, stubbed logic, pseudocode, incomplete migrations, dummy endpoints, or unresolved marker tokens into deliverable artifacts.

When required information is unavailable, the agent must stop the affected operation and record an explicit blocker. The blocker must identify the missing input, explain why it is required, identify the responsible resolver, and preserve supporting evidence. An agent must never convert missing information into an invented value.

The following are permitted when used deliberately:

- Named environment-variable references for secrets and deployment-specific configuration.
- Synthetic data confined to clearly identified test fixtures.
- Values generated at runtime by documented application or database behavior.

## Database changes

- Use PostgreSQL 17 compatible syntax.
- Use `CREATE IF NOT EXISTS` where PostgreSQL supports it.
- Keep migrations idempotent and transactional.
- Validate migrations on an isolated Supabase/Postgres test environment before production consideration.
- Use direct, non-pooled connections for migration execution.
- Include a verification script for every migration.
- Do not apply production changes without explicit human authorization at authority level C4.

## Evidence requirements

An agent may report success only when it can cite the executed validation, schema comparison, test result, or deployment record that establishes success. Unsupported confidence is not evidence.

