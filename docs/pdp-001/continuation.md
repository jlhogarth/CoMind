# Ready-to-paste continuation

CoMind Continue Production Data Platform PDP-001 Selection and Authority Model #002

OPERATING MODE: VISIBLE AUTONOMOUS DEVELOPMENT

Managed PostgreSQL = transactional control plane. SDN = high-volume cognitive/evidence data plane. This is architectural direction, not production authorization.

Never substitute plausibility, confidence, verbosity, convenience, or user agreement for epistemic justification. No Hallucinations. No Lies. No source record or delegated work may disappear silently.

Repository: https://github.com/jlhogarth/CoMind
Issue: https://github.com/jlhogarth/CoMind/issues/140
Branch: issue-140-pdp-001-platform-authority
Decision package: docs/pdp-001/README.md and linked files. Read the current remote branch, AGENTS.md and actual PR state before continuing. Draft PR: https://github.com/jlhogarth/CoMind/pull/141. Inspect its current head, checks and acceptance.

Verified base at creation: 76e6d9549640d7e726219f7d477dcc2976ebf19c. Reconcile current main and other lanes without overwriting active work. One milestone, issue, branch and draft PR.

Current checkpoint: C, defer binding provider selection. Joseph selected managed database budget under $50/month (excluding SDN hardware and independent backups) and recovery-first availability. Neon is now compatibility-blocked; its initial assumed database-only scenario $21.30/month is not a sufficient recommendation. Read neon-history.md before reconsidering. Supabase remains the working integration reference. Supabase Pro daily-only at $25 is an integration alternative if the larger data-loss window is explicitly accepted. Supabase Small plus PITR at ~$130 exceeds budget. Recovery-first does not imply acceptance of a 24-hour RPO. RDS Multi-AZ, Cloud SQL HA, Azure zone-redundant and Aiven Business remain eligible resilience challengers. No provider has been approved for purchase or production.

Read providers.md for dated primary evidence and missing quotes. Google full price retrieval exceeded size; Azure dynamic rates absent; no complete hyperscaler total was invented. Supabase Pro lacks listed platform audit logs and uptime SLA; PrivateLink tier evidence conflicts within pricing page and needs verification. PITR spend is outside spend cap. Database backups exclude object contents. Neon multi-AZ storage does not mean hot standby compute or automatic cross-region replication.

Current project aggregate inspection: CoMind sbgfuanxiqepcoboxzcl, us-east-1, PG17.11.0.002, vector0.8.2. Do not fetch credentials or user payloads merely to inventory. Server uses PostgreSQL session advisory locks and guarded archive SET ROLE; Console uses Supabase Data API. A database URL swap alone is insufficient; transaction pooling may break session semantics.

The proposed 33-family authority matrix is authority.csv. Managed grants/control/RunBook remain managed authoritative; SDN owns cognitive bytes and bulk evidence; source-owned immutable events resolve replicated conflicts. No local promotion, stale grants or uncontrolled dual writes. Proposed sync is durable outbox/inbox, at-least-once with idempotency, versions/epochs, durable ack, quarantine and replay.

architecture.md contains every failure case, provisional unmeasured RPO/RTO and integrated restore sequence. readiness.md contains security/migration/rollback and risk owners. costs.md separates assumed VE scenarios from observations. No runtime sync, monitoring, backup or production control was deployed by PDP-001.

SDN-003 issue #136 and draft PR #137 remain planning-only and unchanged. At PDP acceptance, propose exact dependency updates; do not rewrite SDN-003 before decision acceptance.

Next actions: inspect draft PR/checks and validation.md; resolve exact under-$50 cap/emergency reserve and acceptable data-loss window; complete redacted service dependency inventory and comparable region/SKU quotes; prepare isolated PG17 compatibility/load/recovery proofs. Do all safe planning work before seeking any needed paid validation scope. Keep provider selection C where evidence remains critical. Do not claim planning acceptance or production readiness solely because documents exist.

Authority: research, reversible repository documentation/tests and concise existing Durable RunBook capture authorized. NOT authorized: purchases/upgrades, paid production creation, new production credentials, production data movement, DNS/network changes, live routing, destructive lifecycle, deletion, provider decommission or cutover. No production DDL under PDP-001.

Visible updates: surface material findings, risks, failures, workarounds, cost/security and cross-lane effects. Refresh this prompt after milestones/mutations/findings and before long phases. Update Durable RunBook with actual timestamp, actions, evidence, results, approvals, failures, risks and next actions. Check runbook.md and actual live ledger before claiming a write succeeded. Any monitor must have verified configuration and terminal retirement; none is created merely by this prompt.

Durable RunBook checkpoint verified: event 4b96ef6e-08e7-4c68-a21a-b0ada6174ccf at 2026-10-17T04:13:55.675361Z, outcome partial. Shell git push lacked credentials; use authenticated GitHub connector for publication. Local aa57e97 is not necessarily the published remote SHA. Inspect remote head and PR.

Latest steering: Joseph clarified the $50 budget is initial; eventually he wants TWO production provider databases with failover. Read provider-failover.md. Preserve a staged single-writer primary/independent-standby route; verify replication permissions, DDL/sequences, API/Auth/object portability, independent failure domains, fencing under partition, promotion and reseed/failback. Future combined budget/RPO/RTO not specified. Do not infer automatic failover authority, deploy a standby, promise both under $50, or promote SDN to control authority.

Latest correction: Joseph recalled previous Neon/ChatGPT compatibility problems. Retrieved October 4-6 history reports absent Neon database tools despite enabled skills, network/auth barriers and transaction_read_only=on migration failure. Prior Neon lead nomination is superseded. No Neon lead status until repeatable actual ChatGPT/Work access and legitimate write/migration/recovery path is proven; SQL compatibility alone cannot pass this gate.
