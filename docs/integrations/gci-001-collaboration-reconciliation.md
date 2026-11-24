# GCI-001 | Gemini Bridge collaboration reconciliation
Date: 2026-11-09. Authority: L4A bounded development, CoMind Test. Issue #544; draft PR #545.

## Verified source inventory

- **Legacy CM-XAI exchange (2026-11-03)**: Google Doc `1T2pSlnnLysrUagxLiXm2sWp7K_gHsa1FUl97eiKx5G0`. The doc contains `CM-XAI-001 | CHATGPT` and `CM-XAI-PROTOCOL-002 | CHATGPT`, with an instruction *requesting* Gemini to append `CM-XAI-002`. On 2026-11-09 readback there was **no confirmed completed CM-XAI-002 response**. Protocol is human-mediated and explicitly prohibits assuming background monitoring. Four-cycle upper bound and human-governed stopping conditions remain.
- **GCI-001 isolated synthetic acceptance document (2026-11-07)**: `1dJEOjmLPm9gdw8xsVF8J_dyPK0HDx5N5RmW0ID42cnE`. Contains one completed `COMIND_EXCHANGE` with session `gci_smoke_20261107` and exchange `question0001`. Owner-only on last Google Drive readback, **not yet live**.
- **Specifications (read-only)**: GCI-001 Architecture `1kzwoIvy3ZJMbuA2DwMx74pDJ2LyGG7BJsNgrxB6TdDI`; GCI-002 Protocol `17AQSjG5OW7yqVQe5gqSzZdFZeqcoHEXNMtMaBDvCLx0`; GCI-003 RunBook `1bIEYHSU_IDxWAHaEY-P3tu7gw9Az-S2_3UKfGJ-wBjI`; GCI-004 Flow Diagram `1HaUQoYrMWxc3LGGxB4aXAbOGfVeO8T4KWPRQm5_I1Tg`.
- Full indexed set: `docs/integrations/gci-001-collaboration-registry.json`. File references remain stable: no moves, destructive rewrites or retroactive turns.

## Reconciliation decisions

1. **One owner / one implementation**: GCI-001 issue #544, branch `gci-001-on-demand-gemini-review`, draft PR #545. The second Gemini Bridge conversation's conceptual contribution is incorporated here. No separate GitHub execution lane.
2. **Two protocol generations, not one interchangeable marker**:
   - `CM-XAI-001`, `CM-XAI-002` etc. are *human review turn labels*. They are historical/provenance anchors, not completed machine envelopes. The old doc includes instructions for manual Gemini action, not authorization for billable replay.
   - `[COMIND_EXCHANGE_START id=... role=CHATGPT session=...]` + matching `[COMIND_EXCHANGE_COMPLETE id=...]` are current GCI machine-eligible records. The source GCI-002 specification also calls for SHA-256 validation, version-aware writes, durable ledger and explicit scope. Initial prototype implements only the simpler marker grammar and Google Doc claim/reply marker, so its remaining deficits are tracked below.
   - **No automatic conversion or replay** of `CM-XAI` historical turns. A future bridge request requires a *fresh, separately approved COMIND exchange* with a unique ID and explicit document/session permission. Preserve original turn references as citations, not Gemini prompt instructions.
3. **Fail-closed allowlist**: Runtime now requires an exact registered `document_id` **and** `session_id` with `mode=test_dispatch_allowed`. Legacy collaboration and specification documents are read-only and cannot trigger Gemini even if passed as workflow input. The only registered live candidate is the isolated synthetic acceptance document.
4. **Existing review scope**: Original CM-XAI document is a bounded AED and Work-credit review. Its manual protocol and four-cycle limit remain. CoMind Gemini Bridge does not silently convert that conversation into unlimited model turns.
5. **Separation of concerns**: The bridge automates the Gemini API call and Google Doc result; it **does not automatically awaken dormant ChatGPT**. The existing hourly Gemini Review Watch remains unchanged until an evidence-backed cutover decision.

## Canonical process

Joseph authorizes one bounded test/session -> existing GitHub Action dispatch under scoped OIDC identity -> fetch only registered Google Doc -> identify new complete eligible ChatGPT envelope -> append a claim BEFORE API call -> send only scoped exchange body to Gemini -> append one Gemini reply and correlation marker -> verify actual readback -> log usage, duration and hashes -> stop after 240 seconds of *meaningful* inactivity with no pending processing. Human/active ChatGPT later reads and reviews the reply.

For future legacy-origin reviews, create a **new** authorized machine envelope in a **designated** collaboration document, with reference to a source `CM-XAI-###` turn and with privacy classification and cycle count checked. Do **not** bulk-copy original AED/credit prompts into Gemini without explicit approval.

## Remaining acceptance gaps (not silently waived)

- WIF not activated/verified, actual service-account identity and document editor grant unknown; GitHub variables absent at last inspection.
- GitHub `workflow_dispatch` workflow is not on default branch. Deploying it to `main` requires an explicit, reviewed non-Production registration mechanism.
- Actual Gemini key validity and model entitlements unverified; no live API or wall-clock shutdown test.
- Current claim-before-call protects against duplicate *restarts* but is not a transactional exactly-once guarantee. An orphaned claim requires manual reconciliation. No atomic lease or canonical exchange table yet.
- Strict parser signature and expected SHA-256 verification from GCI-002, settling delay, document revision-conditional append, cost ceilings and delivery readback remain implementation gaps.
- Generic document metadata/version changes can occur during unrelated edits; do not treat them as authorization.
- Existing hourly Review Watch is independent and not replaced.

## Evidence and review

Read-back source: existing Google Docs metadata/content and GitHub PR #545 on 2026-11-09.
Do not invent any CM-XAI-002 contribution or claim the Gemini bridge is deployed.
Run CI, record job run ID and commit; do not merge as accepted until live tests and authority gate are satisfied.
