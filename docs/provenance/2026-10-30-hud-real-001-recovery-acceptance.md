# HUD-REAL-001 recovery and Test acceptance evidence

Date: 2026-10-30
Issue: #358
Pull request: #359
Branch: `hud-real-001-operational-activity-links`
Production activation: excluded

## Purpose

This record preserves the authoritative recovery and acceptance state for HUD-REAL-001 after the originating ChatGPT conversation became partially unavailable. Missing conversational narrative was not treated as evidence that work had not occurred. Repository, CI, Supabase Test, and deployment evidence were used as the authority.

## Recovery checkpoint and freshness

The recovery capsule identified branch head `d408c5369fdcf0c932e677530702fc7cfaa39980` as the last-known checkpoint.

Recovery verified:

- PR #359 remained open and non-draft.
- The branch was still at the supplied checkpoint when reconstruction began.
- `main` was `f1ab149b121471a8aa57a7a52dab6cbaf3731bf6` and had not moved since the PR merge base.
- The PR was 23 commits ahead and 0 behind at recovery.
- No submitted PR review was present.
- Nearby active lanes were inspected for collision risk. No exact-file collision was identified with HUD-REAL-001 application, migration, or acceptance files.
- Production was not used for recovery or acceptance.

## Recovered implementation boundary

Durable repository evidence confirmed that HUD-REAL-001 implements:

- canonical operational Activity projection from PM and RunBook work information;
- server-mediated `/api/activity` reads;
- hashed database capability storage with plaintext capability material kept outside the database;
- no direct browser grant to `comind_pm`;
- a hard 1,000-row server-side read ceiling;
- `operational`, `synthetic`, and `all` scopes with Operational as the UI default;
- explicit `blocked`, `awaiting_review`, and `deferred` HUD states;
- deterministic reference resolution only, with opaque identifiers preserved as text;
- PostgreSQL 17 contract verification;
- browser, API, link-resolution, state, and permission tests.

## CI defects found during recovery

The application and database contract were not immediately merge-ready because Operator Console CI exposed defects in the new browser acceptance harness.

### Recovery defect 1

At checkpoint `d408c5369fdcf0c932e677530702fc7cfaa39980`, Playwright strict mode rejected `getByLabel("Filter source")` because it matched both the source selector and the source-result label.

Repair commit:

`85ba44e74bac9cb642edb5914568d4ee3305b114`

The repair made the selector exact without changing runtime behavior.

### Recovery defect 2

The next exact-head run showed that scope verification inherited prior source-filter state.

Repair commit:

`08d963d85f7a4bb7da27786d13741168a006eea5`

The test now explicitly resets the source filter before cross-scope verification.

### Recovery defect 3

The next exact-head run reached Combined scope and incorrectly expected a synthetic row on page 1. Combined fixture ordering contains 13 operational rows before 5 synthetic rows, with a page size of 10. Synthetic rows correctly appear on page 2.

Repair commit:

`55dcf34dce44e8fee93cfb8af8994bbabb9c2041`

The test now proves both page-1 operational visibility and page-2 synthetic visibility.

These were acceptance-harness defects. No runtime Activity API, security-boundary, or database-projection defect was found in these three failures.

## Supabase Test acceptance

The connected CoMind Test project was independently identified from repository evidence before mutation. HUD-REAL database objects were absent before installation, and `anon` already lacked `comind_pm` schema usage.

Migration applied in Test only:

`hud_real_001_operational_activity`

A fresh server capability was created for Test acceptance. Only its SHA-256 digest is stored in `comind.cm_operator_console_read_capability`. The plaintext capability is intentionally not recorded in this evidence file, Git, or database storage.

Live Test results after migration:

- Operational feed: 18 rows.
- Synthetic feed: 5 rows.
- Combined feed: 23 rows.
- `anon` schema usage on `comind_pm`: false.
- `anon` direct SELECT on `comind_pm.v_operator_console_activity`: false.
- `anon` direct SELECT on the capability table: false.
- `anon` EXECUTE on the capability-gated feed: true.
- Invalid capability: denied with PostgreSQL SQLSTATE `42501`.
- Missing capability: denied with PostgreSQL SQLSTATE `42501`.

A rollback-only live Test transaction created temporary `blocked`, `review`, and `deferred` work items and verified exact HUD mappings:

- `blocked` -> `blocked`
- `review` -> `awaiting_review`
- `deferred` -> `deferred`

The same rollback-only exercise inserted 1,005 temporary operational rows and requested a 5,000-row feed. The function returned exactly 1,000 rows, proving the hard ceiling. The transaction was rolled back, so the acceptance fixtures did not persist.

Supabase security advisors report the capability-gated Activity feed as an `anon`-executable SECURITY DEFINER function. This is intentional for this boundary and was reviewed together with its compensating controls: capability validation, fixed function search path, denied underlying table/view grants, bounded output, and fail-closed behavior. No HUD-specific advisor finding required weakening the design.

## Server and deployment acceptance

The existing Vercel project continues to suppress automatic builds through its Ignored Build Step policy. That protection was not disabled.

A manual Preview request pinned to exact commit `85ba44e74bac9cb642edb5914568d4ee3305b114` was correctly canceled by the existing ignore-build policy. Rather than weaken project-wide deployment suppression, acceptance moved to an isolated, non-persistent Vercel sandbox.

Sandbox acceptance proved:

- exact Git revision checkout;
- `npm ci` with no reported vulnerabilities;
- successful Next.js 16.4.1 production build;
- live server connection to Supabase Test through `/api/activity`;
- default API scope `operational` with 18 rows;
- `synthetic` scope with 5 rows;
- `all` scope with 23 rows;
- unsupported scope returns HTTP 400;
- the response did not expose the server capability or its environment-variable name.

A separate live server exercise with the server capability removed returned HTTP 503 with a bounded configuration error. Unit coverage also verifies that an upstream capability denial is redacted rather than relayed to the browser.

The temporary sandbox was stopped after evidence capture. No Production deployment, alias promotion, or Production environment mutation occurred.

## Exact-head CI acceptance at code head 55dcf34

Code head:

`55dcf34dce44e8fee93cfb8af8994bbabb9c2041`

Key exact-head results:

- Operator Console CI run `41031355319`: PASS, including 64 unit tests, typecheck, Control Plane Chromium, Activity HUD Chromium, screenshot artifact, and Next.js build.
- HUD-REAL-001 Governed Operational Activity run `41031355332`: PASS, including PostgreSQL 17 migration reapplication, capability/state/safe-evidence verification, and direct-browser PM denial.
- No Placeholder Policy run `41031355272`: PASS.
- Implementation Integrity run `41031355262`: PASS.
- Integrity Governance run `41031355264`: PASS.
- CoMind Repository Configuration run `41031355375`: PASS.
- Lane Health Sentinel Observe run `41031355361`: PASS.

Additional repository-wide workflows were still completing when this evidence file was authored. They are not substituted for the lane-specific acceptance gates above. Final merge readiness must use the final PR head and current workflow results.

## Authority and non-production boundary

Observed, requested, authorized, executed, and verified states remain distinct.

This acceptance authorizes no Production activation. The Test capability is a server-side Test credential, not browser authority. Production credentials, Production database resources, Production aliases, and Production runtime activation were not touched.

## Recovery lesson

The conversation failure itself is operational evidence for CoMind Continuous Excellence. This record preserves the recovery checkpoint, exact repair SHAs, Test migration state, live capability results, deployment-policy behavior, CI run IDs, and non-production boundary so a future conversation can reconstruct HUD-REAL-001 without relying on chat narrative.
