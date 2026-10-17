# PI-001 scope and human attention foundation

Date: 2026-10-17. Owner: PI-001 development lane; human product owner: Joseph Hogarth.
Issue: https://github.com/jlhogarth/CoMind/issues/142
Accepted transition: `201481fd2974f0f921d73c9e81ef7be959a4d270`.

## Evidence and changes

Read repository AGENTS.md, BRAND-001 #138 / PR #139 metadata and branch diff, OC-002 PR #119 metadata, the cockpit prototype and proposed SQL, and existing VE dashboard roadmap references. PI-001 issue search returned no existing item; created #142 before implementation.

PR #139 had 23 commits/18 files but described a one-commit CSS-only foundation. Replaced its title/body with actual scope and explicit ownership, fixture, SQL and acceptance boundaries. OC-002 metadata reports database live evidence and an outstanding real runtime deployment boundary; this lane did not independently reverify its database claims.

Added product boundary, ordered backlog, stable entity route contract, human-action projection, future server decision protocol, dependency-free assessment module, synthetic negative-path tests and dedicated CI. Existing brand prototype and OC-002 application are preserved.

## Failure and bounded recovery

Brand static validation failed because `comind-brand.css` imports `mode-native.css` while the required import set omitted it. Added the file to required assets, expected imports and remote-dependency checks on BRAND-001. Local validator then passed all five checks. Published repair through the GitHub connector after shell push failed for lack of configured GitHub credentials. No credentials were requested, copied or exposed. Published BRAND repair: `c5fc5d8bfd818a3feb22f5585bde93059a255658`.

## Executed validation

- `node --test apps/primary-interface/test/*.test.mjs`: 24 passed, zero failed on Node 24.19.0.
- Negative cases include absent authority, missing history/provenance/revision, unverified/conflicting evidence, exact expiry boundary, future/invalid/impossible times, inverted intervals, duplicate evidence and invalid lifecycle/input.
- Input immutability, deterministic projection, encoded entity routes and all closed states verified.
- `python brand/validate_runtime.py`: all five checks passed after repair.
- `node --check brand/lab.js`: passed.

Exact-head remote CI must be separately read back. No browser rendering, production deployment, live database connection, SQL execution, RLS proof or live decision recording is claimed by these tests. Assessment is presentation logic only, not authentication, authorization or evidence-truth verification.

## Governance and next boundary

T1 additive repository work. AGENTS.md GOV-001 scope/evidence/recovery and proposed AIMS human oversight/provenance mapping apply; no certification claim. No live resources or agent identities altered. No paid commitment. PI files can be reverted independently; BRAND repair belongs to its existing branch. Stack PI PR on BRAND branch, then reconcile and retarget after BRAND acceptance.

Next: implement read-only human-action detail and keyboard/history navigation using this contract, discover canonical source projections before integration, then proceed through P0 lanes/VE/RunBook/evidence. Missing source data remains explicit and must not be replaced with invented operational records.
