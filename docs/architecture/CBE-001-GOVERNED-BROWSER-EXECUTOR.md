# CBE-001 Governed Browser Executor

Status: implementation started
Production change: false
Issue: #449

## Purpose
CBE supplies a self-hostable browser execution substrate for CoMind. It is not an authority source. L4A, RuleBook, CLEAR, leases, and human authority remain authoritative.

## Flow
CoMind controller -> bounded browser job -> policy/CLEAR -> Playwright worker -> Chromium -> allowlisted target -> redacted evidence.

## Invariants
- Deny navigation outside explicit host allowlists.
- Require HTTPS.
- Bound every job by identity, caller, lease, and timeout.
- Require authority reference and CLEAR approval before consequential browser actions.
- Never emit passwords, cookies, tokens, MFA material, browser storage state, or raw authorization material into canonical evidence.
- Browser UI access never expands caller authority.
- Production activation is excluded from CBE-001.

## Dependency decision
Playwright is the preferred browser library. It supports browser automation scripts and Chromium, supports Node 24, and is Apache-2.0 licensed. Use a stable release, not a canary. Package-manager-generated lockfiles are required; never fabricate dependency lock state.

## Bootstrap
GitHub connector writes establish policy/tests/docs. A real Node execution environment must generate the Playwright dependency lock and install Chromium. GitHub Actions or Codespaces may provide this bootstrap. Once operational, CBE can become the reusable browser execution path for AED-002 and later governed Virtual Employee browser work.

## Acceptance
1. Policy tests pass.
2. Real Playwright/Chromium worker launches in Test.
3. Allowlisted public navigation succeeds and returns bounded redacted evidence.
4. Disallowed navigation is rejected before browser execution.
5. Worker/browser interruption terminates as explicit failed/recoverable state.
6. GitHub/Codespaces job is exercised under existing authority with interactive human authentication when required.
