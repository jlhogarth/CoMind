# CDT-PRISM-001 synthetic source-to-view eligibility proof

Issue: #580. Governance: GOV-001 T1 reversible development. Environment: local synthetic Test only. Production activation: false.

## Scope and owners

The pure function in `scripts/prism_001_synthetic_view.mjs` consumes the existing HAI-009 `ATLAS_RELEASE` reference and verifies its SHA-256 identity with HAI's `sha256Object`. It checks a fictional source candidate against a synthetic subject, speaker, purpose, mock grant, time interval, literal value, source digest, and the frozen HAI current-value/provenance map. It returns only eligible current items or explicitly labeled historical items. It has no database, provider, network, route, filesystem write, action, or real participant path.

The local `mockOnly` grant is deliberately rejected unless marked as a fixture. It is **not** a PM consent grant or a RuleBook decision. `epistemicStatus` is a synthetic input label, not a GER-005 decision. This code does not promote inferred assertions, certify identity, or implement actual consent or erasure. Conversation History retains ownership of real source records; GER-005 #382 retains assertion-promotion ownership; HAI-009 #408 retains its frozen protocol and scoring; PM/RuleBook retain real use authority.

The historical old-date source reference `src:atlas:01` is a synthetic test assumption for the adapter. HAI-009 itself specifies the old value and superseded item ID but does not certify that reference as the originating historical span. No real source attribution follows from the test.

## Acceptance map

| PRISM case | Adapted local oracle | Limit |
| --- | --- | --- |
| T-ID-002 | Assistant utterance excluded | Synthetic role label, not live attribution |
| T-ID-003 | Different subject excluded | No proof of same-name disambiguation in live identity |
| T-EPI-004 | Simulated candidate excluded | No GER promotion or action path exercised |
| T-TMP-001 | Superseded old value excluded from current; labeled in historical as-of | No live bitemporal DB proof |
| T-CNS-001 | Expired and revoked mock grant deny | No live PM consent decision |
| T-PRV-002 | Other subject excluded | No real third-party permission proof |
| T-SIM-003 | Simulated candidate cannot enter pure view | No storage write path exists to test |
| T-SRC-005 | Wrong or absent expected source and tampered digest excluded | No certified real quotation span |

Positive correction, manifest tamper, future as-of, duplicate source IDs, ambiguous current item, wrong purpose, wrong subject, and exact replay are also tested. Existing HAI-009 tests are run without modifying HAI-009. A passing result demonstrates only this synthetic function's rules on constructed fixtures. The remaining PRISM catalog is unexecuted by this lane.

## Reproduction and failure record

Run from repository root with Node 24:

`node --test server/test/prism-001-synthetic-view.test.mjs server/test/hai-009-continuity-pilot.test.mjs`

First local run: HAI 15 passed, PRISM 6 failed because initial synthetic-only source-ref validation rejected HAI's own `src:atlas:NN` fixture identifiers. The validator was narrowed to permit that exact fixture namespace; the rerun passed 21 of 21. This preserves the failure and correction rather than claiming the first run succeeded.

No Supabase RLS, live consent, source certification, GER-005 promotion, persistent Twin projection, erasure, provider inference, real participant study, or Production behavior is demonstrated. Future work must coordinate with each owner and recheck current main, issue/branch/PR collisions, and current Test grants before integration.

Sources: [Phase 0 reconciliation](https://docs.google.com/document/d/1BxLKC9yJXsYmYOUO6JE3UttykrrgHW-UuFxxfB9rweE/edit), [HAI-009 issue](https://github.com/jlhogarth/CoMind/issues/408), [GER-005 issue](https://github.com/jlhogarth/CoMind/issues/382), [PRISM catalog](https://docs.google.com/document/d/1gqUY7MhyxZcCbJ0-bgBzHyDiWbNlLMxfdp9DRmaWb-I/edit).
