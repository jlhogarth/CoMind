# Provider comparison and evidence register

Evidence retrieved 2026-10-17. USD list prices, no taxes, discounts, promotional credits or commitments assumed. Provider statements are capability evidence, not CoMind performance tests. Links are primary provider sources. A missing fact is not evidence that a capability is absent.

## Current comparison

| Candidate | PostgreSQL/vector/extensions | Compute, storage and connections | Availability, recovery and geography | Security, operations and fit |
| --- | --- | --- | --- | --- |
| Supabase Pro / Team / Enterprise | PostgreSQL and pgvector; existing 17.11 source verified. Supabase-owned schemas and Vault require special migration handling [S4,S7] | Sized instances, separately growing disk; direct, session/transaction pool and HTTPS Data API. No assumption of transparent compute autoscaling. Existing session state requires direct/session connections [S1,N3] | Paid daily backup; PITR add-on needs Small or larger. Read replicas are asynchronous and do not establish automatic writer failover; Auth still uses primary. Exact HA/region-loss contract unresolved [S2,S5] | Integrated Auth/Storage/API/metrics reduces replacement work. Database IP restrictions do not protect HTTPS APIs. Pro lacks platform audit logs and listed uptime SLA; pricing page disagrees internally about PrivateLink tier, so entitlement needs confirmation [S1,S6] |
| Neon Launch / Scale | PostgreSQL, pgvector and extension library; exact CoMind extension inventory must pass 17 compatibility test [N1,N4] | Separated autoscaling compute/storage, optional scale-to-zero, PgBouncer and serverless access. Always-on agents erode idle savings; replicas consume compute [N1,N3] | Multi-AZ storage with compute restart/reschedule, not a hot standby promise. Documentation reports AZ recovery typically 1-10 minutes; no automatic real-time cross-region replication. Paid history window Launch up to 7 days, Scale up to 30 [N1,N2,N5] | Scale advertises SLA/private networking. Managed Better Auth and objects exist, but are not verified drop-in Supabase replacements. Newer beta realtime is not a prerequisite [N1]. Strong database-only challenger |
| AWS RDS PostgreSQL | PostgreSQL with managed extension allowlist; pgvector listed. Verify PG17 versions, parameter groups and privileges [A3,A4] | Provisioned compute and storage; optional storage autoscaling. Direct SQL; RDS Proxy is a separate pooling/cost decision | Multi-AZ instance synchronous standby supports failover, standby is not readable. Multi-AZ cluster differs. Automated backups/PITR, snapshots; regional DR needs separately configured cross-region strategy [A1,A2,A5] | AWS IAM/VPC/KMS ecosystem must be configured and priced. No automatic replacement for Supabase HTTP/Auth/Storage. Strong control-plane HA candidate; higher integration burden is an architectural inference, not benchmark |
| AWS Aurora PostgreSQL | PostgreSQL-compatible, including pgvector [A6,A7]; engine differences require rehearsal | Provisioned or Serverless v2; compute, storage, I/O model and readers priced separately | Evaluate writer/reader failover and regional/global topology as a separate configuration. Do not equate Serverless with cross-region HA | Candidate when stronger cloud-native resilience or elastic load justifies complexity. No measured CoMind demand yet [A6] |
| Google Cloud SQL PostgreSQL | PostgreSQL extension catalog includes pgvector [G2] | Provisioned vCPU/RAM, growing storage, direct SQL/connectors. Pooling/API tier must be specified | Regional HA primary/standby uses synchronous storage replication across zones and automatic failover; regional loss is a separate DR design [G1] | Cloud IAM/private networking/Secret Manager/Monitoring integration requires a verified deployment design. Auth/API/object replacement work remains. Regional price quote incomplete [G3,G4] |
| Google AlloyDB | Secondary watchlist only, not scored | No sizing or quote collected | Do not infer equivalence with Cloud SQL | Reopen if measured vector or throughput needs exceed ordinary PostgreSQL. No current evidence justifies expanding this milestone into an AlloyDB proof |
| Azure PostgreSQL Flexible Server | Managed PostgreSQL extension system; vector version/allowlist for exact PG17 SKU remains a validation item [Z3] | Provisioned tiers, direct SQL; pooler and application API configuration must be verified | Zonal and zone-redundant HA; burstable cannot supply zone-redundant HA. PITR 7-35 days, restore to a new server; geo-backup selected at creation [Z1,Z2] | Entra/network/Key Vault/Monitor design and costs need verification. Suitable if Azure integration becomes material. Regional USD rates did not render [Z4] |
| Aiven PostgreSQL Startup / Business / Premium | Managed PostgreSQL; required vector/extensions need exact plan/version check | Defined plan resources; Business adds standby, Premium second standby. SQL/API management, not Supabase app API | Pricing lists PITR windows 2/14/30 days respectively. HA starts at Business [V1,V2] | Included as a credible simpler multi-cloud managed option. Starts $75/$180/$270 respectively; specific region quote and networking entitlement required. Lower plans are not equivalent recovery configurations [V1] |

