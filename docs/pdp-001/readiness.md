# PDP-001 security, migration and acceptance

All controls below are proposed requirements unless explicitly identified as existing repository behavior. Documentation is not enforcement.

## Minimum production security model

| Boundary | Requirement and acceptance evidence |
| --- | --- |
| Service identities | Distinct app, relay-export, relay-inbox, observer, migration and backup identities. No shared admin credentials. Negative tests prove relay cannot grant roles or mutate source control records |
| Human admins | Named accounts, MFA, separate daily-use and emergency roles; recovery codes escrowed outside provider/host failure domains; access reviewed at milestones |
| Least privilege | NOLOGIN group capabilities, non-superuser runtime identities, explicit schema/table/function grants; no service_role secret in browser. Observer sees aggregate state only |
| Credentials | Separate dev/prod/service/backup credentials; secret manager chosen and costed; rotation owner and procedure, overlap/revocation tests, no secret values in Git/RunBook. Vault dependency export cannot assume decrypted portability |
| Network | DB reachable only through approved private path or narrow TLS IP allowlist with documented exception; local SDN PostgreSQL never public. Application HTTPS ingress has separate auth/rate/size controls |
| RLS/API | Default deny, tenant/owner predicates on every exposed relation; views use security_invoker where appropriate; test cross-tenant SELECT/INSERT/UPDATE/DELETE and RPC. Private comind_pm remains unexposed unless separately designed |
| Auth | Selected IdP is authentication authority; managed app mappings and grants are authorization authority. Refresh/expiry and revocation checks prevent stale JWT authority. User-editable metadata cannot grant permissions |
| Audit | Append-only application control decisions and incident events, protected off-host export; platform admin audit logs entitlement must be verified. Application logs do not substitute for missing provider admin logs |
| Backup access | Backup writer distinct from restore operator and ordinary app; independently encrypted exports and keys; read/list/restore/prune permissions tested separately |
| Restore authority | Named incident commander plus independent verifier; C4 approval for production mutation/cutover; isolated non-production restore evidence before approval |
| Destructive authority | Separate explicit purge/decommission approval, scope, hold check and evidence. Admin does not inherit purge; capacity warning cannot authorize deletion |
| Schema migrations | Reviewed versioned SQL, direct non-pooled connection, PG17 rehearsal, preflight identity check, compatibility/rollback evidence, scoped migration identity; no auto production DDL |
| Emergency access | Time-limited break-glass, human notification and post-incident review; lost MFA/key recovery drill. Emergency does not grant unbounded agent authority |
| Provider access | Review DPA, subprocessors, region/residency, encryption/key options, support personnel access controls and audit/export route. Unknown supplier access is a recorded risk |
| Compromise | Revoke keys and sessions, fence workers, preserve incident evidence before clean restore; backup verifier distrusts evidence from compromised origin pending independent check |

Supabase IP restrictions protect SQL/pooler, not Auth/Storage/PostgREST [S6]. Its Pro platform audit gap and the pricing page's PrivateLink entitlement inconsistency must be resolved before private-only/audited production claims. If those are mandatory, reprice Team/Enterprise and challengers. No regulated data processing is authorized by this plan.

## Migration strategy common to either outcome

