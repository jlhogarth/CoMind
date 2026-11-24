# GER-005 Test identity binding and promotion preflight

Status: bounded Test slice of parent Issue #382. No Production activation, personal Twin assertion, consent grant, or authorized durable promotion.

## Live Test reality

Supabase project `sbgfuanxiqepcoboxzcl` reported ACTIVE_HEALTHY, PostgreSQL 17. At preflight: one confirmed Auth account, three existing person actors, zero `comind.cm_identity` mappings, and zero verified-email matches to existing person actors. The account could not be attributed to Joseph, Lisa, or any other named actor. The Test binding therefore uses a distinct, clearly synthetic actor and stores only the existing confirmed Auth UUID as the provider subject; no email or display name is copied.

`db/sql/ger_005_test_identity_binding.sql` uses the existing `cm_identity_provider`, `cm_actor`, and `cm_identity` tables. It requires exactly one confirmed Auth account, serializes its own work, refuses conflicting provider/actor/subject rows, and is idempotent for the exact Test binding. The script was first run with its COMMIT replaced by ROLLBACK, then applied and rerun; metadata-only readback confirmed exactly one verified binding with no copied personal profile. The first rollback attempt failed because PostgreSQL lacks `min(uuid)`; casting the UUID to text for ordering fixed the query before any committed write. No Auth user was created or changed.

Live access readback showed `authenticated` has no USAGE on private `comind`, no SELECT on `cm_identity` or `cm_epistemic_case`; `comind_ger_runtime` has SELECT on the GER case table under its RLS policy. A transaction using `SET LOCAL ROLE authenticated` read back `schema_usable=false`; an attempted private access returned `permission denied for schema comind`. A read-only transaction under `comind_ger_runtime` saw zero cases. These establish database role and RLS boundaries, not a signed-JWT end-to-end product flow. No user JWT or private row content was exported.

## GER-005 code boundary

`server/src/epistemic/twin-promotion.ts` is a deterministic *preflight input contract*. It requires exact evidence, source, subject, purpose, sensitivity classification, verified identity, independently verified subject consent, and a live scoped access decision. Simulation, contradiction, supersession, restriction, missing lineage, or uncertain status denies. Inference additionally needs method/version, uncertainty, reopening condition, and bound human approval; observed, imported, inferred, and sensitive claims need bound human approval. Repeated source references do not become independent corroboration. This function never obtains its own decisions or writes to GER. A caller could lie about `liveVerified`, so **it must not be exposed as an authorization endpoint or treated as enforcement** until the owning systems supply signed or server-controlled decisions and the integration is independently tested.

The Test database contains no subject-specific Twin consent grant table established by this lane. Generic `pm_authorizations` and DRULE retrieval/tenancy policy do not equal a person's grant to create a durable Twin assertion. Accordingly, no claim can currently pass a real end-to-end durable promotion. The new unit test's positive case uses only synthetic inputs and demonstrates the policy shape, not live authority. GER-002's immutable four-table substrate remains unchanged; erasure against its retention/hold policy remains unresolved.

## Verification and continuation

Local Node 24 build and focused tests: `npm run build && node --test test/ger-005-twin-promotion.test.mjs test/ger.test.mjs test/prism-001-synthetic-view.test.mjs`. The final rerun, including the duplicate-source negative case, passed 22/22. Live binding readback returned one verified Test row. No schema migration, paid provider execution, human research collection, Production change, or personal trait inference occurred.

Next owner-coordinated step: establish a subject-specific consent source with revocation and independent readback, then bind a signed Auth session, the actual private RLS decision, and GER-002 expected-head writes to a Test-only promotion transaction. Preserve reopening and correction lineage and prove denial with another principal. Do not promote this synthetic actor to a named human identity.

Sources: [GER-005 #382](https://github.com/jlhogarth/CoMind/issues/382), [GER-002 contract](https://github.com/jlhogarth/CoMind/blob/main/docs/architecture/ger-002-epistemic-persistence-contract.md), [PRISM Phase 0](https://docs.google.com/document/d/1BxLKC9yJXsYmYOUO6JE3UttykrrgHW-UuFxxfB9rweE/edit).
