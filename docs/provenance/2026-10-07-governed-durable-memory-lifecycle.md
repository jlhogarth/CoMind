# Governed Durable-Memory Lifecycle Controls

Date: 2026-10-07

Issue: https://github.com/jlhogarth/CoMind/issues/42

Pull request: https://github.com/jlhogarth/CoMind/pull/43

Branch: `issue-42-memory-lifecycle-controls`

Base main: `4f00e19c09a5c8bcb85957ca47477b1fc10c543c`

## Purpose

Issue #42 adds the first governed lifecycle surface for durable memory created under CoMind's explicit promotion and retrieval model. The milestone makes durable memory inspectable and reversibly governable without allowing lifecycle operations to rewrite source-derived content or provenance.

## Behavior

The project-scoped lifecycle API provides:

- `GET /api/projects/:projectId/memories` for bounded, deterministic listing with active, archived, or all status filtering;
- `GET /api/projects/:projectId/memories/:memoryId` for project-scoped detail;
- `PATCH /api/projects/:projectId/memories/:memoryId` for bounded title, kind, subtype, priority, and visibility updates;
- `POST /api/projects/:projectId/memories/:memoryId/archive` for reversible archival;
- `POST /api/projects/:projectId/memories/:memoryId/restore` for restoration to active status.

No hard-delete endpoint is added.

The lifecycle API does not expose mutation of memory content, `json_payload`, project identity, author identity, or creation timestamp. Archive and restore change lifecycle status and `updated_at` while preserving the durable row.

Issue #38 retrieval behavior remains the eligibility boundary for assistant context: archived memory is excluded, private memory is excluded, and cross-project memory cannot enter another project's retrieval context.

## Governance invariant

Lifecycle metadata may change without rewriting the historical source or provenance of the memory. The immutable fields are deliberately outside the update schema and outside the SQL `SET` assignments.

A route-test failure during development exposed a faulty assertion rather than a production defect. The original regular expression scanned from `SET` through the remainder of the SQL statement and falsely matched the legitimate project-scope predicate `WHERE project_id = $1::uuid`.

Commit `c0de16649a1f56dbad1f218982e3fe589332d1d6` corrected the test without weakening it. The test now extracts only the bounded `SET ... WHERE` clause, asserts that the clause exists, and strictly verifies that `content`, `json_payload`, and `project_id` are not assigned there.

## Isolated PostgreSQL integration

Commit `64d02f8b7bd5ceefd1764415d0aee091dac8ef62` added `server/test/integration/memory-lifecycle.test.mjs` to the existing permanent PostgreSQL 17 plus pgvector integration path.

The integration uses the real Fastify application routes and real PostgreSQL queries with a deterministic local assistant provider. It proves:

- list and detail project isolation;
- cross-project detail denial;
- bounded mutable metadata updates;
- preservation of project identity, author identity, content, `json_payload`, creation timestamp, and weight across metadata changes;
- active eligible memory enters assistant retrieval context;
- private memory remains excluded;
- cross-project memory remains excluded;
- archive removes the memory from assistant retrieval while retaining the database row;
- no DELETE lifecycle route exists;
- restore makes the memory eligible for retrieval again;
- immutable fields remain preserved after the complete archive/restore lifecycle.

The first complete CI run containing this integration was https://github.com/jlhogarth/CoMind/actions/runs/37689545407 and completed successfully on head `64d02f8b7bd5ceefd1764415d0aee091dac8ef62`.

## Safety and cost

- No schema migration is required.
- No paid OpenAI or other provider request is required.
- No embedding request is required.
- Automated database verification uses isolated PostgreSQL 17, not live Supabase.
- Live Supabase is not mutated by this milestone.
- No credentials or secret values are added to repository content or test fixtures.
- The No Placeholder Policy remains a permanent merge gate.

## Architectural significance

With Issue #38 retrieval, Issue #40 explicit promotion, and Issue #42 lifecycle controls, CoMind now has a governed durable-memory loop with observable provenance and reversible eligibility control: persisted conversation material can be explicitly promoted, inspected, safely reclassified, archived out of retrieval, restored, and retrieved again without losing its source history.

Future memory automation should build on this invariant rather than replacing it with opaque remember-everything behavior. Any later extraction, summarization, embedding, decay, consolidation, or Virtual Employee behavior should remain project-scoped, provenance-preserving, observable, auditable, cost-aware, and reversible where policy permits.
