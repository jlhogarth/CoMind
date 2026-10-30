# CE-001 Continuous Excellence Foundation Provenance

Date: 2026-10-29
Issue: #332
Pull request: #333
Branch: `ce-001-continuous-excellence-foundation`
Base: `main` at `4104ce9743f51dc61f2725a8c9126e8011579e58`
Environment: repository plus Supabase Test
Production activation: none
Paid provider execution: none

## Human authority

Joseph Hogarth approved the Continuous Excellence vision and authorized creation of the documentation, governance, structures, architecture, and application changes required to implement it.

CE-001 remains bounded by existing CoMind authority controls. The foundation does not authorize Production activation, destructive Production changes, paid provider execution, autonomous merge or deployment, or silent expansion of C0-C4 authority.

## Objective

Institutionalize Continuous Excellence as CoMind's persistent discipline for detecting friction, recovering from failures, discovering omissions, learning from experience, and improving the human-AI operating environment while preserving evidence, authority, continuity, privacy, and reliability.

Primary loop:

`Prevent -> Recover -> Improve`

Improvement loop:

`Observe -> Diagnose -> Propose -> Implement -> Validate -> Measure -> Retain or Revert`

## Canonical repository artifacts

Governance and architecture:

- `docs/governance/continuous-excellence-contract.md`
- `docs/architecture/continuous-excellence.md`
- `AGENTS.md` recovery, Missingness Scan, completion-evidence, and friction-capture rules

Database implementation:

- `db/migrations/20261029_007_ce_001_continuous_excellence_foundation.sql`
- `db/migrations/20261029_008_ce_001_improvement_event_ordering.sql`
- `db/migrations/20261029_009_ce_001_operator_view_least_privilege.sql`
- `db/migrations/verify_20261029_007_ce_001_continuous_excellence_foundation.sql`
- `db/migrations/verify_20261029_008_ce_001_improvement_event_ordering.sql`
- `db/migrations/verify_20261029_009_ce_001_operator_view_least_privilege.sql`
- `db/test/ce_001_prerequisites.sql`
- `scripts/test_ce_001.sh`

Operator Console:

- `apps/operator-console/src/lib/continuous-excellence/service.ts`
- `apps/operator-console/src/lib/continuous-excellence/server.ts`
- `apps/operator-console/src/app/api/continuous-excellence/route.ts`
- `apps/operator-console/src/app/continuous-excellence/page.tsx`
- `apps/operator-console/test/continuous-excellence.test.ts`
- `apps/operator-console/.env.example`

CI:

- `.github/workflows/ce-001-continuous-excellence.yml`

## Composition decision

CE-001 deliberately reuses existing CoMind systems rather than creating a parallel platform:

- Durable RunBook remains the operational chronology and recovery-event ledger.
- `comind.cm_project` and `comind.cm_task` remain canonical work identity.
- `comind.cm_evidence` remains canonical evidence identity and provenance.
- `comind.cm_audit_log` remains the existing durable system audit substrate.
- Foundry remains the governed authorization and agent-execution substrate.
- MDO remains the governed module-development planner and sequencer.
- CUX retains specialist Console usability ownership.
- Continuous Excellence owns cross-cutting friction signals, continuity capsules, improvement lifecycle, recovery semantics, and the learning loop.

This avoids duplicate authority, evidence, task, and execution systems.

## Database model

The Test migration established private CE structures in the `comind` schema:

- immutable `cm_ce_signal` observations;
- immutable signal-to-evidence links;
- stable immutable `cm_ce_improvement` identities;
- append-only `cm_ce_improvement_event` lifecycle;
- signal-to-improvement and improvement-to-evidence links;
- immutable, versioned `cm_ce_continuity_capsule` recovery packages;
- capsule-to-evidence links;
- current-capsule, signal-backlog, and improvement-state projections;
- controlled private write functions;
- aggregate read-only Operator Console projections.

All CE historical tables reject UPDATE and DELETE. State transitions create new rows or append-only events.

