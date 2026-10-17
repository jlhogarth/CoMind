# PI-001 human attention and navigation 002

Date: 2026-10-17. Owner: PI-001 development lane. Human owner: Joseph Hogarth.
Issue #142 / draft PR #143. T1 bounded additive repository development, authorized by Joseph's continuation prompt. Proposed AIMS/NIST human oversight and provenance mapping; no conformity claim. No agent identity, live resource, database, credential or authority changed. BRAND visual substrate and OC-002 implementation preserved.

Remote initial readback: PI head `041ed219024cf540997cbe32ae676215c024cfe6`, BRAND head `c5fc5d8bfd818a3feb22f5585bde93059a255658`, OC head `f831b89e405351cbdbaaaf113f291f7a56d72215`. All returned exact-head checks successful, all PRs draft/unmerged, mergeability clean. No pending failures remained from the prior implementation readback. This does not establish production acceptance.

Added a read-only browser renderer, hash-based entity navigation, filters/history, source coverage/observation time, assessment details, evidence and RunBook references, disabled decisions, keyboard/skip/focus behavior and canonical source inspection map. Default entry point has no source records or network calls. DOM textContent prevents source text from becoming markup. Source refs do not become arbitrary external links. Missing/duplicate source identifiers block reliable counts instead of silently discarding rows. Count scope is the supplied filtered snapshot.

Validation executed locally: 26 Node contract/routing tests passed; brand static validator passed all five checks; no-placeholder policy passed; JavaScript syntax and diff whitespace checks passed. Browser proof added for CI, using synthetic fixtures only and no production package dependency.

Local browser failure: Chromium executable absent. Attempted Playwright installation returned truncated/invalid ZIP data. Did not weaken browser assertions or claim browser acceptance. Bounded recovery: run same browser proof in GitHub CI with pinned isolated test tooling. Exact-head CI must be inspected after publication; browser success remains pending.

Source discovery establishes existing Foundry requests/decisions and PM/RunBook registries. It does not establish a safe complete PI projection or independently verify live DB contents. `apps/primary-interface/docs/SOURCE-MAP.md` records exact candidate sources, gaps and responsible integration owners. No new registry, SQL migration, source adapter or browser access grant created.

Recovery: revert this PI-only change. No database rollback needed. Browser render/filter work is linear in supplied snapshot size; future server projection needs bounded pagination. No production runtime dependency or paid commitment. Test-only browser tooling adds CI installation time. Continuation: `apps/primary-interface/CONTINUE.md`.
