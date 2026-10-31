# DRULE-003 Governed Rule Activation and Authority Resolution Evidence

Date: 2026-10-25  
Issue: #202  
Pull request: #203  
Branch: `drule-003-governed-rule-activation`  
Environment: CoMind Test / private `comind_pm` schema  
Production: unchanged and not authorized by this work

## Purpose

DRULE-003 adds the governed activation layer above the Durable Rulebook and DRULE-002 reconciliation system.

The governing transition is:

`candidate or existing rule -> authority resolution -> conflict clearance -> activation review -> exact approved version -> active authority state -> later applicability/enforcement eligibility`

Discovery remains separate from activation. Candidate promotion remains separate from activation. Recency alone does not establish authority.

## Starting state

DRULE-003 began from repository `main` commit `152d5869035cf4253df3c838afd6a960e0a8b745`, after DRULE-002 repository parity had merged and Lane Health #201 had subsequently landed.

The live Test Rulebook baseline at implementation start was:

- PostgreSQL 17.11
- 157 normalized rules
- 157 rule versions
- 44 rule candidates
- 18 unresolved reconciliation cases

The unresolved cases already included activation-review, authority, conflict, equivalence, scope-overlap, and supersession families.

## Current platform verification

Current Supabase/PostgreSQL guidance was checked before implementation. The relevant conclusions were:

- row-level security and SQL grants are complementary controls rather than substitutes;
- derived governance views use `security_invoker = true` so they do not bypass underlying row-level security;
- the current breaking-change list did not identify a change invalidating the planned PostgreSQL authority model;
- the live Test project reports PostgreSQL 17.11.

The external references were written through to the Development Journal as event `704a57d3-00c6-4ced-9aa2-370dab3600c0` rather than left only in conversational research.

References:

- https://supabase.com/changelog?types=breaking-change
- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://supabase.com/docs/guides/database/views

## Repository contract

DRULE-003 adds:

- `db/migrations/20261025_014_drule_003_governed_rule_activation.sql`
- `db/sql/20261025_drule_003_founder_authority_seed.sql`
- `db/verification/20261025_drule_003_governed_rule_activation_verification.sql`
- `scripts/test_drule_003_governed_rule_activation.sh`
- `.github/workflows/drule-003-governed-rule-activation.yml`
- this provenance record

Migration `014` was selected only after inspecting the current October 25 migration namespace and confirming DRULE-002 owns `012` and `013`.

## Authority contract

`pm_rule_authorities` represents scoped authority rather than forcing every governance relationship into one global numeric hierarchy.

The contract records:

- authority class;
- authority subject type and identity/reference;
- JSON scope;
- explicit governance capabilities;
- optional precedence rank only when a precedence basis is also recorded;
- delegation lineage through an optional parent authority;
- mandatory evidence references;
- validity interval;
- lifecycle status.

Supported authority capabilities are `approve`, `activate`, `supersede`, `override`, `revoke`, and `recommend`.

Authority confidence in source archaeology is not treated as authority itself.

## Activation contract

`pm_rule_activation_requests` requires an exact `(rule_id, rule_version)` foreign key and records target state, environment, scope, requester, rationale, evidence, and projected status.

`pm_rule_activation_case_links` reuses DRULE-002 reconciliation cases instead of creating a second conflict system.

`pm_rule_activation_authority_assessments` records append-only capability-specific authority determinations.

`pm_rule_activation_events` records append-only submission, blocking, approval, denial, deferral, activation, supersession, and revocation events.

Database triggers enforce that a governed decision or lifecycle event has a valid active authority with the required capability and a latest sufficient authority assessment.

An `activated` event additionally requires:

- the activation request to already be approved;
- no linked blocking reconciliation case to remain open, under review, or deferred;
- no already-active request for the same rule and exact target environment/scope.

Supersession and revocation require a prior activation event. Event and authority-assessment history cannot be updated or deleted.

## Deterministic projections

`v_rule_activation_readiness` answers whether an activation request is currently ready, including unresolved blockers and whether sufficient activation authority has been established.

`v_active_rule_authority` answers which exact rule version is active, for which environment and scope, since when, by which actor, under which authority, and with both authority and decision evidence.

Both views are created with `security_invoker = true`.

## Security boundary

All five new DRULE-003 tables have RLS enabled.

`PUBLIC`, `anon`, and `authenticated` have no table access. `service_role` is the governed private access path. Helper functions also have client-role execution revoked.

No production, C4, public-data, RLS-weakening, or grant-expansion action is included.

## Live Test verification

Migration `drule_003_governed_rule_activation` was successfully applied to the CoMind Test project.

The repository behavioral verification was then executed directly against Test inside a rollback transaction. The synthetic proof established:

1. an activation request naming a nonexistent rule version is rejected by the exact-version foreign key;
2. insertion of a valid request automatically creates an auditable submitted event;
3. a sufficiently assessed approval authority can approve the request;
4. an open linked activation-review reconciliation case causes an attempted activation to be rejected by the database;
5. the readiness projection reports the request as not ready while that blocker is unresolved;
6. resolving the blocker makes the same request ready to activate;
7. a sufficiently assessed activation authority can then activate the exact version;
8. the active-rule projection identifies the exact activated version and authority;
9. attempts to mutate activation-event history are rejected as append-only.

Immediately before rollback, the synthetic proof contained exactly:

- 1 authority
- 1 activation request
- 2 authority assessments
- 3 activation events
- 1 active-rule-authority projection

The transaction then rolled back its synthetic verification rows.

## Founder authority evidence