Continuity Capsules preserve explicit predecessor lineage and deterministic SHA-256 content hashes. A current capsule is a lineage-leaf projection rather than a mutable current-state flag.

## Test migrations

Applied successfully to Supabase Test project `sbgfuanxiqepcoboxzcl`:

1. `ce_001_continuous_excellence_foundation`
2. `ce_001_improvement_event_ordering`
3. `ce_001_operator_view_least_privilege`

No CE migration was applied to Production.

## Verification discovery 1: lifecycle ordering

The first destructive verification intentionally created a proposed and validated improvement event in the same transaction. The current-state projection incorrectly returned `proposed`.

Root cause:

- PostgreSQL `now()` is transaction-stable;
- both immutable events therefore had the same `created_at`;
- the projection used random UUID ordering as a timestamp tie-breaker;
- random UUID order is not chronological order.

The verification transaction rolled back completely. No bad verification data survived.

Remediation:

- migration 008 added monotonic `event_ordinal` insertion order;
- the improvement-state projection now resolves latest state by `event_ordinal DESC`;
- a dedicated regression verification proves two events created in one transaction resolve to the later inserted event.

The corrected destructive verification then passed.

## Verification discovery 2: corrective view shape

The first attempt at migration 008 inserted `latest_event_ordinal` into the middle of an existing view projection. PostgreSQL rejected the replacement with SQLSTATE `42P16` because `CREATE OR REPLACE VIEW` cannot reinterpret an existing column name as a different column.

The migration was atomic and rolled back. A direct readback confirmed the proposed identity column did not survive the failed migration.

Remediation:

- preserved the existing view-column order;
- appended `latest_event_ordinal` after the existing columns;
- reapplied the migration successfully.

## Verification discovery 3: Operator Console projection ACLs

A direct ACL review found that Supabase default privileges on new `public` views had granted `service_role` privileges broader than the explicit CE design intended.

The views were confirmed non-updatable and non-insertable, so there was no effective write-through path. The ACL nevertheless violated the explicit least-privilege contract.

Remediation:

- migration 009 revokes all inherited privileges from `service_role` on both CE operator projections;
- it then grants only `SELECT`;
- browser roles retain no privileges;
- verification confirms both views remain non-updatable and non-insertable.

## Verification discovery 4: Console environment typing

The first exact-head PR run passed all 57 Console runtime tests and the production dependency audit, then failed TypeScript validation because the CE server configuration helper accepted the full project `NodeJS.ProcessEnv` type while its focused test fixtures supplied only the keys the helper actually consumes.

Root cause:

- the helper depended on a broader type contract than its behavior required;
- the project `ProcessEnv` declaration requires `NODE_ENV`;
- the CE tests correctly did not need or provide unrelated process state.

Remediation:

- introduced a minimal readonly string environment-map contract;
- kept `process.env` as the runtime default;
- removed unnecessary `NodeJS.ProcessEnv` casts from CE tests.

The repaired exact-head Console job subsequently passed all 57 tests, TypeScript validation, zero-vulnerability production dependency audit, and the Next.js production build.

## Verification discovery 5: migration-scoped verification boundaries

The first exact-head PostgreSQL 17 run applied migration 007 twice successfully, then failed `verify_007` because that verifier asserted deterministic latest improvement-event ordering before migration 008 introduced the monotonic event ordinal that provides that guarantee.

Root cause:

- the foundation verifier tested a successor migration invariant;
- applying migration 008 before running the 007 verifier would have hidden the boundary error rather than correcting it.

Remediation:

- `verify_007` now proves lifecycle event presence and signal-to-improvement linkage without asserting deterministic latest-event ordering;
- `verify_008` exclusively owns the deterministic ordering guarantee;
- the CI sequence remains strict so every migration is independently verifiable at the boundary where its invariant is introduced.

The repaired exact-head PostgreSQL 17 job subsequently passed all three migration families, each applied twice, plus all three verification suites.

