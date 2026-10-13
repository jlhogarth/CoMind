# ChatGPT Archive Live Supabase Deployment and PIT-A Runbook

## Evidence state

This runbook defines the live deployment sequence for the governed ChatGPT archive subsystem. It does not itself prove that the archive schema is deployed, that a dedicated login exists, or that PIT-A has passed.

Live state must be established by independent readback after every consequential step.

No source record may disappear silently during ingestion.

## Authority gate

Read-only repository inspection, Supabase inspection, documentation review, security analysis, and deployment planning may proceed without a live-change authorization.

The following actions require explicit human authorization in the active deployment lane before they begin:

- applying archive migrations to live Supabase
- creating or changing the dedicated archive database login
- storing or rotating the live archive credential
- loading any private ChatGPT export

Authorization for one phase is not evidence that the phase succeeded.

## Current deployment contract

The governed live ingestion path is `server/src/archive/chatgpt-export-cli.ts`.

The historical `server/src/scripts/import_chatgpt_export.ts` entry point is retired and performs no database writes. It must not be used for PIT-A or later archive imports.

The governed CLI requires `CHATGPT_ARCHIVE_DATABASE_URL`. It never falls back to `DATABASE_URL`.

Before any archive import the CLI performs a write-free database preflight that requires the authenticated login to:

- be a LOGIN role
- be `NOINHERIT`
- not be superuser
- not have CREATEDB
- not have CREATEROLE
- not have REPLICATION
- not have BYPASSRLS
- have exactly one direct role membership
- have membership only in `comind_archive_ingestor`
- receive that membership with `INHERIT FALSE`
- receive that membership with `SET TRUE`
- not receive ADMIN OPTION
- begin with `session_user = current_user`
- explicitly `SET ROLE comind_archive_ingestor`
- preserve the dedicated login as `session_user`
- become `comind_archive_ingestor` as `current_user`
- observe the expected non-destructive archive privilege shape after role assumption

The archive process uses a one-connection application pool so the preflighted session is the session used by the import. If that physical session is lost and replaced, the NOINHERIT login does not automatically receive archive-table privileges, so a replacement connection fails closed instead of silently importing with a broader identity.

## Connection mode

Use a direct PostgreSQL connection for the archive import when the execution host can reach the Supabase direct endpoint. The importer is a persistent, session-state-dependent process and explicitly uses `SET ROLE`.

If the execution host is IPv4-only and the project has no IPv4 add-on, use the Supabase shared pooler in session mode on port 5432. Do not use transaction pooler mode because session state does not persist across transactions there.

For a custom role through the shared session pooler, use the exact username format supplied by the Supabase Connect dialog. Supabase documents custom shared-pooler usernames as `[ROLE].[PROJECT-REF]`.

Require encrypted transport for a nonlocal connection. Use `sslmode=require` at minimum. Prefer server verification with `sslmode=verify-full` and the project root certificate when the execution environment is configured for it.

Current Supabase references:

- https://supabase.com/docs/guides/database/connecting-to-postgres
- https://supabase.com/docs/guides/database/connecting-to-postgres/pooling-and-limits
- https://supabase.com/docs/guides/troubleshooting/database-api-425b6r

## Credential handling

The dedicated login password and full connection string are secrets.

They must not be stored in:

- the public GitHub repository
- Git history
- GitHub issues or pull requests
- Google Drive project documentation
- ChatGPT messages or memory
- CI artifacts
- PIT receipts
- application logs

Inject `CHATGPT_ARCHIVE_DATABASE_URL` into the import process from a protected local secret facility or an approved secret manager.

Do not put the private ChatGPT export in GitHub or in public CI artifacts.

## Pre-authorization read-only baseline

Before requesting live mutation authority, establish from readback:

1. authoritative repository main and exact Issue #110 acceptance head
2. Supabase project identity and PostgreSQL version
3. absence or exact existing state of every `comind.cm_archive_*` table
4. absence or exact existing state of `comind_archive_ingestor`
5. absence or exact existing state of the dedicated archive LOGIN role
6. current `PUBLIC` privileges that a new custom role would receive
7. presence or absence of `pg_net`, `http`, and `pg_cron`
8. current archive-relevant Supabase Security Advisor findings
9. current nonarchive security backlog, recorded as separate and out of scope unless it becomes a direct dependency