The founder's authorization to complete the seven-step Rulebook evolution sequence was not previously stored as an authorization event, so it was durably recorded as Development Journal event:

`e4df3351-d006-49bb-8757-7ccc982888ee`

Durable source reference:

`chat:2026-10-25:seven-step-rulebook-authorization`

The event explicitly preserves existing production, C4, security, and stronger authorization boundaries.

The bounded seed `AUTH-FOUNDER-001` was then written to Test with:

- class: `founder`
- subject: `Joseph Hogarth, Founder`
- capabilities: approve, activate, supersede, override, revoke, recommend
- evidence: the durable conversation authorization plus GitHub Issue #202
- explicit metadata declaring it the minimal DRULE-003 authority substrate, not the full future Authority Graph
- explicit scope language preserving separately governed production/C4/security boundaries

The seed uses stable project key `COMIND` and authority key `AUTH-FOUNDER-001`; it does not hard-code generated database UUIDs.

A readback confirmed the authority is active in Test.

## Repository CI hardening

Existing general CI does not automatically execute every SQL file under `db/verification`. DRULE-002 therefore had a repository verification artifact without a dedicated invocation path.

DRULE-003 closes that gap with:

- `scripts/test_drule_003_governed_rule_activation.sh`, which bootstraps an isolated PostgreSQL database, applies the PM Ledger and DRULE-002 prerequisites, applies migration `014`, runs the structural/behavioral verifier, applies the founder-authority seed twice, and asserts that the seed remains exactly one valid authority record;
- `.github/workflows/drule-003-governed-rule-activation.yml`, a path-scoped workflow that checks out and verifies the exact PR head before running the isolated proof.

## First exact-head PR matrix

Draft PR #203 was opened from implementation head `de94e4d2854f218829fede0e1162085e4241c2b0` against `main` `152d5869035cf4253df3c838afd6a960e0a8b745`.

Immediately before the PR opened, the branch was six commits ahead, zero commits behind, and the diff contained exactly six additive DRULE-003 files.

The first exact-head GitHub Actions matrix contained 15 workflows. All 15 reached terminal success, including:

- `DRULE-003 Governed Rule Activation`, whose isolated PostgreSQL proof reconstructed the PM/Rulebook prerequisites, applied migration `014`, ran the structural/behavioral verifier, replayed the founder seed twice, and proved idempotency;
- general `CI`, including build/tests, PM Ledger, devcontainer, SDN ingestion, FinOps authority, Foundry substrate, conversation lifecycle, and browser-backed development-runtime verification;
- `DRB-002 Query Contract`;
- `No Placeholder Policy`;
- `CoMind Repository Configuration`;
- `Lane Health Sentinel Observe`;
- `Runtime Budget Authority Adapter`;
- `Governed Provider Execution`;
- `Live Foundry Stage 1 Readiness`;
- `Live Foundry LF-2 Readiness`;
- `Live Foundry LF-3 Readiness`;
- `Foundry Runtime Orchestration`;
- `Foundry Work Lease Kernel`;
- `Foundry Terminal Lifecycle`;
- `Foundry Test one-shot local handoff`, including successful bounded local-model pull, isolated substrate verification, work-lease verification, one synthetic ATLAS-to-PROOF handoff, and evidence preservation.

No workflow failed or required bypass/retry.

A post-matrix read confirmed `main` was still `152d5869035cf4253df3c838afd6a960e0a8b745`, so no base refresh or migration renumbering was required before this final content freeze.

## Final-head evidence protocol

This provenance refresh is the final planned repository-content change before merge consideration.

A repository file cannot contain CI proof for the commit that contains that proof without creating a new commit and invalidating the just-recorded head. DRULE-003 therefore uses the following non-self-referential evidence protocol:

1. freeze repository content with this provenance refresh;
2. run the complete PR workflow matrix against that new exact head;
3. make no further repository-content change if the matrix is green and `main` remains compatible;
4. record the immutable final-head SHA and terminal workflow evidence in PR #203 and the canonical Development Journal;
5. merge only that exact verified head.

This keeps the content head immutable between final verification and merge while still preserving durable final-head evidence outside the head being verified.

## Recoveries during implementation

Two small implementation-time errors were surfaced and handled without silent workaround:

1. A Development Journal research write initially used unsupported `source_system='web'`. The row was rejected by the existing constraint. The constraint was inspected, the allowed vocabulary was established, and the research event was written with `source_system='manual'` while retaining the actual external URLs in evidence.
2. The founder-authority seed write committed successfully, but the same multi-statement call's final readback query used an ambiguous unqualified `status` column. The write was not blindly replayed. A separate qualified readback established that the intended authority record already existed and matched the contract.

A later attempt to retrieve live logs for the still-initializing one-shot GitHub job returned no available log blob through the connector. This was treated as a visibility limitation, not as workflow failure; authoritative job-step state was used instead, and the job later completed successfully.

## Remaining merge gate after content freeze

Before DRULE-003 can merge:

- the complete workflow matrix must reach terminal success on the new exact content head created by this provenance refresh;
- any failure must be investigated and repaired rather than bypassed;
- `main` must be checked once more for compatibility and migration `014` collision;
- PR #203 and the Development Journal must record the immutable final-head SHA and workflow evidence;
- the PR must be marked ready only after those gates pass;
- merge must use the expected verified head SHA.

Issue #202 owns this implementation lane. Step 3 of the broader Rulebook sequence remains the fuller Authority Hierarchy / Authority Graph and is intentionally not silently collapsed into this seed.
