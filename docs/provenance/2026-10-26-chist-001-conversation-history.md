# CHIST-001 Conversation History Acceptance Provenance

## Scope

CHIST-001 is the activation and completion lane for governed ChatGPT Conversation History. This evidence record covers the engineering capability through the pre-baseline state. It does **not** certify a real historical baseline. Issue #208 remains open until a valid native OpenAI export is ingested, reviewed, and explicitly certified.

Governing principle:

> Capture first. Interpret second. Promote deliberately. Prune last.

## Repository identity

- Issue: #208, `CHIST-001: Complete governed ChatGPT Conversation History baseline`
- Pull request: #209
- Branch: `chist-001-conversation-history-baseline`
- Evidence-complete candidate is the commit containing this provenance file and must receive a fresh exact-head workflow matrix before merge.

## Accepted engineering capability

The lane implements:

1. A dedicated `comind_conversation_history_reader` capability with NOLOGIN/NOINHERIT and read-only access to certified archive, reconciliation, archive-native derivation, review-only promotion-candidate, and PIT evidence.
2. A dedicated `comind_conversation_history_certifier` append-only authority. A technically PASS import is not automatically the historical baseline.
3. A dedicated `comind_conversation_history_deriver` append-only authority for deterministic archive-native analytics without fabricating live `cm_conversation` rows.
4. A purpose-specific `CHATGPT_HISTORY_DATABASE_URL` execution path with no `DATABASE_URL` fallback.
5. Governed operator commands for `status`, `list`, `search`, and `show`.
6. Branch-aware source reconstruction preserving archive topology, message/node identity, timestamps, hashes, and attachment references.
7. Explicit separation between source evidence and derived evidence.
8. Reconciliation evidence from CFR-001F where an archive observation has a selected live-CFR match.
9. Archive-native deterministic analytics and review-only promotion candidates for certified historical conversations that do not have a live-CFR identity.
10. Governed point-in-time comparison with five classifications: `unchanged`, `content_changed`, `structurally_changed`, `new_in_comparison`, and `absent_in_comparison`.
11. An epistemic boundary that `absent_in_comparison` means not observed in the comparison export and does not establish deletion.
12. Reusable read-only Supabase Test verification and a dedicated CHIST GitHub Actions acceptance workflow.

## Supabase Test migrations

The following CHIST migration names are present in Test:

- `chist_001_conversation_history_reader`
- `chist_001_conversation_history_baseline_certification`
- `chist_001_conversation_history_baseline_index_hardening`
- `chist_001_conversation_history_archive_derivation`
- `chist_001_conversation_history_pit_diff`
- `chist_001_conversation_history_archive_derivation_fk_indexes`

Migration 003 was applied twice by concurrent development sessions under separate Supabase migration versions. Its DDL is `CREATE INDEX IF NOT EXISTS`, so the repeated application was schema-idempotent and did not create a second index. Migration history is preserved as observed and was not rewritten or deleted. The reusable verifier therefore tests required distinct migration names rather than an exact migration-row count.

Production was not changed.

## Isolated PostgreSQL acceptance

CHIST workflow run #34 established the first complete isolated acceptance after PIT contract correction:

- run: https://github.com/jlhogarth/CoMind/actions/runs/40399714164
- constrained Conversation History retrieval: PASS
- baseline FK index hardening: PASS
- archive-native deterministic analytics: PASS
- archive-native analytics readback: PASS
- governed baseline certification: PASS
- five-way PIT comparison: PASS
- repeated identical PIT comparison reuses the same immutable receipt: PASS
- absent-in-comparison non-deletion semantics: PASS

The later hardened workflow adds explicit migration-006 application and both composite-FK index checks.

## Supabase Test acceptance

After migrations 001-006, the exact repository verifier `db/verification/chist_001_live_test.sql` returned `PASS_ALL = true` with every individual check true.

The verifier confirms at minimum:

