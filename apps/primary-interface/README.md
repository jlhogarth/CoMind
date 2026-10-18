# PI-001 Operator Cockpit

Issue: https://github.com/jlhogarth/CoMind/issues/142

Architecture acceptance is established by Joseph's PI-001 handoff. Production acceptance is open. This directory is the product-owned interface boundary; `brand/` supplies presentation and OC-002 supplies separately governed relational administration.

## Ownership and integration

| Area | Owner / integration boundary |
| --- | --- |
| Product navigation, attention and operational summaries | PI-001 |
| Semantic colors, motion, layouts, profile registry | BRAND-001 #138 / PR #139 |
| Relational explorer and protected administrative routes | OC-002 #118 / PR #119 |
| Agent identity, capability, authorization and leases | Foundry contracts, consumed through reviewed adapters |
| Transactional state and human decisions | Supabase control plane, read-only project decision integration tested in isolation |
| Large evidence and cognitive artifacts | SDN data plane, bounded source references in cockpit |
| Consequential history | Durable RunBook, authoritative source integration still open |

Do not copy OC-002 routes, invent a second agent registry, or apply `brand/sql/operator-cockpit-v2.sql` as a deployment migration. That SQL is a design sketch with incomplete identity, authority, RLS and evidence relationships. Existing `brand/operator-cockpit-v2.html` remains a clearly marked architecture fixture. Its invented metrics and local resolutions cannot populate the operational cockpit.

## Navigation contract

Use stable entity identifiers in URLs, preserve filters on back navigation, and make every headline metric open the exact filtered records used for its calculation. Unknown/partial data must include coverage and source time; an empty successful query differs from a failed or forbidden query.

| Route | Primary drill-down | Source requirement |
| --- | --- | --- |
| `/attention` | `/attention/:id` | Stop reason, boundary, recommendation, consequences, evidence, RunBook, actions |
| `/lanes` | `/lanes/:id` | Owner, lifecycle, dependencies, issue/PR/head, next boundary |
| `/ves` | `/ves/:id` | Job, work, authority, capabilities, lease, dependencies, freshness, failures, escalations, consumption, context, recent actions |
| `/runbook` | `/runbook/:id` | Consequential event, actor, time, outcome, source, related records |
| `/evidence` | `/evidence/:id` | Claim, source identifier/hash where available, verifier, verification time, expiry, contradiction |

These are reserved product routes, not implemented HTTP endpoints. Unavailable fields render as unknown with a reason. Registered VE counts must never imply executing VE counts. A lease does not confer execution authority.

## Priority and acceptance backlog

| Order | Deliverable | Current acceptance / next proof |
| --- | --- | --- |
| P0.1 | Human attention | Pure presentation assessment implemented; canonical sources are not yet a complete attention assessment; decision recording stays open |
| P0.2 | Navigation and drill-down | Route contract defined; keyboard, history, deep-link and filtered count proof open |
| P0.3 | Development lanes | Source adapters, dependency state and exact-head evidence open |
| P0.4 | VE operations | Full detail contract above; canonical registry/lease mapping and freshness proof open |
| P0.5 | Durable RunBook | Source discovery and relational linking open; no duplicate ledger authorized |
| P0.6 | Evidence/provenance | Assessment rejects unverified, expired, future or conflicting evidence; immutable source integration open |
| P1 | Monitoring, reporting, auditing, search/command, module dependencies, governance, cost | Exception-first monitoring; audit distinct from activity; each source must declare coverage, units and time window |
| P2 | Memory, ARIS, customization, administration | Integrate contributing modules after P0; OC-002 remains administration owner |
| P3 | Advanced visualization | Only after operational data and accessibility are proven |

## Human-action v1 projection

`src/human-attention.mjs` accepts an object with `id`, `laneId`, `status`, `stopReason`, `authorityBoundary`, `recommendation`, `consequences`, `requestedAt`, `expiresAt`, `revision`, `evidence`, and `runbookRefs`. Text fields must be nonempty; times are UTC ISO instants. `status` is open, approved, held, rejected or superseded. Revision is a positive integer.

Each evidence object has `id`, `sourceRef`, `verifiedAt`, `expiresAt`, `verification` (verified/unverified) and `conflict` (boolean). Each RunBook reference has `id` and `sourceRef`. References are opaque identifiers displayed as text until a source-specific resolver validates a navigation URL. External source content is untrusted, never executable markup or instructions.

