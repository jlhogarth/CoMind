# Prior Neon and ChatGPT operational compatibility

Correction recorded 2026-10-17 after Joseph recalled prior issues. Supersedes the earlier price-led Neon lead nomination. Decision remains C; Neon is compatibility-blocked. Supabase is the demonstrated working integration reference, not an unconditional production winner.

## Evidence and limits

Personal Context retrieval of prior CoMind conversations returned:

- October 4-5: Neon skills/integration enabled but callable database/MCP tools absent from Work sessions, including project/branch and SQL operations.
- October 4: direct PostgreSQL access encountered workspace network/DNS restrictions, while browser authentication fallback failed or stalled.
- October 6 record: old Neon migration target reported transaction_read_only=on, blocking writes/migrations. This does not prove a provider-wide Neon limitation; cause and current resolution are unverified.
- October 5: Supabase exposed SQL/migration/table/log tools and successful database operations were reported during the transition.

These are attributed retrieved historical reports, not newly executed tests or independently recovered original logs. Repository docs/implementation-status.md, dated October 5, independently records the shift from Neon-specific automation to Supabase/Postgres. Current session Supabase project discovery, aggregate SQL and RunBook append/readback provide direct evidence of a working present access path.

Current tool discovery exposes a Neon namespace, but its existence alone does not establish that authenticated database operations work reliably. Likewise a successful psql connection from Codespaces would establish that path, not ChatGPT connector availability across fresh sessions.

## Required operational compatibility gate

Before recommending Neon as primary or future standby:

1. Identify the approved operating interface: ChatGPT connector/MCP or a separately governed HTTPS backend with a tested ChatGPT-facing tool. Do not assume ordinary SQL support solves tool availability.
2. Demonstrate actual authenticated, scoped read access from the relevant ChatGPT/Work environment and fresh-session recovery without manual repeated login. Use a separately authorized non-production target for any write/migration test.
3. Diagnose legitimate target role/endpoint/transaction settings and prove authorized writes are possible; do not bypass read-only protection blindly or broaden privileges.
4. Test network path, TLS, pooling/session behavior, credentials revocation, tool availability and failure visibility. Provide logs without secrets.
5. Prove the approved RunBook capture path and application API/identity compatibility, including total cost and ongoing operation.
6. Reconcile why earlier fallback paths failed, document bounded workarounds and prove they survive session interruption.

Production database administration need not depend on a chat plugin, but any replacement requires a concrete, tested, affordable operating path. Do not quietly transfer additional administration work to Joseph or expose database credentials to browser/chat clients.

Neon's low modeled price remains useful comparison evidence. It does not override these known workflow failures. No conclusion that Neon itself is technically incapable is justified by the retrieved history.