- all three CHIST roles are least-privilege NOLOGIN/NOINHERIT roles;
- baseline, archive derivation, and PIT evidence tables exist and use forced RLS;
- source, derivation, certification, and PIT guard/immutability triggers exist;
- the history reader is read-only and cannot read canonical memory or generic live analytics projections;
- the history certifier can append baseline certification but cannot mutate it;
- the archive-native deriver has certified-source read access plus append-only derivation authority and no canonical-memory authority;
- the archive ingestor has baseline SELECT and PIT append authority only where required;
- anon, authenticated, and service_role receive no CHIST history-evidence access;
- the baseline source-archive FK index and both archive-derivation composite FK indexes exist;
- no real baseline is certified in Test;
- no archive derivation run exists without a certified baseline;
- no PIT detail exists without a certified baseline;
- all six required migration names are present.

## Advisor evidence

Before migration 003, Supabase Performance Advisor reported an unindexed CHIST baseline `source_archive_id` foreign key. Migration 003 removed that finding.

After migration 004, Performance Advisor identified two CHIST-specific composite child foreign keys without covering indexes:

- `cm_archive_derivation_run_scope_fk`
- `cm_archive_candidate_run_scope_fk`

Migration 006 added covering indexes in the exact child-key order. After deployment, the project-wide unindexed-FK count decreased from 130 to 128 and neither CHIST finding remained. New CHIST indexes are reported as unused because Test contains zero certified baseline data; that is expected at this stage.

Supabase Security Advisor reports no CHIST-specific security finding. Pre-existing project-wide security/performance findings remain outside this lane.

Advisor reference for FK coverage:
https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys

## Failures and workarounds preserved

### Invalid source download

An earlier browser-saved file believed to be the OpenAI export was inspected and found to contain only an invalid/expired signed-download response rather than conversation history. It was not treated as source evidence and was quarantined from the real-baseline path. Empty `Conversation_History/00_Raw_Exports` and failed-import staging folders were created for safe organization. CHIST does not claim baseline completion from this artifact.

### Supabase role portability

The initial history-reader migration attempted `ALTER ROLE ... NOSUPERUSER` for an already-correct role. Supabase migration authority cannot perform that privileged ALTER merely to restate a safe attribute. The migration was corrected to verify an existing role's restrictive attributes and fail closed if they are wrong instead of requiring a privileged ALTER.

### Staged archive analytics compatibility

The history `show` command initially assumed archive-native derivation tables were already deployed. The reader was hardened to degrade truthfully before migration 004: certified source history remains available and the derived section reports the capability as not yet deployed. After migration 004, richer archive-native analytics are read back normally.

### PIT CLI contract mismatch

The PIT preflight initially used a JSON envelope inconsistent with the established governed archive CLI. The contract was standardized to `{ "status": "PASS", ...preflight }` and the acceptance test verifies that the assumed role is `comind_archive_ingestor`.

### Same-branch concurrent edit collision

A concurrent development session changed the PIT acceptance test back toward the older preflight envelope after the CLI had been standardized. The collision was detected before Test PIT deployment and resolved in favor of the existing governed CLI convention. The incident is also recorded in the Durable RunBook as event `5c6a1d72-5c3f-4016-990d-455307a11a0c`.

### Duplicate idempotent migration application

Concurrent development sessions applied migration 003 twice under two Supabase migration versions. Because the operation was `CREATE INDEX IF NOT EXISTS`, the database shape remained correct. The duplicate ledger observation is preserved rather than rewritten.

## Real baseline gate remains open

A valid native OpenAI export has not yet been certified. The real baseline remains incomplete until all of the following occur:

1. acquire the untouched native OpenAI export ZIP or supported conversation JSON;
2. preserve its immutable file identity and SHA-256;
3. run governed archive preflight and ingestion;
4. review PASS/WARN/FAIL receipt, parser events, quarantine, counts, and topology integrity;
5. explicitly certify only the reviewed PASS import as the Conversation History baseline;
6. run archive-native derivation against that certified source;
7. reconcile against available live CFR observations without overwriting either source;
8. retain any later export as an independent point-in-time observation and compare through the governed PIT diff path.

No export absence, failed download, later export absence, parser warning, or reconciliation ambiguity may be silently converted into a deletion or completeness claim.

## Safety state

- Production activation: false
- Destructive pruning: false
- Automatic durable-memory promotion: false
- Automatic Rulebook promotion: false
- Automatic architecture/task promotion: false
- Public/Data API archive exposure: false
- Real native OpenAI baseline certified: false
