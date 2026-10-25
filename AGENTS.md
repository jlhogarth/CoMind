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


## GOV-001 provisional tiered governance policy (effective for new development)

These are CoMind engineering classifications, not ISO certification levels or a substitute for existing C0-C4 authority. Assign a tier before implementing any new capability and record the rationale in the issue and pull request:

- **T0 Informational:** read-only, non-sensitive operations without external side effects. Require provenance, input trust boundaries, and appropriate tests.
- **T1 Reversible development:** bounded changes in isolated development with verified rollback. Require explicit scope, reviewable diff, tests, and recovery evidence.
- **T2 Consequential writes:** external changes, financial expenditure, user-impacting mutations, or cross-agent state changes. Require documented authority, scoped least privilege, blast-radius analysis, idempotency, coordination where dependencies exist, audit evidence, and rollback or compensation plan. Existing C-level limits remain in force.
- **T3 Critical or regulated:** production destructive actions, regulated data processing, changes to security controls, broad delegated authority, or irreversible effects. Require explicit human approval and independent verification. Do not assume any runtime path currently supports T3.

Apply the highest applicable tier, not the lowest convenient tier. A high-risk read can be T2 or T3 when confidentiality or legal impact warrants it. If classification is unclear, block the affected action pending review. Tiers describe requirements; they are **not** proof of technical enforcement. A policy document must never be represented as a deployed authorization gate.

Every new PR must record: tier and justification; relevant standards/control IDs; affected resources and agent identities; authorization boundary; inter-agent dependencies; failure and recovery modes; tests and evidence; any exception with human owner and expiry; and expected latency/cost overhead. Changes to existing capabilities should follow these rules whenever they are modified. Never bypass existing stronger controls.

## ISO management system and standards traceability

ISO/IEC 42001 is the proposed AI management-system backbone, supported by ISO/IEC 23894, NIST AI RMF, OWASP agentic security guidance, NIST SP 800-53 and MITRE ATLAS where applicable. Treat standard editions, applicability and license restrictions as explicit registry fields. ISO/IEC 42001 certification applies to a defined organizational management-system scope and requires independent assessment; do not claim certification, conformity, or comprehensive coverage without evidence.

For each applicable control preserve the chain: source/edition -> requirement -> CoMind control -> owner -> implementation -> test -> evidence -> gap/exception. ISO, the proposed Compliance and Standards Officer VE, starts read-only in shadow mode. It may flag gaps and propose remediation, but cannot approve its own exceptions, alter its own permissions, or independently certify CoMind. Human accountability and independent audit are mandatory for applicable decisions.

## Agent naming and continuity

Preserve established CoMind agent names and their canonical identifiers. Do not introduce a naming migration or change role codes, display names, aliases, routing contracts, database keys, or historical provenance as part of GOV-001. Provide a role directory for discoverability instead. Any future renaming requires a separate explicit decision and migration review.

## No silent delegated work

Long-running delegated operations must have a durable owner, status, terminal condition, recovery or escalation path, and an appropriate completion notification. Any temporary monitor must be retired after its terminal condition is verified. Do not claim a monitor exists unless its configuration has been verified.

## Own the outcome and anticipate the blocker

Standing user direction recorded 2026-10-24, issue #170. Apply to every authorized task and carry forward at handoff.

- Before asking Joseph for manual work, inspect available connectors, shell/CLI access, browser operation, reusable implementations and alternate execution environments. Prefer an existing trustworthy path over reinvention. Do not assume tools or credentials are available without checking.
- Identify the next milestone's prerequisites before starting. Consider materially different approaches and recommend the smallest effective path, accounting for cost, reversibility, authority and evidence.
- After two failures of the same mechanism, stop repeating it. Diagnose and switch methods within authority. Switch earlier when evidence shows the approach is unsuitable. Never bypass security or approval boundaries.
- Do safe, reversible, authorized work autonomously. Ask only for missing decisions, required access or authority. Explain the exact blocker and continue independent work when possible.
- Before declaring completion, verify the actual result and record evidence. Distinguish proposed, attempted, implemented, tested, deployed and operational states.
- Maintain one active implementation lane by default. Give each lane an outcome, owner, state, dependency, smallest next action and acceptance evidence. Move to the next lane only after verified completion or a recorded blocker and explicit queue transition.
- Improve this procedure when new problems reveal gaps. Record the failure mechanism, successful workaround, applicability, limits and next-time trigger in existing provenance records. Avoid duplicating canonical facts across registers.
- At handoff preserve current branch/head, uncommitted work, completed checks, unresolved blockers, next action and authority boundary. Never imply a background agent or monitor is running without verified execution.
- Measure usefulness through repeated failure count, avoidable manual handoffs, time to unblock and verified milestone completion. These are proposed review measures until actual measurements exist, not a claim that instrumentation is operating.

Proven workaround: browser-operated VS Code Codespaces terminal completed the operator-console Next.js 16.4.1 update and checks in the 2026-10-24 session. Verify repository, branch, working tree and prompt before entering commands; use an idle terminal; observe exit status and output. Browser session access, cold startup and terminal visibility remain limitations. This is an available method, not a guarantee of universal access.

Moment/public naming remains on hold at Joseph's direction. Internal development and isolated previews can proceed; external brand clearance, domain purchase and Workspace tenant commitments remain separate decisions.

Current prioritized snapshot: docs/roadmap/2026-10-24-open-lanes.md. Refresh source issues and PRs before execution; do not treat the snapshot as current runtime evidence.
