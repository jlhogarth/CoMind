# HOME-002 Now Composer Provenance

Date: 2026-10-30
Issue: #366
Branch: `home-002-implementation`
HOME-001 accepted baseline: `73c69419535b6901f84b158f8a1dff7c242b1244`
Production activation: excluded

## Recovery and lane lease

HOME-002 began after a conversation-level timeout had already demonstrated why durable development evidence must outrank chat continuity.

The accepted HOME-001 architecture in repository evidence was used as the authoritative successor definition. Its recommended sequence assigns HOME-002 to the server-side read model and `Now` composer, while HOME-003 owns the later shell/navigation and Now UI.

## Preserved process failures

Three process failures occurred before implementation authorization and are intentionally preserved:

1. `home-002-implementation` was created before the required fresh collision scan completed. It contained no implementation commits and pointed exactly to current `main`, so it remained inert until the scan authorized its use.
2. Issue #366 was initially created with a temporary body. This violated No Placeholder. The body was immediately replaced with a truthful recovery hold before code implementation began, and later replaced with the complete HOME-002 contract.
3. A malformed GitHub `update_file` request was rejected with HTTP 409. No repository file changed.

No failure is represented as successful execution.

## Fresh collision scan

Current `main` at the completed scan was:

`73c69419535b6901f84b158f8a1dff7c242b1244`

This is the HOME-001 merge commit.

### Active ownership reviewed

- CE-003 #364 explicitly excludes Operator Console/Home presentation ownership.
- RLIB-002 #362 explicitly excludes Operator Console UI and reserves later Home/Library projection for a separate Console lane.
- MDO-002 #316 / PR #334 owns provider-neutral planning execution and Foundry integration.
- VE-STD-001 PR #355 is documentation/governance only.
- IIC-005 PR #357 and successor integrity lanes own detector/registry semantics.
- DEP-001 #294 / DEP-C01 #297 own deployment, authentication, hostname health, rollback, and Production acceptance.
- BRAND-001 #138 / PR #139 owns the reusable brand runtime under `brand/`.
- PI-001 #142 / PR #143 is an older stacked Primary Interface prototype outside current Operator Console main ownership.
- OC-002 #118 / PR #119 is materially stale and currently unmergeable. Its changed paths include the Operator Console landing page, global CSS, package/runtime files, schema/admin APIs, and administrative support files.

### Collision disposition

HOME-002 avoids:

- `page.tsx`;
- `globals.css` and presentation CSS;
- admin/schema routes;
- deployment configuration;
- Cloudflare and Vercel configuration;
- database migrations and grants;
- CE-003 scan semantics;
- RLIB intake;
- MDO execution;
- VE lifecycle;
- Implementation Integrity maturity.

HOME-002 uses additive Home library/API paths and one bounded refactor of the existing Activity server reader so the accepted HUD gateway is reused instead of copied.

## Reuse-before-reinvention result

The current Operator Console already contained two accepted Home-relevant server read paths:

1. Activity HUD server gateway using `operator_console_activity_feed`, a server-only capability, a 1,000-row hard bound, and Test-project assertion.
2. Continuous Excellence trusted-perimeter operator projections through the existing CE server client and summary service.

HOME-002 reuses both.

The accepted HOME-001 contract also lists Foundry authorization requests and cost alerts as `Now` sources. Repository evidence confirms those source substrates exist, but HOME-002 found no accepted Home-safe read adapter. The implementation therefore reports those source families as unavailable with `adapter_not_registered` rather than widening access or converting missing coverage to zero.

Continuity is represented only through fields already present in the accepted CE operator summary. No capsule detail is invented.

## Implementation

Repository changes implement:

- reusable `src/lib/activity-hud/server.ts`;
- existing `/api/activity` routed through that reader without changing its public contract;
- `src/lib/home/now-model.ts` for bounded response and candidate semantics;
- `src/lib/home/now-service.ts` for source composition and coverage accounting;
- `src/lib/home/server.ts` for accepted source wiring;
- `/api/home/now` as a no-store same-origin server route;
- deterministic unit and API tests;
- dedicated HOME-002 CI;
- HOME-002 architecture documentation.

No persistence object is introduced.

## Acceptance intent

Exact-head acceptance must establish:

- HOME-001 manifest validator green;
- Activity route regression green after the reuse refactor;
- material operational states mapped deterministically;
- terminal success and synthetic rows excluded from attention;
- CE and continuity represented only as aggregate source-backed candidates;
- source failures redacted and surfaced as unavailable coverage;
- approval and cost adapters visibly unregistered rather than zero;
- all registered source failure produces an unavailable read model and HTTP 503;
- candidate output hard-bounded to 50;
- stable ordering independent of input order;
- Operator Console unit tests, typecheck, build, No Placeholder, Implementation Integrity, and relevant broad CI green;
- final collision/freshness check before merge.

## Security and authority

No browser privileged credential, new database role/grant, Production mutation, paid provider call, VE authority change, or deployment change is part of HOME-002.

The existing Activity capability and CE secret remain server-only.

## Recovery

Revert HOME-002 repository commits. No live-state rollback is expected because HOME-002 changes repository code and tests only.