Do not infer absence from a failed query. Resolve query errors and repeat the readback.

## Authorized live deployment sequence

### Phase 1: Reconcile immediately before mutation

Repeat the read-only baseline. If main, project state, migrations, role state, or relevant Supabase guidance changed, stop and reconcile before mutation.

### Phase 2: Apply migration 001

Apply `db/migrations/20261012_001_chatgpt_archive_ingestion.sql` as a named Supabase migration.

Immediately read back:

- every expected archive table created by migration 001
- columns and key constraints
- immutability triggers
- import-finalization trigger
- indexes
- zero private archive rows

Do not continue from an ambiguous response.

### Phase 3: Apply migration 002

Apply `db/migrations/20261012_002_chatgpt_archive_quarantine.sql`.

Immediately verify:

- `comind.cm_archive_quarantine` exists
- its immutable trigger exists
- archive evidence row counts remain expected

### Phase 4: Apply migration 003

Apply `db/migrations/20261012_003_chatgpt_archive_access_hardening.sql`.

Immediately verify from catalog readback:

- `comind_archive_ingestor` exists
- it is NOLOGIN, non-superuser, NOCREATEDB, NOCREATEROLE, NOREPLICATION, NOBYPASSRLS
- every archive table has ENABLE RLS and FORCE RLS
- `PUBLIC`, `anon`, `authenticated`, and `service_role` have no direct archive-table privileges
- archive policies target only `comind_archive_ingestor`
- immutable tables expose only SELECT and INSERT to the archive role
- `cm_archive_import` additionally exposes UPDATE
- no archive role has DELETE or TRUNCATE
- helper trigger functions are not directly executable application surfaces

Do not run `verify_20261012_003_chatgpt_archive_access_hardening.sql` unchanged against live Supabase. Its isolated-development verification section creates immutable synthetic security-fixture evidence. Live verification must use read-only catalog queries or a separately designed rollback-only smoke.

### Phase 5: Security Advisor gate

Run Supabase Security Advisor again.

Classify findings into:

- archive-specific blockers
- archive-specific warnings
- pre-existing unrelated CoMind backlog

An archive-specific blocker stops deployment. Do not bulk-remediate unrelated historical tables under this lane.

### Phase 6: Provision the dedicated LOGIN

Create one dedicated login, recommended name `comind_archive_ingest_login`, with:

- LOGIN
- NOINHERIT
- NOSUPERUSER
- NOCREATEDB
- NOCREATEROLE
- NOREPLICATION
- NOBYPASSRLS
- a strong generated password
- a narrow connection limit appropriate for the one-connection importer

Grant only:

`GRANT comind_archive_ingestor TO comind_archive_ingest_login WITH INHERIT FALSE, SET TRUE;`

Do not grant ADMIN OPTION.

Do not grant archive table privileges directly to the login.

Do not make the login a member of `postgres`, `anon`, `authenticated`, `service_role`, or any other role.

### Phase 7: Effective-privilege verification

Connect using the dedicated login itself, not an administrator impersonation, and prove:

- `session_user` is the dedicated login
- `current_user` initially equals the dedicated login
- exact role attributes are constrained
- exact direct membership is only `comind_archive_ingestor`
- `pg_has_role(..., 'MEMBER')` is true
- `pg_has_role(..., 'USAGE')` is false before `SET ROLE`
- `pg_has_role(..., 'SET')` is true
- `SET ROLE comind_archive_ingestor` succeeds
- `session_user` remains the login afterward
- `current_user` becomes `comind_archive_ingestor`
- archive privileges match the intended matrix
- destructive archive privileges remain absent
- no unexpected nonarchive effective privileges are introduced through direct grants or memberships

Also recheck privileges inherited through `PUBLIC`. `NOINHERIT` does not remove privileges granted to `PUBLIC`.

The current project-specific read-only preflight found `CONNECT`, temporary-table creation, and `public` schema usage inherited through `PUBLIC`; it did not find `pg_net` enabled or direct `PUBLIC` privileges on existing `comind` tables. That observation is not permanent truth and must be repeated after credential creation.

Do not globally revoke `PUBLIC` privileges as an incidental side effect of this archive lane unless a verified archive-specific blocker requires a separately reviewed change.

