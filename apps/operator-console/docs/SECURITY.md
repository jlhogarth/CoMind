# Operator Console security boundary

## OC-002 classification

T2 Consequential writes. Joseph explicitly authorized schema mutation and administrative writes for Operator Console live activation. This authority does not delegate casual destructive actions, raw SQL administration, browser-held privileged credentials, or silent expansion into additional schemas.

## Browser credential boundary

Browser code may receive only the live Supabase project URL and modern publishable key. The browser client is fixed to the `public` schema and remains subject to PostgreSQL grants and Row Level Security.

Secret keys, legacy service-role keys, database connection strings, passwords, administrative bearer tokens, and privileged metadata credentials must not use `NEXT_PUBLIC_` variables and must never be bundled into browser code.

## Server credential boundary

Privileged Console operations use a separate server client configured with `SUPABASE_URL` and a modern `SUPABASE_SECRET_KEY`. The server configuration rejects legacy key formats for this path. Administrative execution additionally remains disabled unless `OPERATOR_CONSOLE_ADMIN_ENABLED=true` and a sufficiently long `OPERATOR_CONSOLE_ADMIN_TOKEN` is configured.

The administrative bearer token is not exposed by any current browser UI. OC-002 does not treat a shared bearer token as the final human authentication architecture. A future authenticated operator session must preserve or improve this boundary before interactive browser administration is enabled.

## Metadata boundary

Live metadata discovery uses `public.operator_console_schema_metadata()`. The function is `SECURITY INVOKER`, has an explicit search path, is executable only by `service_role`, and returns only relations enabled for `browser_read` in `public.operator_console_relation_registry`.

The browser calls `/api/schema`; the server invokes the protected RPC and validates the returned contract before returning it. There is no fallback to privileged browser credentials.

## Mutation boundary

Administrative mutation is mediated by `public.operator_console_apply_mutation(jsonb)`. The function is `SECURITY INVOKER`, executable only by `service_role`, and validates all of the following before mutation:

- schema is exactly `public` for OC-002;
- relation name is a valid PostgreSQL identifier;
- relation is enabled in the Console registry;
- requested operation is explicitly delegated;
- update and delete keys contain exactly the primary-key columns;
- update cannot change primary-key columns;
- writable columns exist and are not generated or identity columns;
- delete requires both `admin_delete` and `destructive_allowed`.

Ordinary live relations `users`, `posts`, and `comments` permit governed insert/update but not delete. Delete is delegated only to `operator_console_verification_records`, whose rows are constrained as test data.

The current Console does not expose a raw SQL facility.

## Audit and replay boundary

Each successful or failed mutation attempt writes a durable record to `public.operator_console_mutation_audit`. Successful request IDs are unique for mutation operations, and an advisory transaction lock serializes repeated use of the same request ID. Replaying a successful request returns the prior result rather than applying the mutation again.

The audit table is append-only through both grants and a mutation-rejection trigger. Ordinary browser roles receive no access to the registry, verification, or audit tables.

## Live schema observations

Before the OC-002 migration, live inspection established:

- `public` is browser-usable and its three current relational test tables have RLS SELECT policies.
- `comind` has many tables without RLS, but `anon` and `authenticated` currently lack schema USAGE and table grants there.
- `comind_pm` is RLS-enabled and service-role only.
- `comind_pm` views are not currently `security_invoker`; ordinary roles also lack access. Do not broaden those grants without a separate hardening review.
- Existing mutable-search-path warnings in `comind` predate OC-002 and are not silently changed by this milestone.

## Failure behavior

Missing configuration fails closed. RLS or permission denial must remain visible rather than triggering privilege escalation. Unknown or unregistered relations are denied. Unsafe identifiers are rejected. A failed audited mutation returns an explicit failure result. If the administrative database path is not provisioned, the server route reports unavailable rather than falling back to the browser client.
