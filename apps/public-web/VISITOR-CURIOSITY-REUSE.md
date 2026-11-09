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