1. Inventory actual schemas, extensions, owners, grants, RLS, triggers, routines, publications, logical slots, cron jobs, Vault references and service configuration. Live aggregate inspection establishes existence only; row sensitivity and used services remain unresolved. Do not query secret/auth payloads during planning.
2. Define table-by-table authority mapping using authority.csv. Existing memory/archive bytes do not change authority merely because a future design assigns them to SDN. Add immutable transfer manifests and keep existing source authoritative until verified, separately authorized cutover.
3. Select production environment separately from existing development. Create nothing billable or credential-bearing during PDP-001. Later provision through reviewed infrastructure/change records with explicit C4/paid authority.
4. Rehearse schema-only restore into an isolated PG17 target using allowlisted application schemas. Validate extension versions actually installed, constraints, owners, privileges and restricted managed schemas. Do not indiscriminately restore managed auth/realtime/storage internals or Supabase admin roles.
5. Rehearse data movement using authorized sanitized fixtures first. For actual migration, take a consistent source snapshot with a declared commit frontier and either a bounded write freeze or tested CDC delta. Preserve UUIDs, timestamps, relationships, holds, import manifests and provenance. Every missing/rejected row is accounted for.
6. Reconcile row and partition counts, PK sets, semantic hashes, FK/uniqueness, source time ranges, nulls, permissions, vector dimensions/model versions and object manifests. Counts alone do not pass acceptance.
7. Test application/Console/archive/workflow paths and query plans at expected concurrency. Existing session advisory locks and archive SET ROLE require session-safe connections. Resolve TLS, IPv4/IPv6, pooling and serverless behavior explicitly.
8. Before cutover: independently verified backup, measured restore/rollback rehearsal, new project identity check, approved acceptance manifest, writer/worker fencing, maintenance window, read-only source and recorded human authority. Switch configuration once; use no uncontrolled dual writers.
9. Verify post-cutover writes and sync frontier; monitor errors/latency/permissions and reconcile again. Keep original data intact/read-only under approved retention; decommission is a separate approval.

## If Supabase is retained

Use a dedicated production project with its own credentials, backups and policy. An organization upgrade may affect all projects and compute billing; verify scope before purchase. Follow current provider migration guidance [S7]. Restore only supported schemas/data and explicitly reconstruct Auth settings, providers, redirect URLs, SMTP, JWT/key settings, storage buckets/objects/policies, Realtime, Edge functions, extensions and networking. Store configuration references without secrets.

Authentication migration requires actual provider-supported user/password-hash/identity compatibility evidence. Do not promise session or MFA continuity. Preserve stable application user IDs where supported; otherwise create a reviewed mapping and revoke sessions/require reauthentication. Back up object contents separately from storage metadata [S2]. Test signed URLs and object access after migration.

Changelog [S8] flags new-table Data API exposure changes and extension version installation behavior. Revalidate exact destination grants and installed versions; never equate successful schema restore with API accessibility. No unrelated dependency upgrade is made in this lane.

## If Supabase is replaced

Export standard SQL/data and managed-schema dependencies separately. Supabase Vault, auth.uid()/JWT helpers, platform roles and APIs are not ordinary portable application SQL. Select either a verified compatible hosted API/IdP integration or an application-owned authenticated API; do not expose PostgreSQL to browser clients. The Operator Console requires an adapter or API implementation before cutover.

Inspect actual use of Supabase Auth/Storage/Realtime/Edge functions before estimating replacement effort. Export objects with key/version/size/hash manifests; re-create ACLs and validate visibility. Password/MFA/identity migration must use documented supported formats, or a deliberate reset/re-enrollment workflow. Do not copy credentials through chat or logs. Update environment secret references, connection pools, TLS, IdP callbacks, CORS and API contracts through reviewed configuration.

Provider-independent logical dump is necessary but insufficient for full application recovery. Export license/access metadata alongside research/documents; the right to store or redistribute content does not follow merely from possession.

## Rollback model

Before cutover the old system remains authority and new target can be abandoned with scoped cleanup approval. After cutover, do not simply point back: new writes must be reconciled into a consistent old target or explicitly retained and compensated. Fence target writer; capture post-cutover delta and external effects; verify compatible reverse import and replay in isolation; get rollback authority; restore one writer. If reverse mapping fails, maintain read-only degraded service while fixing forward, preserving all source/delta evidence. Destructive down-migrations are not a default rollback.

Trigger rollback assessment on integrity/hash mismatch, incorrect authorization, lost provenance, unexplained record gaps, sustained failure above accepted SLO or recovery objective failure. Numeric application SLOs require measured baseline and owner acceptance rather than invented thresholds.

## SDN-003 changes after PDP acceptance

