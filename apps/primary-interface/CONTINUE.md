# CoMind Continue PI-001 Operator Cockpit Development

OPERATING MODE: VISIBLE AUTONOMOUS DEVELOPMENT

Continue https://github.com/jlhogarth/CoMind/issues/142 on branch `issue-142-primary-interface-foundation`. Read AGENTS.md, `apps/primary-interface/README.md`, and `docs/provenance/2026-10-17-primary-interface-foundation.md` first. Inspect current branch/PR heads and CI before edits; do not assume frozen remote state.

Joseph accepted PI-001 product/interface architecture, not production acceptance. Accepted transition is `201481fd2974f0f921d73c9e81ef7be959a4d270`. BRAND-001 #138 / draft PR #139 remains visual/runtime substrate. Its expanded description is reconciled; validator repair is `c5fc5d8bfd818a3feb22f5585bde93059a255658`. PI has its own stacked branch and PR targeting BRAND until that dependency is accepted and merged. OC-002 #118 / draft PR #119 is separate; do not overwrite, duplicate or inherit its live authority.

Implemented: scope/backlog and ownership, reserved entity routes, human-action projection, pure evidence/freshness assessment, 24 synthetic local tests, PI CI. No operational browser or live integration is claimed. Existing brand cockpit mock remains a design fixture. Proposed cockpit SQL is not deployable acceptance evidence.

Next: read back exact-head CI and remediate failures. Implement read-only human-action detail, accessible keyboard navigation, deep links/back history, source inspection and explicit unavailable states. Discover actual canonical decision/RunBook/Foundry projections before selecting adapters. Continue P0 order: attention, navigation, lanes, VE operations, RunBook, evidence. Keep P1/P2/P3 backlog in README.

Supabase is transactional control plane; SDN is high-volume cognitive/evidence data plane. Every claim needs inspectable source/time; registered does not mean running; approval does not execute work. Future server decisions require identity, exact authority, revision/evidence revalidation, idempotent durable audit/RunBook recording. No browser secret/service-role credential. T1 repository work only: no production/database/security activation, destructive mutation, paid commitment or expanded authority.

No Hallucinations. No Lies. No delegated work should disappear silently. Report STATUS / CHANGED / WHY / IMPACT / VERIFIED / OPEN / NEXT, and JOSEPH only for required action. Refresh this file after material state changes.

## Human Attention and Navigation 002 checkpoint

Implemented read-only static browser view (`index.html`, `src/cockpit.mjs`, `src/navigation.mjs`) and source map (`docs/SOURCE-MAP.md`). Default browser contains no operational records and explicitly reports missing source integration. All decisions disabled. Hash entity deep links, query filters, native history, keyboard focus, skip link, evidence/RunBook references and supporting-record counts implemented. No live adapter chosen, because canonical source inspection found unresolved projection joins/revision/freshness requirements and private source boundaries.

Local contract/routing validation: 26 passed. Brand static and no-marker validators passed. Browser proof added with isolated pinned Playwright tooling in PI CI. Local Chromium installation failed because the download returned an invalid/truncated archive. Browser acceptance remains pending until exact-head CI executes the proof. Do not report browser success based on static or Node tests.

Before this slice, remote readback confirmed all returned checks passed on PI `041ed219024cf540997cbe32ae676215c024cfe6`, BRAND `c5fc5d8bfd818a3feb22f5585bde93059a255658`, and OC `f831b89e405351cbdbaaaf113f291f7a56d72215`. All three PRs remain draft, unmerged and cleanly mergeable at that readback. Read current heads again. Keep #143 stacked on #139 until accepted merge. No OC files changed.

Next: finish browser CI proof and repair any failure; verify mobile rendering and unavailable/partial/forbidden/malformed source behavior; then specify a reviewed trusted-server canonical projection before implementing live source integration. P0 lanes/VE/RunBook adapters remain open. No production activation or security expansion.
