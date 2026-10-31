# CHIST-A03-002 Analytical Substrate

Issue: #465
Parent: #304
Production change: false

This unit establishes the additive append-only corpus analytical evidence substrate after the capability reconciliation merged in PR #464.

The run identity is bound to an exact certified baseline/import pair, explicit policy and engine versions, actor, repository branch, and exact source head. Observations retain run/import lineage and classify analysis as deterministic or model-assisted candidate.

The observation vocabulary covers branch provenance, concept census, concept occurrence, concept bridges, and candidate Digital Twin signal families. Candidate observations are derived evidence only and have no promotion path to Memory, RuleBook, canonical architecture, decisions, tasks, profile data, Digital Twin truth, or agent authority.

Both tables reject UPDATE and DELETE. RLS is forced. The history deriver may append and read; the history reader may read only. PUBLIC, anon, and authenticated receive no table access.

Synthetic PostgreSQL acceptance and aggregate-only Test validation remain required before this unit may merge. No private conversation content belongs in repository, CI, or acceptance evidence.
