# PDP-001 milestone RunBook

Date: 2026-10-17, America/Indiana/Indianapolis. Source: Joseph's PDP-001 opening authority; no production purchase or activation approval.

## Actions and results

- Inspected authoritative main `76e6d9549640d7e726219f7d477dcc2976ebf19c`, AGENTS.md, current database connection behavior, Durable RunBook schema and SDN-003 draft PR #137.
- Searched for existing PDP-001 issue; none returned. Created dedicated issue #140 and branch `issue-140-pdp-001-platform-authority` from verified main.
- Retrieved current primary provider documentation and pricing for Supabase, Neon, AWS RDS/Aurora, Google Cloud SQL, Azure PostgreSQL and Aiven. Full evidence and retrieval limitations are in providers.md.
- Used read-only Supabase project discovery and aggregate catalog queries. CoMind active/healthy; PG17.11, vector 0.8.2; extensions and table/relation aggregates recorded. No user payload, object or secret extraction.
- Produced provider checkpoint, 33-family authority matrix, outbox/inbox contract, failure matrix, integrated recovery, security, assumed costs, migration/rollback and SDN dependency proposal.
- Decision result: checkpoint C. Conditional preference for separate Supabase Pro Small + seven-day PITR validation; Neon primary cost challenger. This is an assistant recommendation for review, not Joseph's approval or accepted architecture.

## Failures and workarounds

Initial web search returned unrelated results; excluded and replaced with direct primary sources. Supabase changelog.md failed; HTML changelog used. Google full price response exceeded retrieval size; official product/search evidence used only for headline, complete quote remains blocked. Azure dynamic rates did not render; no invented quote.

Initial multi-statement catalog query returned only its final project-key result. Reissued one aggregate JSON SELECT to obtain the intended catalog inventory. No mutation occurred. Repository discovery assumed root package/src locations that do not exist; actual server/ and apps/operator-console/ paths were then inspected.

## Authority and implications

T2 scoped repository writes and existing project-ledger append are authorized by the PDP prompt. No DDL, new production infrastructure, credentials, paid plan, routing, migration or lifecycle activation. SDN-003 files remain unchanged. The architecture introduces no deployed enforcement, monitor or recovery guarantee.

## Verification and open work

Documentation validation: see validation.md for executed results. Provider capabilities are documentary evidence only. Performance, restore, sync and migration drills were not run.

Open: business cost/availability requirements, exact eligible provider quotes, complete service dependency inventory, representative load, off-host backup and hardware, migration compatibility, independently measured restore proof. See readiness.md for owners and gates.

Next: review draft checkpoint and resolve evidence blockers; use isolated non-production compatibility and workload evidence to choose A or B, or retain C. Keep PDP PR draft and SDN-003 planning-only. Update continuation after material findings and repository/database state changes.

## Durable capture and publication boundary

Existing RunBook event `4b96ef6e-08e7-4c68-a21a-b0ada6174ccf` was appended and read back successfully at `2026-10-17T04:13:55.675361Z` (00:13:55 America/Indiana/Indianapolis). It records checkpoint C as partial, no production authorization, findings, evidence, failures, risks and next actions. Its document_commit aa57e97 identifies the local documentation checkpoint, not a published remote commit.

Git HTTPS push failed because no shell GitHub credentials were available. The authenticated GitHub connector was used instead to create the same dedicated branch from the verified base and publish the documentation tree. No credentials were requested, copied or exposed. Remote publication evidence must be verified separately.

## User preference update

Joseph selected under $50/month for managed database costs (excluding SDN hardware and independent backups) and recovery-first availability through the checkpoint questions. This changes the preferred validation candidate to Neon Launch. Supabase Pro daily-only remains possible if larger data-loss exposure is explicitly accepted; its PITR configuration exceeds budget. These preferences are not purchase, migration or activation approval. Recovery-first does not implicitly relax RPO. Checkpoint remains C pending compatibility, total-service cost and data-loss tolerance evidence.

Draft PR: https://github.com/jlhogarth/CoMind/pull/141. Initial remote checkpoint 613040db0b7704c987b21075a8a3d7e35b562676 was fetched and its package matched local files. Publication ledger event 0d3ab554-0b1f-4ac0-b5e8-8696985a89f9 at 2026-10-17T04:14:51.547175Z was read back. No-placeholder and repository configuration CI passed on that initial head; other workflows were in progress at observation. Later heads require fresh CI inspection.

## Two-provider long-term requirement

Joseph clarified: "$50" is the initial budget; eventual target is two production provider DBs with failover. Added provider-failover.md and linked stage/dependency/cost/continuity requirements. No production standby or automatic failover authority granted. Initial selection must demonstrate a credible independent-provider route; complete-service failover, fencing, replication permissions and future combined costs remain proof requirements. Upstream PostgreSQL logical replication restrictions and slot management were verified against primary PG17 documentation.

## Neon history correction

Joseph recalled prior Neon incompatibility with ChatGPT. Personal Context retrieval returned October 4-6 accounts of missing Neon database MCP tools despite enabled skills, blocked direct SQL/network/browser auth, and transaction_read_only=on on the old target. The repository independently records the October 5 move from Neon-specific automation to Supabase. These are attributed historical records, not new Neon tests or proof of provider-wide failure. Supabase connector SQL and RunBook capture work in this session. Neon lead nomination is superseded by a compatibility block; checkpoint remains C. No paid environment or new credentials used.