## Destructive Test verification result

The final Supabase Test verification passed and was rolled back after exercising synthetic verification records.

Verified controls include:

- RLS enabled on CE base tables;
- no `anon` or `authenticated` CE read or write path;
- controlled service-role function execution;
- fixed search paths on CE `SECURITY DEFINER` functions;
- append-only mutation rejection;
- signal idempotency without history mutation;
- Continuity Capsule predecessor lineage;
- distinct 64-character SHA-256 capsule hashes;
- deterministic current-capsule projection;
- deterministic improvement lifecycle ordering after migration 008;
- signal-to-improvement backlog reconciliation;
- explicit read-only Operator Console projection ACLs.

## Foreign-key and advisor review

A direct PostgreSQL catalog audit confirmed every CE foreign key has a covering index.

Supabase security advisor results contained no unresolved CE-specific warning. The CE tables appear under the informational `RLS Enabled No Policy` finding because the foundation intentionally uses RLS with no browser policies as a fail-closed private-table boundary. Browser roles are also explicitly revoked.

The advisor reported unrelated pre-existing project warnings, including older mutable-search-path functions and existing public approval RPCs. They were not introduced or changed by CE-001.

Supabase performance advisor results show new CE indexes as unused, which is expected before meaningful workload accrues. Direct CE foreign-key coverage passed. Existing project-wide performance findings were not expanded into CE scope.

## Operator Console boundary

CE-001 adds a read-only `/continuous-excellence` surface backed by `/api/continuous-excellence`.

The protected read path requires:

- `OPERATOR_CONSOLE_CE_ACCESS_MODE=trusted-perimeter`;
- server-only `SUPABASE_SECRET_KEY`;
- configured Supabase URL.

The default example configuration is `OPERATOR_CONSOLE_CE_ACCESS_MODE=disabled`.

No privileged credential is placed in a `NEXT_PUBLIC_` variable or browser code. The browser receives aggregate CE state only. The base CE tables and private views remain inaccessible to browser roles.

The CE page does not take ownership of CUX-002 readability and accessibility remediation and avoids modifying existing Console pages owned by that active lane.

## Continuous Excellence self-observation

CE-001 used its own substrate during implementation rather than treating the Continuous Excellence loop as documentation only.

Canonical task:

- `comind.cm_task`: `244a9c35-2652-494a-a6d6-97bee66b3663`

RunBook work item:

- `CE-001`: `690857b8-797d-4641-9e4c-5237cab79a27`

Initial RunBook implementation snapshot:

- `13ff9ebe-213a-4171-9115-ccccfd6715a0`

State after the first repaired exact-head green run:

- seven CE signals;
- five systemic improvements;
- zero unowned actionable CE-001 signals;
- Continuity Capsule version 1 pending final review-state successor.

The seven signals include the approval opportunity, three Test-time integrity discoveries, two exact-head CI failures, and one non-actionable forward-looking GitHub Actions runtime-deprecation observation.

The non-actionable observation records that GitHub currently warns `actions/checkout@v4` and `actions/setup-node@v4` target deprecated Node.js 20 action internals and are being forced onto Node.js 24. CE-001 passed under the forced Node.js 24 runtime. Repository-wide action-generation maintenance is intentionally outside this issue.

## Canonical evidence

Evidence identities created in `comind.cm_evidence` include:

