# CUX-002 Usability Defect Register

Date: 2026-10-30  
Source: CUX-001 deterministic browser evidence  
Browsers: Chromium, Firefox, WebKit  
Authority: presentation/accessibility remediation only

## Baseline

The combined CUX-001 evidence contains 1,408 raw findings across three browser engines and the configured viewport matrix. These are repeated observations, not 1,408 unique defects.

| Family | Raw observations | Primary routes | CUX-002 disposition |
|---|---:|---|---|
| Readability below 12px review baseline | 1,041 | `/`, `/activity`, `/rulebook` | Remediate HUD typography first; landing-page microcopy second |
| Mobile target below 44x44px preference | 346 | `/`, `/activity`, `/rulebook` | Remediate primary phone controls and navigation |
| Missing accessible control name | 21 | `/activity` | One underlying Activity search field defect |
| RuleBook first-screen density | Human visual finding | `/rulebook` | Compact four summary cards to 2x2 on phone widths |

## Route concentration

| Route | Readability | Touch target | Accessible name |
|---|---:|---:|---:|
| `/` | 378 | 96 | 0 |
| `/activity` | 504 | 179 | 21 |
| `/rulebook` | 159 | 71 | 0 |

## Canonical defect families

### CUX2-READ-01: HUD microcopy below readable baseline

Observed operator-critical text uses 8px, 9px, 10px, and 11px styles for state labels, metadata, filters, evidence details, freshness text, pagination, and explanatory copy.

Remediation:
- raise HUD microcopy to at least 12px;
- keep primary phone controls at 13px where practical;
- preserve hierarchy, technical precision, density, and wrapping.

Acceptance:
- no new page-level horizontal overflow;
- major readability finding count materially decreases;
- desktop remains operationally dense.

### CUX2-TOUCH-01: Activity phone controls below preferred target

Affected families include Refresh, Export, search, state/source/owner/result/age/sort filters, rows-per-page, and First/Previous/Next/Last pagination.

Remediation:
- 44px minimum phone control height;
- 44px minimum pagination button width;
- preserve compact desktop sizing.

### CUX2-TOUCH-02: RuleBook phone controls below preferred target

Affected families include Refresh, Export, Search, Health, and Original disposition.

Remediation:
- 44px minimum phone control height;
- visible labels remain attached to native controls;
- preserve keyboard focus visibility.

### CUX2-NAV-01: phone navigation targets

Activity and RuleBook active navigation links render below 44px. The Control Plane side navigation measures 43px.

Remediation:
- 44px phone minimum for active HUD navigation;
- close the Control Plane one-pixel target gap without changing information architecture.

### CUX2-A11Y-01: Activity search accessible name

CUA reports 21 observations across browser/profile runs, but all map to the same underlying search input.

Remediation:
- provide an explicit semantic accessible name in the Activity component;
- do not depend on placeholder text or CSS-generated content.

### CUX2-MOBILE-01: RuleBook summary density

The four RuleBook summary cards form an unnecessarily tall first-screen stack on narrow phones and push primary filters below the immediate working context.

Remediation:
- use a compact 2x2 phone summary;
- preserve all four metrics;
- do not hide or collapse governance state.

## Sequencing

1. Additive responsive presentation layer for HUD readability, touch targets, navigation, and RuleBook summary density.
2. Rerun CUA on Chromium, Firefox, and WebKit and compare exact counts.
3. Repair the Activity search semantic label in source.
4. Address residual landing-page microcopy without broad visual redesign.
5. Human review by Joseph and Lisa.
6. Convert accepted patterns into reusable Console standards.

## Boundaries

- no RuleBook governance-semantic change;
- no database/schema change;
- no authentication or Cloudflare/Vercel change;
- no Production activation;
- no paid provider;
- no destructive action;
- no acceptance claim without exact-head evidence.
