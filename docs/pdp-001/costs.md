# PDP-001 cost model

Planning calculations, not bills or approved spending. Evidence IDs refer to [providers.md](providers.md). Use 730 hours/month, decimal GB, USD before tax. Scenarios are deliberately assumed workloads, not observed CoMind load. No hardware, object-backup vendor or labor rate is invented.

## Comparable database scenarios

| Scenario | Supabase Pro with 7-day PITR | Neon Launch | Neon Scale |
| --- | --- | --- | --- |
| Initial: 5 GB, Small / average 0.25 CU always-on, Neon retained history 1 GB | 25 + 15 - 10 + 100 = **$130** | 730 x .25 x .106 + 5 x .35 + 1 x .20 = **$21.30** | 730 x .25 x .222 + 5 x .35 + 1 x .20 = **$42.47** |
| Growth: 25 GB, Medium / average 1 CU, Neon history 10 GB | 25 + 60 - 10 + 100 + 17 x .125 = **$177.13** | 730 x 1 x .106 + 25 x .35 + 10 x .20 = **$88.13** | 730 x 1 x .222 + 25 x .35 + 10 x .20 = **$172.81** |
| Sustained: 100 GB, Large / average 2 CU, Neon history 50 GB | 25 + 110 - 10 + 100 + 92 x .125 = **$236.50** | 730 x 2 x .106 + 100 x .35 + 50 x .20 = **$199.76** | 730 x 2 x .222 + 100 x .35 + 50 x .20 = **$369.12** |

Sources [S1-S3,N1]. Compute sizes are illustrative budget bands, NOT equivalent performance or HA configurations. History is retained WAL volume, not a fixed fraction of database size. Neon snapshots/scheduled backups, extra compute replicas and application API/auth/object services must be added where used. Supabase additional development project compute also adds cost. Do not compare the bold numbers as total platform cost.

## Complete cost equation

Monthly total = plan + compute endpoints + DB provisioned/consumed storage + IOPS/throughput + PITR/history + snapshot/export storage + object storage + request operations + transfer + replicas/HA + pooling/proxy + auth/API/serverless + observability + independent backup + electricity/hardware reserve + operator labor + taxes.

| Component | Treatment |
| --- | --- |
| Base compute | Model every production, development, restore and replica endpoint. Always-on VEs and relay polling can defeat scale-to-zero |
| DB storage | Include indexes, bloat, outbox/inbox retention and migrations; current relation bytes are not billing disk |
| PITR/backup | Include write amplification and change history, temporary restore targets, independent export retention and restore drill charges |
| Egress | Price managed-to-SDN events and exports plus cloud-to-user/API output; retry and replay transfer matters |
| Vector | No invented per-vector vendor charge; vector cost is RAM/compute/index IO/storage, model generation billed separately |
| Pooling | Included pools where documented; RDS Proxy or additional pooler hosting priced separately; do not break session semantics to save connections |
| HA/replicas | Explicit additional eligible plan, standby/readers and storage/transfer. Read scale is not writer failover |
| APIs/auth | Database request count may be unmetered while compute, auth, realtime, functions and egress still bill; price replacement gateway/IdP for non-Supabase |
| Monitoring | Start with provider metrics and self-hosted open tools subject to license review; storage/hosting/alert delivery still cost. No Datadog subscription proposed |
| Off-host SDN | Actual quote required for encrypted retained bytes, object requests, minimum retention, download/retrieval and restore drill capacity |

RDS quote template: 730 x exact region/topology hourly rate + allocated GB x storage rate + provisioned IOPS + excess backup GB + proxy hours + transfer + KMS/monitoring/support as needed. Aurora adds its selected I/O model and reader/ACU hours. Cloud SQL adds vCPU and RAM hours, HA, disk and backup. Azure adds eligible primary/standby compute, storage, excess/geo-backup and transfer. No complete comparable quote was extracted for these candidates. Evidence gap owned by PDP research operator, before binding decision.

## VE and telemetry sensitivity

Assumed each VE emits 10 events/minute continuously, each event 2 KB before indexes/compression. 30-day month:

| VEs | Events/month | Raw GB/month | Raw GB/year before retention |
| --- | --- | --- | --- |
| 5 | 2,160,000 | 4.32 | 51.84 |
| 50 | 21,600,000 | 43.2 | 518.4 |
| 500 | 216,000,000 | 432 | 5,184 |

Traces, artifacts, research and embeddings add separate streams. Measure actual event rates, payload percentiles, compression and amplification before capacity decisions. At an assumed 3x DB+index amplification, 500 VEs would add 1,296 GB/month of relation storage if retained in a managed DB, excluding backups. This is a sensitivity illustration, not a forecast.

A 1,536-dimension float32 vector is 6,144 raw bytes; one million is 6.144 GB before row/index overhead and text. Keep bulk embeddings and graph derivatives on SDN; reserve managed vector storage for a measured bounded hot set with versioned rebuild provenance.

## Economic boundary and budget control

Managed tier retains small consequential control facts and queryable summaries; SDN absorbs raw events, cognition, research and immutable bytes. Do not put every trace into managed SQL merely because it can store vectors. Conversely do not move identities, grants or money/control state local merely to save storage fees. Signed references and summaries reduce replication/egress without losing source evidence.

At the same assumed 1 TB extra DB storage, published marginal rates imply $125/month Supabase vs $350/month Neon before compute/history. This is a storage-only comparison and says nothing about equivalent resilience. SDN is economical only after hardware, power, replacement, backups and human operation are counted.

Proposed budget guardrails: fixed approved SKU/maximum autoscale; no unapproved replicas/add-ons; 50/75/90% spend warnings; separate seven-day forecast; alert on unexpected egress; explicit admission limit for optional work; reserve recovery spending. Alerts do not hard-stop bills. Storage growth and necessary evidence are never silently destroyed to meet a ceiling.

Critical missing inputs: Joseph's monthly operating and emergency-recovery ceilings, desired availability class, measured peak load/working set, selected region, SDN hardware/power cost and independent backup quote. Resolver: Joseph for business limits; architecture/operator for measured load and quotes. Until resolved, no complete total or approved cost ceiling exists.
