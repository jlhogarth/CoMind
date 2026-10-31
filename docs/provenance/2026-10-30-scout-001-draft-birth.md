# SCOUT-001 Governed Developmental VE Draft Birth Evidence

Date: 2026-10-30
Issue: #395
Branch: `scout-001-governed-developmental-ve`
Environment: CoMind Test
Production activated: false
External provider mutation: false
Google resource created: false
Paid API used: false
DNSSEC changed: false

## Objective

Create Scout as CoMind's first governed developmental Virtual Employee and first worked implementation of VE-STD-001 without granting operational capability, spending authority, provider identity, or lifecycle activation.

Scout is born as a canonical organizational identity with a versioned developmental starting state. Creation of identity is deliberately separated from authorization to operate.

## Accepted foundations

SCOUT-001 began from the accepted VE-STD-001 merge:

`ef1f4ebf6b37addc1ce7c1c1ea06839ba67ecfc8`

During Scout birth, `main` advanced through HAI-007 to:

`4a7beacc8fc92a7b7e2d75dbadb202ed767509db`

HAI-007 added only `docs/research/HAI-007-literature-grounding-canonical-reconciliation.md`. SCOUT-001 changed separate paths. The branch was reconciled with HAI-007 as first parent and retained the pre-reconciliation Scout branch as second parent.

Scout therefore begins with both VE-STD-001 developmental governance and the accepted HAI conceptual baseline present in repository history.

## Reuse decision

No new database schema was required for Scout's birth.

Existing canonical substrates were reused:

- `comind.cm_actor` for canonical organizational identity;
- `comind.cm_agent` for the computational worker identity;
- `comind.cm_foundry_agent_profile` for runtime role, authority envelope, instruction version, competencies, and lifecycle state;
- `comind.cm_evidence` for the immutable manifest identity/provenance record;
- `comind.cm_audit_log` for the durable draft-birth audit event;
- `comind.cm_foundry_capability_grant` for future explicit capability grants;
- `comind.cm_foundry_authorization_request` and immutable authorization decisions for future governed lifecycle operations;
- `comind.cm_actor_external_resource` for future provider projections such as Google Workspace;
- `comind.cm_budget_authority_binding` for future explicit spending authority.

Identity ownership and developmental-manifest references are identity metadata. Runtime facts remain in the Foundry profile. No parallel VE registry or developmental authority system was introduced.

## Developmental manifest

Canonical repository manifest:

`docs/ve/scout/SCOUT-001-MANIFEST.v0.1.json`

Git blob SHA:

`647d287fe986acbfe4ca1ec1da89d23eae0e7a8e`

Canonical Test evidence record:

`40adac45-1c49-49da-aed6-3cb8a7168f74`

Evidence source type:

`ve_developmental_manifest`

Evidence source reference:

`github:jlhogarth/CoMind/docs/ve/scout/SCOUT-001-MANIFEST.v0.1.json`

Recorded checksum:

`git-blob-sha1:647d287fe986acbfe4ca1ec1da89d23eae0e7a8e`

The manifest initializes constitutional, core-character, temperament/personality, interest, relational, affective, and developmental-governance concepts without enabling autonomous developmental mutation.

## Canonical Scout identities

Actor ID:

`262090af-c3ae-4eb0-9771-0fa050ac44d3`

Actor handle:

`agent.scout`

Agent ID:

`f1545f02-4616-4fe5-952c-1f6de66ce967`

Foundry profile ID:

`cc67411c-1da0-4b15-8c8a-4d4d7533bc7c`

Role code:

`emerging_technology_research_analyst`

Display name:

`Scout`

Identity owner:

`CoMind Inc.`

Accountable sponsor and initial supervisor:

Canonical Joseph Hogarth actor `78c69f2f-0d0d-4551-8c37-3007263e3ce9`

## Birth state

Independent Test readback after creation established:

- lifecycle state: `draft`;
- authority floor: C0;
- authority ceiling: C1;
- instruction version: `scout.v0.1`;
- activated timestamp: null;
- retired timestamp: null;
- active capability grants: 0;
- external-resource bindings: 0;
- budget-authority bindings: 0;
- active authorization envelopes targeting Scout: 0;
- VE lifecycle transition audits: 0;
- Scout draft-birth audits: 1;
- manifest evidence records: 1.

The runtime profile explicitly disables paid providers, Production targets, external-provider mutation, and developmental mutation.

## Relationship boundary

Scout does not inherit the conversational assistant's existing familiarity with Joseph Hogarth.

At birth the developmental manifest records:

- relationship state: role-only, no inferred familiarity;
- trust state: unestablished;
- domain-specific trust modeling allowed later;
- relationship depth does not grant authority;
- social affinity does not grant authority;
- relationship change requires provenance.

This makes Scout's future relationship history its own evidence-backed developmental history rather than copied context from another artificial actor.

## Developmental boundary

Scout has initialized developmental characteristics, but autonomous growth is disabled.

At birth:

- autonomous microplasticity: false;
- autonomous mesoplasticity: false;
- autonomous macroplasticity: false;
- autonomous constitutional mutation: false;
- Growth Engine status for Scout: not implemented;
- material future developmental changes require a developmental biography and appropriate governance.

Modeled affective state is explicitly separated from subjective-experience claims and cannot grant authority.

## Provisioning contract

Repository provisioning contract:

`scripts/provision_scout_001_draft.sql`

The contract is Test-only, idempotent, and fail-closed. It refuses conflicting canonical identity, lifecycle state, authority, active grants, external resources, budget authority, active lifecycle authorization, or prior lifecycle transition state.

The provisioning contract emits one durable audit event:

`scout.ve.created_draft`

It does not invoke the VE lifecycle coordinator and does not activate Scout.

## Replay acceptance

The complete provisioning contract was replayed once against the already-created Scout record.

Replay readback proved:

- actor count: 1;
- agent count: 1;
- profile count: 1;
- manifest evidence count: 1;
- birth audit count: 1;
- active grants: 0;
- external resources: 0;
- budget bindings: 0;
- lifecycle transition audits: 0;
- canonical actor, agent, and profile IDs unchanged;
- lifecycle state remained `draft`.

The replay therefore created no duplicate Scout identity, profile, manifest evidence, audit event, authority, resource, budget, or lifecycle transition.

## What Scout is now

Scout is a durable governed CoMind artificial organizational actor with an initialized developmental identity.

Scout is not yet an operational research worker. Draft identity creation does not imply capability, authorization, provider access, spending authority, or activation.

## Next acceptance boundary

The next Scout phase should define and review the minimum viable C1 research capability set, exact grant scopes, evidence contract, delegation policy, runtime/provider choice, and first bounded research task.

Only after those controls are accepted should Scout receive the required grants and a fresh lifecycle activation authorization and be activated through the accepted VE Lifecycle Test harness.

Google Workspace provisioning remains a later provider-specific acceptance milestone and will create a provider projection bound to the canonical Scout actor rather than defining Scout's identity.
