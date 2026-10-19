# Conversation Notebook isolated Test slice

Date: 2026-10-19 America/Indiana/Indianapolis

## Scope and authority

T1 reversible repository and disposable PostgreSQL 17 development. This slice resumes the browser-local Conversation Notebook prototype and verifies its evidence-linked review loop with synthetic records. It does not apply a Notebook migration to the active CoMind Supabase project, expose a new service, grant access, or make a production deployment decision.

## Reconciled contracts

- `comind.cm_project.project_id` is the project identity. The draft's free-form `project_key` and `auth.users` owner model are not used by this Test slice.
- A captured CoMind project conversation is associated with a canonical `comind.cm_conversation` and persisted `comind.cm_message` in the disposable Test database.
- A project finding approved by the human reviewer uses the existing `POST /api/messages/:id/promote-memory` route. That route copies the canonical source message into `comind.cm_memory_node`, derives project scope from the source conversation, records source conversation/message provenance, and is idempotent by source message.
- The Notebook review record stores only candidate text, exact evidence, review history, and the resulting canonical `memory_id` link. It does not create `memory_entries` or another project-memory authority.
- Canonical retrieval and reversible archive/restore remain owned by CoMind's existing project-scoped memory routes and retrieval path.
- Personal continuity remains in the artifact's separate browser-local Personal notebook. The Test fixture can exercise its routing with synthetic state, but it does not claim a canonical CoMind Personal memory contract.
- Project identity and source/reviewer identities in the fixture are generated synthetic rows. This does not establish production identity, authorization, or RLS behavior.

## Test-only storage

`db/test/conversation_notebook_fixture.sql` creates `comind_notebook` only after the disposable CI database has loaded CoMind's canonical schema. The integration script drops and recreates that schema for each test run. The fixture is not included in `db/sql/v2`, `db/migrations`, production deployment scripts, or runtime startup.

The integration launcher and Notebook integration test both refuse any database URL except local PostgreSQL database `comind_ci`. This keeps the destructive fixture reset and synthetic rows from targeting a remote project or a differently named database.

The model holds source records with content hashes, candidate findings, exact evidence offsets, append-only review events, and an optional foreign key to `comind.cm_memory_node`. Project and Personal scope checks are explicit. Source, evidence, and review records reject mutation; a finding can transition only once from candidate to approved or rejected. No standalone `memory_entries` table is present.

Approval spans the existing memory API and the Notebook review fixture, so the two writes are not one database transaction. A retry is safe because CoMind's memory promotion returns the already-created canonical memory for the same source message. The Test proof must check that behavior and ensure a failure cannot create a second project memory.

## Acceptance sequence

1. Capture a synthetic source under a canonical project or the separate Personal scope; repeat capture and resolve the same source by hash.
2. Create candidate findings with a versioned deterministic extractor label and exact code-point evidence offsets.
3. Verify each excerpt equals the corresponding source-text slice.
4. Require an explicit synthetic human reviewer decision. Rejection leaves no canonical memory. Personal approval stays in the Personal destination without writing `cm_memory_node`.
5. For project approval, promote the exact persisted source message through CoMind's existing route, record the canonical memory ID, and retry promotion to verify idempotency.
6. Retrieve the approved project memory through the existing assistant retrieval path; prove another project cannot retrieve it.
7. Archive and restore the canonical memory using existing lifecycle routes and verify retrieval eligibility changes while source provenance remains intact.

## Verification status

The local environment has Node.js 24 but does not provide Docker, `psql`, or a local PostgreSQL server. Local build and unit verification passed: `npm run build`; `npm test` reported 202 passed, 7 database-dependent tests skipped, 0 failed. The prototype script syntax check, embedded SQL fixture equality, and `git diff --check` also passed.

After the automatic approval review initially blocked external publication, Joseph explicitly authorized publishing Test implementations to GitHub. The first shell push then failed because the local shell had no GitHub credentials; no credential workaround was used. The connected GitHub repository app published the three local milestones to `notebook-001-capture-review-test` and opened draft PR [#152](https://github.com/jlhogarth/CoMind/pull/152), head `fee27936f7155a34b53723ecf964da19a364a0bc`. Its final tree matches the local branch tree. The PR remains draft and unmerged.

Exact-head PostgreSQL CI first ran `server/test/integration/conversation-notebook.test.mjs`: 22 passed, 1 failed, 1 skipped. The failure was an overbroad test assertion: it searched the complete provider request, which correctly includes original conversation messages, while asserting that a rejected sentence was absent from durable memory. The canonical table check already found no memory for the rejected message. The first correction isolated the explicit `cm_memory_node` context block, but the next run exposed another overstrict assertion: a query mentioning “protocol” may legitimately retrieve the separate approved cobalt memory through lexical matching. The assertion now permits unrelated approved memory and checks that the rejected excerpt itself is absent from canonical memory context. The explicit zero-row query for the rejected source message remains. These are test corrections, not runtime or schema changes.

The corrected test is being sent to PR #152 for another exact-head run. Do not claim the end-to-end PostgreSQL sequence passed until that rerun completes successfully. The exercised environment is ephemeral PostgreSQL 17 in GitHub Actions, with synthetic fixtures and no live Supabase Notebook schema or production access.

## Durable RunBook references

- `d035322b-d17d-4202-ba88-92822ff298c5`: prototype recovery and canonical contract reconciliation.
- `27714818-009c-4a6d-aefb-96356cb0327c`: local implementation and validation results; PostgreSQL proof pending.
- `076daa79-2dce-4397-bd63-2df642ab22c7`: automatic review block on external branch publication.
- `968a308c-8118-4525-a515-f584699d3a6b`: GitHub publication and draft PR #152.
- `38bdc55f-46e0-466e-9425-8136450fe803`: exact-head CI queued and initial workflow status.
- `b180cc64-dfea-49a3-b53a-45b4aaaa19bf`: PostgreSQL integration failure, diagnosis, and correction plan.
- `27b9ed34-0932-4835-877d-5bee8578bbc4`: local GitHub shell authentication failure and app-based recovery.
- `d4fb74ce-5c6a-4c1c-bb4b-5b26a591eb7a`: first retrieval assertion correction and CI rerun.
- `49ffbfdf-1977-42d3-9f99-339945e6ceea`: second overstrict retrieval assertion and narrowed correction.

## Recovery

The change is confined to a feature branch and Test-only files. Recovery is to revert the branch delta. CI destroys the disposable database at job completion. If a project-memory API call succeeds but final Notebook linking fails, retry the same source-message promotion, resolve the existing memory ID, then record the review/link once; never create a second memory row.