All SQL candidates remain subject to pg_dump/pg_restore compatibility and restricted superuser behavior. Support for arbitrary extensions is never assumed. Standard SQL has less lock-in than managed Auth, APIs, secret stores and platform automation. Even Supabase-to-Supabase migration must reproduce non-database configuration.

## Commercial facts and limits

- Supabase: Pro $25/month; Small $15 compute less organization $10 compute credit; seven-day PITR about $100. Team starts $599. Additional environments consume compute; credit is not per project. Pro includes 8 GB disk, excess $0.125/GB-month, 250 GB uncached egress then $0.09/GB. API request count is unlimited but downstream services retain quotas. Platform audit logs are not in Pro [S1].
- Neon: Launch $0.106/CU-hour, Scale $0.222; database $0.35/GB-month, history $0.20/GB-month. Launch history up to seven days, Scale thirty. Public transfer includes 500 GB/project then $0.10/GB. Autoscale ceilings bound compute only, not total storage/egress bill [N1].
- Aiven: entry prices above are starting prices, not selected region quotes. Do not compare a single-node Startup to an HA configuration as equivalent [V1].
- RDS/Aurora: region, instance, topology, provisioned storage/IOPS, backup, I/O and transfer determine cost. Static retrieved tables did not establish a comparable complete USD quote [A1,A6].
- Cloud SQL: published starts at $0.0413/vCPU-hour for Enterprise, plus memory, storage, HA, backup and transfer. This is not a complete instance price. Full pricing fetch exceeded tool size limit; product page and official search corroborate headline, not a selected-region total [G3,G4].
- Azure: official price page retrieved, dynamic dollar figures absent. No numeric instance estimate is invented [Z4].

No plan creates an independently verified hard total cost ceiling merely by enabling budget alerts. Supabase PITR is outside its spend cap [S3]. Independent operator quota gates and approval of add-ons are required.

## Screening disposition

Following Joseph's under-$50 database budget and recovery-first preference, Neon Launch is the preferred validation candidate; Supabase Pro daily-backup-only is the integration challenger if its data-loss window is accepted. Supabase with PITR exceeds the stated budget. RDS Multi-AZ, Cloud SQL HA, Azure zone-redundant and Aiven Business remain resilience challengers if hot standby/private access requirements outweigh entry cost. Aurora is not justified by measured load yet. None is permanently rejected. A provider with no complete quote cannot be declared economically inferior.

No latency, uptime, failover, vector performance or portability benchmarks were run. SLA percentages represent contracts with exclusions and credits, not measured CoMind end-to-end availability. Provider certification does not certify CoMind.

## Evidence register