Do not edit #136 / #137 in this milestone. Its later amendment must:

- reference the accepted PDP decision commit and named provider/environment;
- replace independent recovery assumptions with shared authority matrix and recovery frontier;
- add control-origin outbox/inbox and SDN-origin summary contracts with fencing and no dual-write rule;
- size spool/off-host backup from accepted load and outage budget;
- integrate managed DB outage, revocation freshness, provider-region failure and independent export restore drills;
- prohibit local promotion to control authority and reject stale grants;
- require approved PDP cost/security/recovery evidence before activation;
- retain no public PostgreSQL, separate purge authority and independent restore proof.

PDP acceptance becomes a blocking activation dependency, not permission to activate SDN. Existing production-boundary controls cannot be weakened by this architecture.

## Risk and blocker register

| ID | Missing evidence / risk | Owner / resolution | Gate |
| --- | --- | --- | --- |
| PDP-R01 | Monthly ordinary/emergency ceiling and availability class undefined | Joseph chooses after reviewing cost/resilience options | Binding selection |
| PDP-R02 | Peak TPS/concurrency/vector working set, growth and WAL amplification unmeasured | Architecture operator measures representative isolated workload | Sizing and cost acceptance |
| PDP-R03 | Full Supabase Auth/API/Vault/objects/functions dependency usage unknown | Application owner produces redacted inventory and compatibility rehearsal | Migration selection |
| PDP-R04 | Exact region/SKU/HA quotes incomplete for hyperscalers; backup vendor unknown | Research/operator retrieves comparable official quote and off-host restore costs | Economic comparison |
| PDP-R05 | Supabase HA writer failover evidence and PrivateLink tier ambiguous; Pro platform audit absent | Supplier review and architecture owner verify exact entitlement and compensations | Security/resilience fit |
| PDP-R06 | No controlled managed restore/exit drill on selected platform | Recovery operator and independent verifier; paid drill requires separate authority | Activation, not permission to spend now |
| PDP-R07 | Home hardware/network/UPS/replacement inventory unknown | Joseph and SDN operator document actual equipment and failure domains | SDN activation |
| PDP-R08 | Sync implementation and compromise/replay tests not built | Runtime/SDN owners implement separately after accepted design | Routing activation |
| PDP-R09 | Identity migration/MFA/session behavior unverified | Identity owner validates provider-supported route or reset plan | Cutover |
| PDP-R10 | Off-host key escrow/provider account compromise could defeat recovery | Security/recovery owner proves independent keys/account/restore | Production readiness |
| PDP-R11 | Hosted application location and its dependency on local host unknown | Application owner documents hosting topology | Continuity claims |

Joseph remains accountable until implementation owners are explicitly assigned; these role labels do not invent running VEs or delegated assignments. No exceptions are approved. Any later exception needs Joseph's named decision, scope, expiry and compensating evidence.

## Acceptance criteria

PDP planning acceptance requires:

- provider matrix with dated primary evidence and unresolved retrieval/quote limits visible;
- explicit A/B/C checkpoint and preferred validation candidate;
- every required family classified with conflict authority;
- outbox/inbox identity, sequencing, ack, retry, reconciliation and replay design;
- all named failure cases and integrated recovery sequence;
- assumed cost scenarios separated from measured inventory and approved budget;
- security, migration/rollback, dependency changes and human activation boundaries;
- bounded remaining blockers with owners, evidence and next actions;
- draft review, documentation checks and durable continuity/RunBook capture.

Binding provider selection additionally requires R01-R05 resolved enough to support the choice. Controlled non-production proof may be planned without creating a paid resource; paid validation requires a separate explicit scope and spend authorization.

Production activation additionally requires named operators, selected separate environment, paid scope approved, actual topology/secrets controls, measured restore objectives, independent backups and keys, replay/outage/compromise tests, verified identity and permissions, migration/rollback rehearsal, cross-lane acceptance and specific C4 authorization. No production activation approval is requested by this document.
