# CHIST-A01 Personal Analytics Foundation

**Status:** Implementing v0.1  
**Date:** 2026-10-26  
**Issue:** #229  
**Governance tier:** T1 Reversible development  
**Parent architecture:** `docs/architecture/conversation-history-platform.md`

## In this document

- [Purpose](#purpose)
- [Boundary](#boundary)
- [Metric model](#metric-model)
- [Initial v1 metrics](#initial-v1-metrics)
- [Time semantics](#time-semantics)
- [Determinism and lineage](#determinism-and-lineage)
- [Security and authority](#security-and-authority)
- [Acceptance](#acceptance)
- [Future extensions](#future-extensions)
- [Limitations](#limitations)
- [Related artifacts](#related-artifacts)

## Purpose

CHIST-A01 establishes objective, reproducible personal analytics over an explicitly certified Conversation History baseline. It is the first downstream product layer above preserved Conversation History evidence.

The goal is not to infer personality, creativity, productivity, or intent in v0.1. The goal is to establish trustworthy telemetry from which later interpretive analytics can be derived and challenged.

## Boundary

The source OpenAI export and archive observations remain immutable source evidence. A metric is derived evidence.

CHIST-A01 reuses:

- the certified Conversation History baseline boundary;
- `comind.cm_archive_derivation_run` for exact source and policy identity;
- `comind_conversation_history_deriver` for governed deterministic calculation;
- `comind_conversation_history_reader` for private read-only retrieval.

CHIST-A01 does not write to live `cm_message_analytics` or `cm_conversation_analytics`. Historical archive analytics and live conversation analytics remain distinct evidence domains. Metric names and definitions should be compatible where that can be done without weakening provenance.

No metric automatically promotes itself to Memory, Rulebook, architecture, tasks, Digital Twin traits, or any other canonical knowledge system.

## Metric model

A metric definition is immutable and versioned. A semantic change requires a new metric version rather than rewriting historical meaning.

A metric fact identifies:

- archive derivation run;
- import and source conversation;
- metric key and metric version;
- calculation policy version;
- optional dimension;
- computed value or explicit unsupported state;
- deterministic fact identity hash;
- creation timestamp.

A fact can be `computed` or `unsupported`. Missing evidence must not be converted into zero, an estimate, or an invented value unless the metric definition explicitly defines that behavior.

## Initial v1 metrics

The first vertical slice contains only objective deterministic measurements:

- source node, message, attachment-reference, and active-branch counts;
- null-message nodes, branch points, leaf nodes, edges, and maximum graph depth;
- user, assistant, system, and tool message counts;
- user-to-assistant message ratio;
- string-part character, whitespace-token word, and question-mark counts;
- earliest and latest preserved message timestamps;
- elapsed message-span seconds;
- timestamped and untimestamped message counts;
- message counts by UTC hour;
- message counts by UTC weekday.

The word-count metric deliberately uses a simple deterministic whitespace-token rule. It is not a linguistic tokenizer and must not be represented as one.

## Time semantics

UTC is the canonical v1 aggregation frame for evidence-level temporal facts. UTC avoids silently changing stored metric identity when a viewer changes location or timezone settings.

A user-local view may later project UTC evidence into a named IANA timezone, but that projection must record the timezone and policy version used.

Labels such as `peak creative hour` are not objective time facts. A future creative-hour derivation must define what qualifies as creative activity, which source evidence is considered, the timezone used, the minimum evidence threshold, and the version of that policy.

## Determinism and lineage

For the same certified source evidence, metric definition, calculation policy, dimension, and value, the metric identity must be reproducible.

Metric fact identity includes the source snapshot hash, normalized content hash, topology hash, metric definition hash, calculation policy, dimension, state, and normalized value identity.

Timestamp identity is normalized to epoch seconds before hashing so database session timezone does not alter the fact hash. The actual metric value remains `timestamptz`.

A repeated calculation over the same derivation run is idempotent. A separate deterministic run over the same source and policy should reproduce the same metric fact hashes.

## Security and authority

The metric tables are private and use forced RLS.

The history reader receives read-only access to metric definitions and certified metric facts. The archive deriver can invoke the governed calculator but does not receive direct INSERT authority on metric facts.

Ordinary Data API roles do not receive access. Production is outside CHIST-A01 v0.1 scope.

The composite foreign key from metric facts to archive derivation runs is covered by an index whose leading columns exactly match `(archive_derivation_run_id, import_id, source_conversation_id)`. This is part of the acceptance contract because Supabase's database advisor reports uncovered foreign keys as a performance risk.

## Acceptance

CHIST-A01 v0.1 requires evidence that:

1. PostgreSQL 17 applies the migrations transactionally.
2. The accepted synthetic CHIST fixture produces the exact expected 24 metric facts.
3. Repeating the same run inserts no duplicates.
4. A second run over the same source and policy reproduces the same fact hashes under a different session timezone.
5. The history reader can read but cannot mutate metric facts.
6. The derivation role cannot bypass the calculator with direct INSERT.
7. Data API roles have no private metric read privilege.
8. The archive metric composite foreign key has the required covering index and exact leading-column order.
9. The exact candidate commit passes its dedicated GitHub Actions gate and broad repository CI.
10. Supabase Test receives a bounded verification, including security and performance advisor review, before the issue can be completed.

A successful synthetic proof does not certify any real personal analytics. Real metrics remain unavailable until a native OpenAI export is ingested, reviewed, and explicitly certified as a Conversation History baseline.

## Future extensions

After the v0.1 metric fact layer is accepted, the next A01 increments may add:

- cross-conversation sessionization using an explicit inactivity-gap policy;
- contiguous activity and brainstorming-streak inputs;
- conversation-depth and branching distributions;
- monthly and yearly activity projections;
- tool-use and attachment-resolution metrics where evidence supports them;
- user-configured timezone projections;
- dashboard/query projections over immutable facts.

Interpretive analytics such as creative periods, development intensity, novelty, focus, and topic lifecycle remain separate versioned derivations.

## Limitations

The v0.1 text metrics count only string-valued entries in the preserved message `content.parts` array. Multimodal or structured parts remain preserved source evidence but are not converted into text counts.

Message timestamps may be absent from source evidence. In that case timestamp-dependent facts are marked unsupported where appropriate rather than invented.

UTC activity distribution is not a claim about sleep, health, productivity, creativity, or personal effectiveness.

The synthetic fixture proves implementation behavior, not representativeness of the future real archive.

## Related artifacts

- `docs/architecture/conversation-history-platform.md`
- `db/migrations/20261026_008_conversation_history_personal_analytics.sql`
- `db/migrations/20261026_009_conversation_history_personal_analytics_hash_hardening.sql`
- `db/migrations/20261026_010_conversation_history_personal_analytics_fk_index.sql`
- `scripts/test_chist_a01_personal_analytics.sh`
- `scripts/test_chist_a01_personal_analytics_fk_index.sh`
- GitHub Issue #229
- GitHub PR #231
