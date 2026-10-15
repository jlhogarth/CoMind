# Operator Console development runbook

## Local verification

From `apps/operator-console`:

```bash
npm install
npm test
npm run typecheck
npm run build
npm run dev
```

`npm install` must generate `package-lock.json`; commit that generated lockfile before acceptance. Do not hand-author dependency resolution data.

## Supabase configuration

Copy `.env.example` to `.env.local` and populate only the project URL and publishable key for browser-bound access. Local environment files are ignored by Git.

Do not place secret keys, service-role keys, database passwords, or connection strings in `NEXT_PUBLIC_` variables.

## Current metadata behavior

`GET /api/schema` returns HTTP 503 until the protected metadata provider is implemented and verified. This is intentional fail-closed behavior, not a fallback condition.

## Live database rule

OC-001 does not authorize live schema mutation. A metadata mechanism that requires a database function, grant, view, or other schema change must be independently reviewed and authorized before application to live Supabase.