| ID | Primary source | Supported scope |
| --- | --- | --- |
| S1 | https://supabase.com/pricing | Pricing, plan/security distinctions, compute and quotas. PrivateLink tier statements conflict within page; unresolved |
| S2 | https://supabase.com/docs/guides/platform/backups | Small minimum, PITR/restore, objects excluded, custom-role passwords, physical backup limitations |
| S3 | https://supabase.com/docs/guides/platform/manage-your-usage/point-in-time-recovery | Hourly PITR and spend-cap exclusion |
| S4 | https://supabase.com/docs/guides/database/extensions/pgvector | Supabase vector extension |
| S5 | https://supabase.com/docs/guides/platform/read-replicas | Async replicas, connection/API routes, primary-only Auth |
| S6 | https://supabase.com/docs/guides/platform/network-restrictions | Database/pooler IP restrictions exclude HTTPS APIs |
| S7 | https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore | Managed-to-managed migration guidance |
| S8 | https://supabase.com/changelog | Current changes: new-table API exposure and extension-version behavior require rehearsal |
| N1 | https://neon.com/pricing | Current plan rates, restore windows, connections, new backend offerings |
| N2 | https://neon.com/docs/introduction/high-availability | Multi-AZ design, compute recovery and cross-region limitation |
| N3 | https://neon.com/docs/connect/connection-pooling | Pooling behavior and session limitations |
| N4 | https://neon.com/docs/extensions/pgvector | Vector capability |
| N5 | https://neon.com/docs/postgres/backup-restore/backups | Backup/restore product surface |
| A1 | https://aws.amazon.com/rds/postgresql/pricing/ | RDS price components, topology distinctions |
| A2 | https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Concepts.MultiAZSingleStandby.html | Synchronous standby and read limitation |
| A3 | https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/CHAP_PostgreSQL.html | Managed PostgreSQL capabilities |
| A4 | https://docs.aws.amazon.com/AmazonRDS/latest/PostgreSQLReleaseNotes/postgresql-extensions.html | Engine-specific extension support |
| A5 | https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_WorkingWithAutomatedBackups.html | Automated recovery model |
| A6 | https://aws.amazon.com/rds/aurora/pricing/ | Aurora pricing dimensions |
| A7 | https://docs.aws.amazon.com/rds/latest/auroraextendedcontent/aurora-faq-agentic-ai.html | Aurora pgvector support |
| G1 | https://docs.cloud.google.com/sql/docs/postgres/high-availability | Synchronous zonal HA and failover |
| G2 | https://docs.cloud.google.com/sql/docs/postgres/extensions | Supported extensions including pgvector |
| G3 | https://cloud.google.com/sql | Product/price headline, metrics and editions |
| G4 | https://cloud.google.com/sql/pricing | Full retrieval failed, official search excerpt only; regional total unresolved |
| Z1 | https://learn.microsoft.com/en-us/azure/postgresql/high-availability/concepts-high-availability | HA models, limits and failover |
| Z2 | https://learn.microsoft.com/en-us/azure/postgresql/backup-restore/concepts-backup-restore | Retention, new-server PITR, geo-backup creation boundary |
| Z3 | https://learn.microsoft.com/en-us/azure/postgresql/extensions/concepts-extensions | Managed extension configuration |
| Z4 | https://azure.microsoft.com/en-us/pricing/details/postgresql/flexible-server/ | Dynamic pricing page, no extracted numeric quote |
| V1 | https://aiven.io/pricing/postgresql | Starting plan prices and recovery windows |
| V2 | https://aiven.io/docs/products/postgresql/concepts/high-availability | HA design |

## Research failures and safe handling

Initial multi-query search returned unrelated pages; those results were excluded. Direct provider documents and a second search supplied evidence. Supabase changelog.md failed; the HTML changelog was inspected instead. Full Cloud SQL pricing exceeded response size and Azure dynamic rates were absent. Those operations are blocked for exact costing, owned by the PDP-001 research operator, resolved by a selected-region calculator export or official price API before decision acceptance. No paid calculator deployment or account creation was attempted.
