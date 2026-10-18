# PI-001 isolated Test system proof

## Status

Verified repository and Test acceptance milestone on PR #147 head `0d0155285db497af51745964a08928aea8789686`. PR #147 remains draft, open and unmerged. This is an isolated development/Test proof, not production authorization or live integration.

## Change

Added a bounded read-only RunBook event projection at `/api/pi/events`, an optional lane filter in the opt-in connected reader, and a real end-to-end acceptance test. The test captures synthetic events through the existing Test RunBook function into a fresh PostgreSQL 17 database, then reads them through a restricted database role, local RunBook service, PI gateway and Chromium page. It verifies browser rendering, canonical lane summary update, append-only event retention, RLS/project scope, credential separation, audit redaction, revocation, fail-closed behavior, recovery and no database mutation by reads.

Evidence fields are rendered as text and remain source data. A bounded page is not a complete archive. A stored outcome does not prove current authority or independently verified evidence. PM and Foundry projects remain in separate source domains.

## Verification

All 11 returned exact-head workflows passed on `0d0155285db497af51745964a08928aea8789686`:

- [Primary Interface, run 39168308952](https://github.com/jlhogarth/CoMind/actions/runs/39168308952), including PostgreSQL capture, reader, gateway, browser proof, and artifact upload.
- [DRB-002 Query Contract, run 39168308948](https://github.com/jlhogarth/CoMind/actions/runs/39168308948).
- [Main CI, run 39168308973](https://github.com/jlhogarth/CoMind/actions/runs/39168308973).
- [No Placeholder Policy, run 39168308951](https://github.com/jlhogarth/CoMind/actions/runs/39168308951).
- The other seven returned workflows also completed successfully.

Primary Interface uploaded `drb-test-system-evidence` with acceptance JSON and a browser screenshot, retained through 2026-11-01 21:33 UTC. CI uses a fresh disposable service and destroys it after the job.

Local TypeScript build passed. Local complete server suite: 211 passed, 8 database-dependent skips. Local PI contract suite: 51 passed. Focused PI gateway, DRB query and security tests: 22 passed.

## Failure and correction

The first candidate `0b4309967840c89f2616656b2bfa75dd2d41f747` failed at actual RunBook capture because fixture source category `isolated-e2e` violates the repository `pm_events.source_system` check constraint. The fixture was changed to the existing `manual` category. A regression check now attempts an unsupported category and verifies both the expected check-constraint error and unchanged event count. The failed attempt only affected its disposable CI database, which was torn down by the job.

## Authority and limitations

Synthetic data and generated temporary Test identities only. No live Supabase or RunBook access, production database mutation or grant, paid provider, deployed service, production login issuer, independent security review, or activation occurred. The proof does not establish host/TLS deployment readiness, backup recovery, full CoMind acceptance, or a unified PI/PM/Foundry project crosswalk.

## Dependency readback

- #143 head `d889f2395648af90bb0b8235c43226168d2c4534`, still draft and based on BRAND #139.
- #139 head `c5fc5d8bfd818a3feb22f5585bde93059a255658`, still draft.
- #145 head `19b7cf8ad9e38dc1f6738925b6f7b4a09f09359a`; only `docs/runbook/DRB-002.md` differs from integrated runtime `5331d4e`.
- #119 head `f831b89e405351cbdbaaaf113f291f7a56d72215`, still separate and untouched.

No predecessor PR was merged or retargeted. Resume with current remote heads before further changes.
