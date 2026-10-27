# TK-004 Maintenance Verification Anchor

Status: implementation and isolated/Test verification in progress

Governing contract: TK-001 v0.1
Governing implementation design: TK-002 v0.1
Predecessor implementation evidence: TK-003
Issue: https://github.com/jlhogarth/CoMind/issues/230

TK-004 introduces the candidate minimum ThreadKeeper persistence substrate and repository proof. This record exists so MCTRL evaluates the exact implementation head before merge and again on `main`.

Until the complete C2 evidence gate is explicitly accepted, the canonical ThreadKeeper state must remain:

- classification: Capability
- capability maturity: C1 Contracted
- module lifecycle applies: false
- implementation_proven: false

The TK-004 schema is limited to compact semantic scope identity, accepted checkpoint lineage, immutable assessments, continuity-case identity, and append-only case transitions. It does not own raw Conversation History, Agent Communication, Foundry execution, Memory Graph storage, Helper Matrix orchestration, SEAL promotion, Digital Twin identity, or EIK truth authority.

Required acceptance evidence before any C2 promotion:

1. clean PostgreSQL 17 migration replay,
2. isolated repository integration proof,
3. checkpoint concurrency and stale-head proof,
4. append-only/immutability proof,
5. RLS and least-privilege proof,
6. deterministic assessment and case lifecycle proof,
7. full adjacent regression checks,
8. governed migration application to CoMind Test only,
9. Test readback and Supabase security/performance advisor review,
10. canonical evidence reconciliation,
11. main-branch MCTRL isolated proof and bounded live Test audit.

No production activation is authorized by this verification anchor itself.
