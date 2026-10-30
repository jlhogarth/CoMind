# CUX-002 Usability Defect Register and Acceptance Evidence

Date: 2026-10-30  
Browsers: Chromium, Firefox, WebKit  
Authority: presentation/accessibility remediation only  
Issue: #324  
PR: #335

## Development Environment Contract basis

CUX-002 follows CoMind Development Environment Contract v1.0. The lane performed collision and freshness review before implementation, reused the existing CUX-001 Playwright/Foundry substrate, kept changes reversible and presentation-scoped, preserved failure and correction evidence, and required exact-head browser evidence before any acceptance claim.

Production, Cloudflare Access, Vercel security, database authority, RuleBook governance semantics, and paid-provider authority remain outside CUX-002.

## Freshness correction

The first planning pass used the original CUX-001 artifact as the apparent baseline. That artifact became stale after DRULE-004 added the protected RuleBook conversation-governance panel.

The freshness review therefore superseded the original CUX-001 counts as the canonical pre-CUX-002 baseline. The correct baseline is the accepted DRULE-004 candidate:

- PR: #329
- exact head: `a0a40392a934c26ab780f35fa354220e953c7483`
- CUX workflow run: `40957333103`
- browser engines: Chromium, Firefox, WebKit
- execution limitations: 0

The older CUX-001 counts remain historical evidence but are not used to calculate CUX-002 improvement.

## Canonical pre-remediation baseline

Across the accepted DRULE-004 Chromium, Firefox, and WebKit artifacts:

| Family | Raw observations | Primary routes |
|---|---:|---|
| Readability below 12px review baseline | 1,104 | `/`, `/activity`, `/rulebook` |
| Mobile target below 44x44px preference | 358 | `/`, `/activity`, `/rulebook` |
| Missing accessible control name | 21 | `/activity` |
| RuleBook fail-closed browser-console observation | 14 | `/rulebook` |
| Total | 1,497 | all reviewed routes |

The 1,497 observations repeat the same defect families across browsers and viewports. They are not 1,497 independent product defects.

The 14 RuleBook browser-console observations are expected in the CUX CI environment. DRULE-004 intentionally returns HTTP 503 when protected RuleBook operator controls do not have trusted server runtime configuration. CUX-002 must not suppress or weaken that fail-closed behavior merely to reduce a usability count.

## Canonical defect families

### CUX2-READ-01: operator microcopy below readable baseline

Observed operator-critical text used 8px, 9px, 10px, and 11px styles for state labels, metadata, filters, evidence details, freshness text, pagination, navigation, and explanatory copy.

Remediation:
- raise reviewed HUD microcopy to at least 12px;
- keep primary phone control text at 13px where practical;
- raise targeted landing-page microcopy through stable semantic selectors;
- preserve hierarchy, technical precision, density, and wrapping.

### CUX2-TOUCH-01: Activity phone controls below preferred target

Affected families included Refresh, Export, search, state/source/owner/result/age/sort filters, rows-per-page, and First/Previous/Next/Last pagination.

Remediation:
- 44px minimum phone control height;
- 44px minimum pagination button width;
- explicit 844x390 phone-landscape coverage;
- preserve compact desktop sizing.

### CUX2-TOUCH-02: RuleBook phone controls below preferred target

Affected families included Refresh, Export, Search, Health, and Original disposition.

Remediation:
- 44px minimum phone control height;
- visible labels remain attached to native controls;
- preserve keyboard focus visibility;
- explicit phone-landscape sizing.

### CUX2-NAV-01: phone navigation targets

Activity and RuleBook active navigation links rendered below 44px. The Control Plane navigation measured 43px.

Remediation:
- 44px phone minimum for HUD active navigation;
- close the Control Plane one-pixel target gap without changing information architecture;
- restore readable CoMind branding at tablet/phone-landscape widths.

### CUX2-A11Y-01: Activity search accessible name

The 21 raw observations all traced to the same underlying Activity search input.

Remediation:
- add source-level `aria-label="Search activities"`;
- mark the decorative Search icon `aria-hidden="true"`;
- do not depend on placeholder text or generated CSS content.

### CUX2-MOBILE-01: RuleBook summary density

Human screenshot review showed that four RuleBook summary cards created an unnecessarily tall first-screen stack on narrow phones and pushed filters below the immediate working context.

Remediation:
- compact the four metrics to a 2x2 phone summary;
- preserve all four metrics;
- do not hide or collapse governance state.

## Implementation architecture

The primary presentation remediation is an additive `apps/operator-console/src/app/cux-002.css` layer imported after the existing Console styles. This minimizes shared-file churn, keeps rollback simple, and preserves the accepted HUD and RuleBook semantics.

The only semantic source change is the Activity search accessible name. Comparison of that commit against its parent showed exactly one file changed with one added line and two replaced lines. No Activity data, filtering, pagination, source evidence, or governance behavior changed.

## First measured slice

PR #335 head `5da7f94555dd219cef5f5239c11ba1ea60dee4e0` completed all three browser engines successfully.

Compared with the fresh DRULE-004 baseline:

| Family | Baseline | First slice | Reduction |
|---|---:|---:|---:|
| Readability | 1,104 | 465 | 639, 57.9% |
| Mobile touch target | 358 | 97 | 261, 72.9% |
| Accessible control name | 21 | 21 | 0 |
| Expected RuleBook console observation | 14 | 14 | 0, intentionally preserved |
| Total | 1,497 | 597 | 900, 60.1% |

This intermediate result was preserved rather than skipped. It proved the additive presentation layer materially improved the Console and identified the remaining landscape and semantic-label work.

## Final machine verification

Exact implementation head before this evidence-only update:

`20e6c6ef2fd29bdafeda156a635a54597a9d3826`

CUX workflow run:

`41006258377`

Results across Chromium, Firefox, and WebKit:

- 21 browser/profile runs completed;
- 0 execution limitations;
- 0 blocker findings;
- 0 readability findings;
- 0 mobile touch-target findings;
- 0 accessible-control-name findings;
- 14 browser-console observations, all on `/rulebook`, matching the intentional fail-closed protected-control unavailable state already present in the accepted DRULE-004 baseline.

Therefore every machine-detected finding inside CUX-002's remediation authority was reduced to zero without suppressing or weakening the protected RuleBook security boundary.

## Integrity and neighboring checks

During development:

- Implementation Integrity / NDT-001 shadow scan passed on the CUX-002 branch;
- CUX Foundry adapter/dispatch contract remained green;
- Operator Console unit tests and TypeScript typecheck passed after the Activity source change;
- exact-head full repository and Operator Console completion remain required after this evidence commit because the Development Contract requires verification of the final head, not merely an earlier implementation head.

## Human acceptance boundary

Machine acceptance does not establish final usability acceptance.

Joseph and Lisa remain the final human usability authorities for:

- whether the information hierarchy feels natural;
- whether terminology is understandable;
- whether mobile density is useful rather than merely technically compliant;
- whether RuleBook, Activity, and Control Plane workflows feel coherent in real use.

The repository remediation can be engineering-ready while human usability acceptance remains pending.

## Recovery

Rollback is limited to reverting the CUX-002 PR. No database, auth, deployment, security-policy, or Production rollback is required.

## Boundaries preserved

- no RuleBook governance-semantic change;
- no database/schema change;
- no authentication or Cloudflare/Vercel change;
- no Production activation;
- no paid provider;
- no destructive action;
- no weakening of the intentional RuleBook unavailable state;
- no final human usability acceptance claimed without Joseph/Lisa review.