- issue #332: `872ea3ec-5612-465c-b9c5-86d9979b2df9`
- foundation Test migration: `961c7a86-fd8a-464a-b470-a42466b36476`
- event-ordering Test migration: `701e38ec-85e8-4b34-b31a-b0b8c3e8b2db`
- final destructive Test verification: `7bd1e35e-5e65-43ef-b49b-49fefb836284`
- lifecycle-ordering verification failure: `f3507c5c-264a-44ec-814b-f90f893b7c62`
- first corrective migration failure: `28b4ac58-b53b-4b98-9b60-85ae3389a88b`
- advisor and foreign-key review: `d2705be3-ad2a-402b-b4f6-15fdcca3efc5`
- default Operator Console view ACL finding: `562eb68b-2a9d-44f8-a183-68502591d9d9`
- least-privilege Operator Console verification: `6e44a5e8-9813-49d2-b506-15da455627b0`
- PR #333: `e8ebe999-e27b-47fc-89ec-4615ba339f97`
- first exact-head Console typecheck failure: `e6eb6de4-fc80-47c4-8c21-358d97b508f9`
- first exact-head database verification-boundary failure: `fb430a97-bf21-480f-8bd3-1bb3d29d328a`
- repaired-head database contract pass: `718b6d90-743a-4de1-9f93-e9f181db0b41`
- repaired-head Console contract pass: `5517f330-d9e7-4d95-b9c2-5f5e2eb1bdf0`
- GitHub Actions Node.js runtime-deprecation observation: `faf52d29-e134-4404-adfb-022eb620ae56`

## Foundry reviewer decision

CE-001 does not provision a `continuous_excellence_reviewer` Foundry profile merely to satisfy an architecture diagram.

The existing Foundry substrate is reusable, but a real CE reviewer needs a bounded authoritative-input bridge and deterministic review contract. Provisioning a profile without that executable capability would violate the No Placeholder policy.

The CE architecture therefore reserves the CE-009 reviewer boundary for a separately scoped implementation that composes Foundry when a real authoritative review operation can be verified end to end.

This is a deliberate capability boundary, not an omitted hidden dependency of the CE-001 persistence and recovery foundation.

## CI contract

`.github/workflows/ce-001-continuous-excellence.yml` provides two exact-head jobs.

Database contract:

- PostgreSQL 17;
- isolated `comind_ci` only;
- synthetic CE prerequisites;
- foundation migration applied twice before successor migrations;
- event-ordering migration applied twice;
- ACL migration applied twice;
- all three migration-scoped verification suites.

Operator Console contract:

- exact dependencies via `npm ci`;
- production dependency audit at high severity;
- test suite;
- TypeScript check;
- Next.js production build with CE and RuleBook protected modes disabled.

The repaired implementation head `f4699cb0edb70accee1987ed2de824e9d70c085c` passed both CE-specific jobs in GitHub Actions run `40960992893`:

- database job `123753393472`: passed PostgreSQL 17.11 and every CE database contract;
- Console job `123753393901`: passed 57 of 57 tests, TypeScript, zero-vulnerability production audit, and production build.

Because this provenance reconciliation is itself a repository commit, CE requires the CI workflow to rerun on the resulting exact head before final branch acceptance. Final exact-head acceptance evidence belongs in the RunBook, canonical evidence store, and successor Continuity Capsule so the repository documentation does not need another self-invalidating evidence-only commit.

## Recovery

Repository recovery is branch and PR based. No merge or deployment is performed by CE-001 itself.

Supabase changes are Test-only and additive. Failed migrations were preserved as evidence and rolled back atomically. Corrective changes were implemented as forward migrations rather than rewriting accepted Test history.

The current Continuity Capsule records the verified baseline, constraints, next safe action, and rollback point. A successor capsule will advance the durable recovery point after final exact-head CI on the provenance-reconciled head.

## Acceptance state at provenance reconciliation

Implemented and verified before this documentation-only reconciliation commit:

- canonical CE contract and architecture;
- agent recovery semantics;
- durable CE signal, capsule, improvement, and evidence substrate;
- self-observation loop;
- RunBook presence;
- read-only Console application surface;
- database verification and security hardening;
- dedicated CI workflow;
- successful exact-head PostgreSQL 17 and Console contracts on the repaired implementation head.

Still required before CE-001 is ready for human review:

1. rerun exact-head CE CI on this provenance-reconciled commit;
2. record the final CI evidence;
3. advance the RunBook and Continuity Capsule to the verified review state.

Merge and Production activation remain outside autonomous CE-001 authority.
