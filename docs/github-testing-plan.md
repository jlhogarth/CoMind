# CoMind GitHub Testing Plan

## Purpose

GitHub is the execution cockpit for automated CoMind testing. The goal is to make every change recoverable, reproducible, and inspectable from the repository even when an external planning tool is unavailable.

## Current Baseline

- CI installs server dependencies, builds TypeScript, runs Node tests, and audits production dependencies.
- The no-placeholder workflow blocks unresolved development markers.
- The current server test suite only covers the root health endpoint.
- The PM Ledger was deployed to Supabase and is now captured as repository migrations.

## Immediate Test Track

1. Preserve database state in GitHub.
   - Check in PM Ledger schema and hardening migrations.
   - Check in a verification query for tables, views, seed rows, RLS policies, and append-only event triggers.

2. Expand backend route tests.
   - Cover `/health`.
   - Cover `/api/db/health` with mocked database outcomes.
   - Cover validation behavior for ingestion, search, analytics, research, checklist, and admin routes.
   - Keep tests deterministic and independent of production Supabase.

3. Add migration verification to CI.
   - Run SQL verification against an isolated PostgreSQL test database.
   - Fail CI when required schema objects, seed records, RLS policies, or triggers are missing.

4. Add recovery logging.
   - Use GitHub Issues as the working queue.
   - Mirror project state into the PM Ledger through `pm_events`, `pm_links`, and `pm_agent_runs`.
   - Keep Google Drive as document storage and recovery evidence for major artifacts.

## Acceptance Criteria

- A pull request proves `npm run build`, `npm test`, and no-placeholder checks pass.
- PM Ledger migrations exist in `db/migrations`.
- PM Ledger verification SQL returns `verification_status = 'pass'` in the CoMind Supabase project.
- A GitHub issue exists for the next testing increment so agents have a durable place to log progress.

## Next Increment

Create API tests for non-database route behavior first, then add isolated database-backed tests once the test database provisioning path is defined.
