# WEB-001 Visitor Curiosity, PTSD/SOAP and CRIS reuse checkpoint

Date: 2026-11-09. Environment: CoMind Test. Owner: WEB-001, existing issue #542 / PR #543. No Production authorization.

## Verified database readback
Connected Supabase project `sbgfuanxiqepcoboxzcl` has private `comind.cm_soap_case`, `comind.cm_soap_entry`, `comind.cm_cris_theory`, `comind.cm_cris_tier`, `comind.cm_cris_mapping`, and `comind.cm_memory_node`. This was verified through information_schema, not inferred from a historical design. No `visitor` or `consent` named base table was returned by the targeted information_schema inspection. This is not proof that no alternative consent infrastructure exists; inspect all schemas and contracts before adding one.

SOAP case fields include case_id, subject, context, status, created_by and timestamps. SOAP entry fields include entry_id, case_id, subjective, objective, assessment, plan, tags, confidence and created_at. CRIS mapping has theory_id, tier_id, mapping JSON, confidence and timestamps. These are structural reuse candidates only.

## Bounded reuse architecture
1. Public visitor drafts remain local unless the visitor expressly opts in. Never write PTSD clinical/reflection records into a public contribution pipeline.
2. A future private visitor-contribution ingress must capture a minimized approved question, purpose-specific consent version, provenance, retention and withdrawal capability. Require input length limits, rate limiting, abuse protection and privacy review.
3. A private, least-privilege ingestion process may project approved nonclinical contributions into a **separate** SOAP-compatible research case, with subjective = user question, objective = verified references only, assessment = clearly labeled interpretation, plan = review proposal. Do not confuse subjective claims with verified observations.
4. CRIS/ARIS may generate candidate cross-topic mappings with evidence and confidence. Require human review before publication or Idea Nursery routing. Do not use clinical records to infer public interests.
5. Never put service-role secrets into the public website or enable public read access to private SOAP/CRIS records. Require RLS/access-control tests, withdrawal tests and an end-to-end consent audit before enabling server submission.

## Implemented now
- `reading/contribute-question.html` and `curiosity-draft.js` provide question framing, known/unknown separation, local draft export and explicit no-upload disclosure.
- Homepage links to the drafting tool.
- The previously implemented Choice Lab compares two alternatives and exposes unknown evidence.
- **No server-side contribution collection, CRIS analysis or visitor identity tracking is active.** This is deliberate until the authenticated ingestion and consent contract is tested.

## Outstanding acceptance
Exact-head static/browser tests, privacy network check, keyboard/accessibility, responsive and deployed readback. Then separate security-reviewed consent ingress, test-only database migration, RLS/permission tests, retention/withdrawal and a verified SOAP-to-CRIS sample. Preserve all outcomes on PR #543.

## Synthetic Test continuation | 9 November 2026

The original checkpoint above is historical. The base migration defines `web001_private.contributions`, two ingestion functions, private SOAP-compatible and CRIS candidate views, and a scheduled retention function. The scoped migration moves both functions to the private schema and grants execution to the `web001_ingest` login. No public read endpoint exists. The active database consent record includes purpose, version, source and time. A 90-day expiry ends eligibility immediately. The retention job scrubs expired content on its next successful one-minute run and purges the limited audit row after 30 days. Withdrawal scrubs active content and unlinks both projections in one transaction. The scope of this guarantee is the active database. Provider backups and previously exported copies require a separate retention decision before public collection.

Only approved contributions are eligible for a nonclinical SOAP candidate. The visitor's statements remain subjective. Objective and assessment fields stay empty until research supplies verifiable evidence. Two approved contributions can form a CRIS candidate when a human reviewer assigns them the same problem key. The pair of source IDs and that assignment are the supporting evidence. Confidence remains unassessed. The views copy no text into SOAP, CRIS/ARIS, governed memory, Idea Nursery or DocuForge. The Test suite makes the approval transition with synthetic rows only. A production review role and review interface are still open.

T2 applies to isolated Test ingress, database objects and preview deployment. Issue #542 owns the changes, PR #543 stays draft on the BRAND-001 base, and the static site continues to consume canonical brand assets. The existing public preview exposes private browser drafting only. The optional synthetic build creates a separate Worker configuration outside the source tree. Its write routes require a Test access token, rate-limit binding, and provider credentials. The preview source contains no secret. The synthetic Worker uses a dedicated Hyperdrive connection with caching disabled. Its database login cannot read or write tables directly, invoke retention, assume the function owner role, or approve contributions.

### Verification and handoff

- `node --test apps/public-web/ingestion/worker.test.mjs` checks origin, method/path, configuration, access gate, rate limit, streamed size, malformed JSON, consent, challenge action/hostname, safe errors, hashing, and withdrawal.
- `node apps/public-web/ingestion/sql-contract.test.mjs` uses PostgreSQL via PGlite with stand-ins for the project's existing clinical and scheduler objects. The fixture applies both migrations twice and executes their verifiers with rolled-back synthetic rows. For the current Test schema, run `migrations/verify_visitor_contributions_scoped_test.sql` on the named project's direct privileged connection and read back the scheduled job and its execution history.
- `node apps/public-web/ingestion/browser-check.mjs` checks private drafting, export, zero draft requests, focus and desktop/mobile accessibility. Its consent, submission retry and withdrawal checks use explicit provider fixtures. Set `WEB001_PUBLIC_ONLY=1` for read-only browser testing of a deployed public site.
- To prepare the Wrangler preview, run the site preparation first, then provide `WEB001_TURNSTILE_SITE_KEY`, `WEB001_HYPERDRIVE_ID`, and an unused absolute directory outside the repository to `node apps/public-web/ingestion/prepare-test-preview.mjs`. Install the locked dependencies in that directory. Set `TEST_ACCESS_TOKEN` and `TURNSTILE_SECRET` as Worker secrets.
- To reproduce the module upload, run `npm ci --prefix apps/public-web/ingestion`, set `WEB001_TURNSTILE_SITE_KEY`, and run `node apps/public-web/ingestion/build-hosted-test.mjs` with the bundle path. Upload the generated ESM module to the synthetic Worker with the `WEB001_DB` Hyperdrive binding, `VISITOR_RATE_LIMIT`, the two secrets, the synthetic origin, and `COLLECTION_MODE=synthetic-test`. The module serves the Test contribution page and its dependencies. Other reading links lead to the static preview.
- For rollback, stop or remove only the synthetic Worker and unschedule only `web001-test-contribution-retention` if it exists and storage is being retired. Preserve any Test audit evidence before dropping the dedicated schema or RPCs. Restore the prior version of the static Worker or revert the WEB-001 commit for a static regression.
