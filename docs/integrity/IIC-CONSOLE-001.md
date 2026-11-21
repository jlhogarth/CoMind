# IIC-CONSOLE-001 | Test read-only Integrity Projection

Issue #571. Authority T1, reversible repository-only implementation under Development Environment Contract v1.4. No Production activation, grants, secret, schema, paid call, or always-on worker.

## Composition
- Existing Operator Console /integrity server-rendered route with collision-free discovery link in /integrations.
- Canonical repository `config/integrity-registry.v1.json`, read from **exact verified GitHub main commit SHA** through GitHub API, not a locally stale copy.
- Existing GitHub Implementation Integrity workflow runs queried via server-only, fixed `jlhogarth/CoMind` repository URL. A run is eligible only if its `head_sha` equals the exact observed main SHA, `head_branch=main`, `event=push`, the workflow path is canonical and the repository and evidence URL match.
- A successful completed workflow observed within 24 hours of its recorded timestamp is classified **current** for the *workflow result only*. After 24 hours it is stale. Failed, pending, missing, invalid, and unavailable conditions remain explicit.
- Current registry maturity and blocking semantics appear separately, with 24-control completeness and implementation-state sanity checks.
- Explicit display that private RunBook ingestion is **unbound** in this route; no private data is requested and no claim is manufactured. Multi-source graph evaluation is a separate future binding.

## Boundaries
The UI is not a Production deployment-status monitor, canonical authority store, live AED result verifier, agent governance stream, or independently authenticated private evidence reader. The GitHub public read is server-only and never receives a credential or user-supplied URL. The route has no mutations, no public privileged API, no new environment or provider. GitHub public rate limits and outages yield **unavailable** instead of green. Its source time is checked before freshness is calculated. Read refresh is bounded by 60-second Next fetch cache and 5-second HTTP timeout. The Console's existing external access perimeter remains authoritative.

## Collision
AGCOL-003 PR #560 and AED-007 PR #541 both modify the landing page. No landing page, AGCOL, AED, or other source-lane paths are touched. The integration page and new route/model/tests are independently owned.

## Forward impact
The new view may be visible on a currently deployed Console only after separate build/deployment. Its presence does not imply Production activation or security grants. GitHub public API use can consume unauthenticated rate allowance, mitigated by cached fixed-scope requests. Failed or missing external reads cannot create a success claim. Recovery: revert the four changed repository paths.

## Acceptance
Exact-head Console unit tests, typecheck, build, user-interface smoke/CI, IIC/No Placeholder, broad CI. Synthetic tests cover success, source mismatch, stale, failure, pending, unknown/missing, invalid registry, future time, error, and bounded fixed URLs. Real GitHub response readback and final collision checks must be preserved before merge.

## CI failure and repair evidence
First PR head `88428bdd4e0a5dbf95b630bd5dde7090434cefc1` failed the Console Node test runner because the optional `server-only` side-effect import was unavailable. It was removed without introducing a client import or an exposed credential, repair `ff7ec3a16312c78d1b249eae4147b5cbb64f0995`.
The next Console run discovered a separate external dependency shift: GitHub migrated `ubuntu-latest` to Ubuntu 26.04, which the currently locked Playwright 1.56.0 rejected when installing Chromium. Official GitHub documentation confirms `ubuntu-24.04` remains a supported explicit runner label. The Console CI workflow was pinned to Ubuntu 24.04 in `2f0a47cb9775c401ff5b92d00d8ea24d498a89bf`, preserving the Chromium acceptance tests. Operator Console CI run #44938635181 passed, including existing tests, typecheck and build, on that repaired head.

This follow-up adds a route-specific Chromium navigation and source/authority presentation check, so the final exact-head run must be reinspected.
