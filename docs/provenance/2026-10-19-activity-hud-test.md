# Activity HUD Test implementation

Date: 2026-10-19 America/Indiana/Indianapolis

## Scope and authority

Joseph authorized bringing the Activity HUD live in the CoMind Supabase Test project. The implementation is T1 isolated Test work using a new private `comind_hud_test` schema and synthetic activity rows. It does not modify existing `comind`, `comind_pm`, or `public` objects. The HUD reads the existing RunBook timeline through a separate view and does not alter source RunBook records.

Joseph directed that all formal security review work related to the HUD be deferred for later reimplementation. This Test slice does not require a formal security review. New tables use RLS, the schema and views have no grants to `anon` or `authenticated`, and the Test project is not a production environment. These are implementation facts, not a security review or production authorization.

## Deployed Test objects

Supabase project: `sbgfuanxiqepcoboxzcl` (`CoMind`, PostgreSQL 17.11).

Migration: `activity_hud_test_v1`, database migration version `20261019214321`.

- `comind_hud_test.activity_runs`: synthetic or instrumented activity identity and local deadline/staleness parameters.
- `comind_hud_test.activity_observations`: append-only source observations with source and observation timestamps.
- `comind_hud_test.v_activity_hud`: latest observed status, conservative stale/deadline labels, and evidence-based resolution only when a terminal source observation exists.
- `comind_hud_test.v_runbook_timeline`: separate read-only projection of the canonical RunBook timeline.

The fixture inserts five synthetic activities: completed, failed, stale with no terminal return, cancellation requested with no source confirmation, and a locally elapsed deadline. It does not create records for native ChatGPT UI activity.

## Verification

The live Supabase verification SQL at `db/test/verify_activity_hud_test.sql` completed without error.

- Five synthetic activities appeared with expected states: one completed, one failed, two `stale_unknown`, and one `deadline_exceeded`.
- Stale and deadline-exceeded entries had no evidence-based resolution.
- The RunBook projection returned 68 rows at verification time, matching the source view's row count.
- Both HUD tables had RLS enabled; `anon` and `authenticated` had no schema USAGE or view SELECT privileges.
- Update and delete attempts against the append-only fixture records were rejected.
- `git diff --check` passed for the local repository changes.

The repository includes a PostgreSQL 17 workflow using a synthetic RunBook source fixture. All 12 returned workflows passed at PR head `b8d1c9290edda4020918ae1a96934a813014a289`: CI `39330475724`; DRB-002 Query Contract `39330475720`; Foundry Runtime Orchestration `39330475851`; CoMind Repository Configuration `39330475773`; No Placeholder Policy `39330476249`; Activity HUD Test `39330476073`; Live Foundry LF-3 Readiness `39330475727`; Foundry Work Lease Kernel `39330475820`; Governed Provider Execution `39330475780`; Live Foundry Stage 1 Readiness `39330475732`; Live Foundry LF-2 Readiness `39330475721`; Runtime Budget Authority Adapter `39330475794`. The PR remains open, draft, and unmerged.

## Limitations

This milestone is a live Supabase Test data model and queryable projection, not a hosted visual page or an automatic all-source collector. There is no CoMind Vercel project connected, and the existing Operator Console has no live data provider. The private Test views remain owner-queryable in Supabase; a browser HUD needs a Test-only sign-in and server data path. New activities appear only when a CoMind or source adapter appends observations. GitHub Actions, OpenAI API jobs, Drive writes, and other operations are not yet automatically ingested. Native ChatGPT iOS conversations are not observable through this interface. Lack of a terminal report remains `stale_unknown`; the projection does not claim complete history, a lossless feed, or snapshot consistency.

The RunBook timeline remains its own source stream. The HUD does not infer UUID/project/lane associations or join PM decisions, Foundry authorization requests, verification records, and human-action assessments into a single authority.

## Remote state at implementation start

- `main`: `524f893fb6ac71aef3954f4cff9d592a2f5090e9`.
- PR #143: open, draft, mergeable; head `b245ebc0b650baf7b7c289d189d347b07c9e81d6`, base `c5fc5d8bfd818a3feb22f5585bde93059a255658`.
- PR #152: open, draft, unmerged; head `6a1860b89212045be1beb501ccb41472715917aa`, base `524f893fb6ac71aef3954f4cff9d592a2f5090e9`.
- Issue #153: open; Test scope updated to allow the private schema and live Test projection.

## Next steps

1. Add and deploy a visual Test HUD after defining a Test-only sign-in and server data path for the private views.
2. Instrument supported CoMind/GitHub/provider adapters so tracked jobs append observations and terminal evidence.
3. Reimplement the deferred formal security review before adding production data, live endpoints, or production access.