`assessHumanAction(record, now)` returns `state`, `issues`, `navigation`, and `decisionOptions`. `now` is explicitly injected so callers can assess the same source snapshot deterministically. At expiry the record is stale. Missing or future timestamps cannot count as fresh. Invalid, incomplete and stale items stay inspectable. Closed requests have no decision options. Complete fresh open items offer approve/hold/reject as presentation choices only. No function in this module writes, authenticates, authorizes, executes work or certifies evidence truth.

## Future server decision boundary

Before enabling any mutation, the trusted server must authenticate the operator, authorize the exact action and C-level scope, reload the canonical record, compare revision and evidence digest, recheck expiry, and transactionally record the decision with an idempotency key, actor, time, rationale and RunBook/audit linkage. Conflicting revisions return a refresh requirement. Failed persistence leaves the queue unresolved. Approval records a decision only; execution requires separate current capability, lease, budget and authorization checks. Never infer C4 approval from a T3 engineering label.

Browser roles receive only explicitly reviewed least-privilege/RLS projections. No secret/service-role credentials belong in browser code. No browser-only approval state is authoritative. No production identity or database policy is implemented by this slice.

## Verification and recovery

Run `node --test apps/primary-interface/test/*.test.mjs`. Tests use identified synthetic fixtures only. Dedicated CI has no network/provider/database calls. Work is additive T1 repository development, with no new package dependencies or paid cost. Evaluation is linear in evidence/reference count. Revert PI-only commits to recover; BRAND-001 and OC-002 files are untouched.

## Read-only browser detail and navigation

Serve the repository root, for example with `python -m http.server 8000`, then open `http://localhost:8000/apps/primary-interface/index.html#/attention`. This is a development browser surface, not a deployed operational cockpit. The default source is explicitly unavailable; no mock operational metrics or records are bundled into the entry point.

`src/cockpit.mjs` renders the existing assessment, source coverage/time, stop reason, authority boundary, recommendation, consequences, evidence/freshness issues, RunBook references and disabled decision controls. Missing fields remain unavailable. No history contents are inferred from references. Every decision control remains disabled even when the presentation contract is reviewable. Refresh assessment rechecks time; displayed assessment time is explicit and there is no background rerender that would destroy keyboard focus or an unfinished filter.

Entity URLs use hash routes (`#/attention/:id`) for portable static hosting without server rewrites. The reserved product paths remain `/attention`, `/lanes`, `/ves`, `/runbook`, `/evidence`. Native links, forms, skip link, visible focus and hash history support keyboard/back/forward navigation. Query filters persist in detail links and return links. A headline count links to precisely its filtered source snapshot, never to an inferred live total. Other entity detail routes identify the requested record and explain unavailable adapters.

Canonical source inspection and unresolved integration requirements: `docs/SOURCE-MAP.md`. Browser proof: `node apps/primary-interface/test/browser-proof.mjs` with Playwright and Chromium installed; `PI_PLAYWRIGHT_MODULE` can point to a separately installed Playwright package. No browser package is a production dependency.

## Canonical read projection development

`src/canonical-projections.mjs` provides bounded, dependency-free projections for existing Foundry requests, PM decisions and lane work items. This is a separate source contract, not a complete `assessHumanAction` input. No unsupported conversion is supplied. The isolated reader connects lanes and PM decision records through the trusted-server path. Foundry authorization reads remain disconnected pending a verified join between Foundry project UUIDs and PM project keys. See `docs/CANONICAL-READS.md` for field semantics, explicit resolvers and production activation blockers.

## Read-only development lanes

`mountCockpit` accepts a separate `lanes` source with `status`, expected `project`, and DRB `envelope`. It renders canonical UUID deep links, owner, lifecycle, summary, source times, coverage and unresolved integrations. `reader.html` is a separate opt-in page using the isolated same-origin API for lanes and raw PM decision records. The server authenticates an operator session, checks project scope, and uses a distinct backend credential; browser code never receives it. PM decision rows are not treated as Foundry authorization or completed human-action assessments. Test-only PostgreSQL scope proof is pending exact-head CI. The default index remains disconnected. This does not establish production identity, grants, security acceptance or activation.