### Phase 8: Application connection smoke

Run only:

`node dist/archive/chatgpt-export-cli.js --preflight`

with `CHATGPT_ARCHIVE_DATABASE_URL` supplied securely.

This preflight must:

- return PASS
- identify the dedicated login as `sessionUser`
- identify `comind_archive_ingestor` as `currentUser`
- create no archive evidence rows

Independently compare archive row counts before and after the preflight.

A rollback-only SQL capability smoke may be added if needed, but it must leave zero persistent evidence and must not bypass the application credential guard.

### Phase 9: Preserve PIT-A source evidence

Before import:

1. keep the original ChatGPT export ZIP untouched
2. preserve an independent backup copy
3. record its local filename, byte length, and SHA-256 without modifying it
4. do not extract into or commit from the public repository
5. ensure sufficient local disk space for ZIP extraction and database transfer
6. keep the connection credential outside command history where possible

The original ZIP remains authoritative source evidence even if an import attempt fails.

### Phase 10: Run PIT-A candidate ingestion

Run the governed CLI against the untouched full export using only `CHATGPT_ARCHIVE_DATABASE_URL`.

A process exception, `PENDING`, `FAIL`, unresolved parser error, or unresolved quarantine is not success.

A process interruption can leave a partially observed `PENDING` attempt. V0 intentionally does not delete or silently overwrite such evidence. Preserve it and investigate. A later corrected parser/schema attempt may be required.

### Phase 11: Independent PIT-A reconciliation

After the CLI completes, verify live state independently of the CLI output.

Establish from evidence:

- every conversation accounted for
- every message accounted for
- timestamps preserved raw and normalized where valid
- roles preserved
- mapping topology preserved where available
- physical files inventoried
- attachment references inventoried
- source conversation IDs retained
- source node IDs retained
- source message IDs retained
- archive and file hashes recorded
- deterministic raw, normalized, topology, parser-event, and receipt hashes recorded where defined
- duplicates prevented
- parser warnings and errors visible
- quarantine fully enumerated and reviewed
- source counts reconcile to database counts
- topology counts reconcile
- final receipt SHA-256 persisted
- exact archive re-import reuses the finalized attempt rather than duplicating it, if a controlled idempotency confirmation is authorized

Do not describe PIT-A as accepted merely because the CLI returned a result.

### Phase 12: PIT-A disposition

`PASS` can become the PIT-A baseline only after the independent reconciliation agrees with the receipt.

`WARN` requires explicit review of every warning and quarantine implication before any baseline decision.

`FAIL` is not accepted.

`PENDING` is not accepted.

Preserve failed attempts as evidence. Do not clean them up by deletion.

### Phase 13: Post-deployment closure

After PIT-A disposition:

- rerun archive RLS and privilege readback
- rerun Supabase Security Advisor
- record exact import ID, source archive ID, status, receipt hash, source ZIP hash, parser version, schema version, and reconciliation counts in durable project documentation
- record no secret material
- rotate or disable the dedicated login when operationally appropriate
- keep PIT-B differential implementation closed until PIT-A is accepted

## Failure handling

### Migration failure

Stop at the first failed migration or failed readback. Do not apply later migrations to compensate for an unknown state.

Because each archive migration is transactional, a statement failure should roll back that migration transaction. Confirm actual catalog state rather than assuming rollback occurred.

If an already committed live migration requires correction, use a reviewed additive corrective migration whenever practical. Do not drop archive evidence objects after private data has been loaded merely to recreate them.

### Credential failure

If the dedicated login fails any attribute, membership, effective-privilege, connection, or application preflight check, do not load private data. Disable or replace the login and repeat verification.

### Import failure

Do not delete or rewrite partial immutable evidence to make a failed import appear clean.

Retain parser events, quarantine, and PENDING or FAIL evidence. Diagnose from source hashes and database observations. Use a later governed parser/schema attempt when correction requires code or schema changes.

### Security Advisor regression

An archive-specific security regression blocks PIT-A. An unrelated pre-existing finding is recorded separately and does not silently expand this lane's authority.

## PIT-B boundary

Do not implement or run the PIT-A-to-PIT-B differential process until PIT-A has been accepted as a baseline.

When PIT-B exists, absence from PIT-B is an observation only. It is not proof of deletion without separate evidence.
