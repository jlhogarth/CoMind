# CoMind Operator Console

The Operator Console is a bounded CoMind subsystem for schema-driven inspection and, in later governed milestones, administration of relational Supabase/PostgreSQL data.

## OC-001 boundary

OC-001 establishes the application and schema-model foundation. It does not authorize live database schema changes, destructive operations, privileged browser credentials, arbitrary SQL, or production deployment.

The browser client uses only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Row Level Security and database grants remain authoritative for browser-visible data. Secret keys, service-role keys, database passwords, and privileged metadata access must remain behind a protected server boundary.

The metadata adapter required to discover PostgreSQL catalog structure is intentionally not wired to live Supabase in this first commit because doing so may require a protected database connection or database function. That authority boundary will be resolved without exposing privileged credentials or mutating live Supabase implicitly.

## Development

Requires Node.js 24.

```bash
cd apps/operator-console
npm install
cp .env.example .env.local
npm run test
npm run typecheck
npm run dev
```

The Activity HUD browser acceptance uses Playwright 1.55.0 and Chromium. Install the browser with `npx playwright install chromium`, then run `npm run browser-test`. The test starts the local app and intercepts its Supabase REST request with 23 synthetic rows; it verifies page navigation, filter narrowing, filter reset to page one, and bounded page counts. It does not use Supabase credentials or make a live data request.

Populate `.env.local` with the CoMind Supabase project URL and a publishable key. Do not commit `.env.local`.

## Schema graph

`src/lib/schema/types.ts` defines normalized relations, columns, foreign keys, and PostgreSQL referential actions. `src/lib/schema/registry.ts` constructs deterministic inbound and outbound relationship indexes and fails closed if FK metadata references a relation that was not discovered.

This graph is the contract used by the future dynamic explorer, relational editor, cascade analyzer, and guarded mutation workflows.

## Planned OC-001 completion

1. Add protected metadata adapter without changing live Supabase implicitly.
2. Add dynamic relation navigation.
3. Add bounded read-only table explorer with sorting and pagination.
4. Add row relationship inspection.
5. Verify tests, type checking, build, and repository CI before acceptance.
