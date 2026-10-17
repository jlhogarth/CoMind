# PDP-001 Production Data Platform decision package

Status: DRAFT, checkpoint C. Evidence collected 2026-10-17 UTC / America/Indiana/Indianapolis. Planning only.

Issue: https://github.com/jlhogarth/CoMind/issues/140

Base: `76e6d9549640d7e726219f7d477dcc2976ebf19c`.

## Decision checkpoint

**C: defer binding provider selection pending critical evidence.** Joseph selected under $50/month for the managed database (excluding SDN hardware and independent backups) and recovery-first availability. Preferred next validation candidate: Neon Launch. Supabase Pro with daily backups remains an integration-simple alternative only if its larger data-loss window is explicitly accepted. Neither is selected for purchase or activation.

Supabase's existing API integration reduces transition risk, but is not a reason to waive recovery, security, or cost requirements. Its recovery-equipped entry is approximately $130/month for one Small project, before other usage and independent backups [S1-S3]. Neon may materially reduce database-only cost [N1]; authentication, API replacement, audit export and operational work must be included before claiming a lower total cost. Existing use of Neon in earlier project history is not disqualifying evidence.

The budget band and recovery-first availability preference are now supplied. Exact data-loss tolerance, emergency recovery reserve, measured load, complete Supabase service dependency inventory and tested provider exit remain unresolved. Those gaps block an unconditional recommendation. Do not infer that hyperscalers are rejected on price: region/SKU quotes remain incomplete. A draft is a concrete reviewable architecture proposal, not architecture acceptance.

## Package contents

- [Provider comparison and evidence](providers.md)
- [Data authority matrix](authority.csv)
- [Synchronization, failure and recovery design](architecture.md)
- [Security, migration, risks and acceptance](readiness.md)
- [Cost scenarios](costs.md)
- [Staged two-provider failover](provider-failover.md)
- [RunBook record](runbook.md)
- [Ready-to-paste continuation](continuation.md)

## Authority and repository discipline

Joseph authorized research, planning, documentation, reversible repository work, and the existing Durable RunBook update. T0 research and aggregate database reads; T2 GitHub and RunBook writes. Blast radius: this directory, dedicated issue/branch/draft PR and concise existing project-ledger record. No new runtime agent identity, deployment, credentials, SQL schema, paid commitment, live routing or production cutover is authorized here.

Rollback: close the draft and abandon the branch; append a correcting RunBook event rather than erase history. SDN-003 #136 / draft PR #137 is read-only input and remains unchanged. PDP-001 acceptance must later become an explicit SDN activation dependency.

Relevant design traceability: existing provisional AIMS A.3.2 (accountability), A.4.5 (infrastructure); NIST SP 800-53 AC-6 (least privilege), AU-9 (audit protection), CP-9/CP-10 (backup/recovery), CM-3 (change control). These are design references, not normative verification or compliance claims. Joseph is accountable for platform, budget and production approval. Implementation owners must be named before activation.

No infrastructure latency or metered provider cost is introduced by these documents. Proposed synchronization adds one local outbox insert to the source transaction and asynchronous delivery; actual overhead is unmeasured and must be benchmarked.

## Verified project facts

Read-only connector inventory identified CoMind project `sbgfuanxiqepcoboxzcl`, active/healthy, us-east-1, PostgreSQL 17.11.0.002. Observed extensions include vector 0.8.2, citext 1.6, pg_trgm 1.6, pgcrypto 1.3, supabase_vault 0.3.1, pg_stat_statements 1.11, uuid-ossp 1.1 and plpgsql 1.0.

Aggregate table counts: comind 94, comind_pm 13, public 18, auth 27, storage 8, realtime 3, supabase_migrations 1, vault 1. Approximate table/index relation bytes total 7,118,848 at observation, excluding system relations, WAL and object bytes. This is not billed disk usage or evidence of empty application tables. No user rows, secrets, auth credentials or object contents were retrieved.

Repository server/src/db.ts uses node-postgres, session advisory locks, and a separately guarded archive connection. apps/operator-console/src/lib/queries/read.ts uses SupabaseClient.from() via the Data API. Transaction pooling cannot be assumed safe for existing session-lock and archive SET ROLE behavior. Migrations use a direct non-pooled connection. No browser may receive database credentials.

## Updated screening under Joseph's preferences

Neon Launch leads the next compatibility investigation: the initial assumed database-only scenario is $21.30/month including the assumed retained history. Gateway/identity replacement can erase that saving and must be measured/costed. Supabase Pro at $25/month without PITR fits the database budget but daily backup loss exposure does not meet the proposed five-minute RPO. Recovery-first concerns downtime, not accepted data loss. No recovery objective was relaxed by implication. Supabase Small plus PITR (~$130) is out of the stated budget. Exact monthly cap below $50 and emergency reserve are still to be confirmed before paid commitment.

## Long-term availability target

Joseph clarified that $50 is the initial budget and the eventual target is two production provider databases with failover. Selection must preserve a verified path to an independent standby and single-writer promotion. See provider-failover.md for replication, fencing, whole-service portability and future cost gates. No second provider, combined budget or automatic-failover authority is selected.

## Decision rules

1. Require PostgreSQL 17 compatibility for existing migrations and required extensions/functions.
2. Require PITR plus independent logical exports and object backup; daily-only recovery needs explicit acceptance of its larger loss window.
3. If automatic zonal failover, private networking or platform admin audit logs are mandatory, compare the exact eligible paid tiers, not entry-price advertising.
4. Prefer the lowest total cost option that passes compatibility, security, recovery and operational acceptance. Include engineering and on-call work without inventing a labor rate.
5. Keep standard SQL, application-owned outbox/inbox contracts, portable object manifests and independent restore evidence even when using vendor APIs.
6. Missing evidence remains a tracked blocker; pricing is revalidated before any purchase.
