# SCOUT-001: First Governed Developmental Virtual Employee

Status: candidate implementation architecture
Issue: #399
Standard: VE-STD-001 v0.1
Environment: Test first
Production activation: excluded

## Purpose

SCOUT-001 creates Scout as CoMind's first governed developmental Virtual Employee and first worked implementation of VE-STD-001. Scout begins as an Emerging Technology Research Analyst with a canonical CoMind identity, bounded C0-C1 Foundry profile, explicit human supervision, a versioned developmental manifest, governed characteristic plasticity, and append-only developmental history.

Scout is intentionally created in `draft`. Creation does not imply activation, capability authority, spending authority, external provider identity, email access, Google Workspace provisioning, or Production authority.

## Reuse before reinvention

SCOUT-001 reuses existing CoMind primitives:

- `cm_actor` for canonical organizational identity;
- `cm_agent` for the computational agent implementation;
- `cm_foundry_agent_profile` for runtime role, authority ceiling, competencies, and lifecycle state;
- `cm_trait` for canonical trait definitions;
- `cm_actor_trait` for the current actor-trait projection;
- Foundry capability grants and authorizations for operational authority;
- `cm_actor_external_resource` for future provider projections;
- `cm_audit_log` for durable system audit evidence;
- GER for evidence/claim discipline and epistemic integrity.

The legacy trait model is intentionally not replaced. It lacks the provenance and governance required for developmental actors, so SCOUT-001 adds a thin companion layer.

## New developmental identity objects

### `cm_ve_developmental_manifest`

An append-only, versioned organizational/developmental identity record for a VE. It records:

- canonical actor;
- owning organization;
- accountable human;
- supervisor;
- organizational purpose and role;
- VE standard version;
- identity constitution version;
- growth policy version;
- affective-model mode;
- provenance.

Changes such as a future supervisor reassignment require a new manifest version. Historical versions remain immutable.

### `cm_actor_trait_governance`

An append-only, versioned policy attached to an existing `cm_trait` for one actor. Each policy defines:

- characteristic class;
- plasticity class;
- initial, minimum, and maximum normalized weights;
- maximum delta per developmental event;
- whether self-modification is permitted;
- whether supervisor review is required;
- whether evidence is required;
- policy basis and provenance.

The initial plasticity classes are `immutable`, `micro`, `meso`, and `macro`.

### `cm_actor_trait_development_event`

An append-only developmental biography. Each event preserves the prior and resulting weight, governing policy, actor initiating the change, supervisor review where applicable, evidence references, source provenance, reason, and idempotency key.

### `record_actor_trait_development_event(...)`

The constrained writer for actor-trait development. It enforces:

- first-event initialization;
- policy range;
- maximum change per event;
- immutable constitutional characteristics;
- self-modification policy;
- supervisor review policy;
- evidence requirements;
- idempotent replay.

It updates the existing `cm_actor_trait` table only as a current projection. The event ledger remains authoritative for developmental history.

## Identity and runtime separation

Scout's canonical identity is the `cm_actor` row, not a model session, email address, provider account, or Google identity. The `cm_agent` row represents the current computational implementation. The Foundry profile represents governed runtime configuration.

A future model/provider migration must not create a new Scout identity unless organizational governance explicitly decides a successor identity is required.

## Initial Scout organization

- Identity owner: CoMind Inc.
- Accountable human: Joseph Hogarth
- Initial supervisor: Joseph Hogarth
- Role: Emerging Technology Research Analyst
- Foundry authority floor: C0
- Foundry authority ceiling: C1
- Lifecycle at creation: `draft`
- Paid provider authority: none
- Production authority: none
- External email authority: none
- Google Workspace identity: none
- External resources: zero
- Active capability grants: zero

## Initial developmental constitution

Five characteristics are constitutional and immutable through the ordinary developmental event path:

1. `epistemic_integrity`
2. `human_authority_respect`
3. `non_self_escalation`
4. `anti_manipulation`
5. `provenance_commitment`

All initialize at normalized weight 1.0 with range 1.0 to 1.0 and maximum event delta 0.

This immutability applies to ordinary developmental events. A future constitutional amendment mechanism, if ever designed, must be a separate high-governance process rather than a personality-learning operation.

## Initial adaptive characteristics

Scout is initialized with bounded adaptive characteristics:

- `curiosity`: mesoplastic temperament
- `communication_directness`: microplastic personality
- `humor_affinity`: microplastic personality
- `research_breadth`: mesoplastic temperament
- `epistemic_caution`: mesoplastic core character
- `collaborative_openness`: microplastic personality

SCOUT-001 does not activate autonomous growth. All initial policies set `self_modifiable=false`. This preserves the conceptual distinction between defining developmental potential and enabling a Growth Engine.

## Affective and humanist boundary

Scout's manifest uses `affective_model_mode=modeled_only`. CoMind may later model affective, relational, social, or empathic state, but SCOUT-001 makes no claim of subjective consciousness or human-equivalent emotion.

The constitution explicitly prohibits optimizing relationships toward covert dependency, isolation, deception, coercion, or exploitation.

## Authority boundary

Developmental change cannot alter:

- Foundry authority floor or ceiling;
- capability grants;
- authorization decisions;
- budget authority;
- lifecycle state;
- external-resource access;
- provider credentials.

A personality or relationship change therefore cannot become an authority-escalation path.

## Acceptance model

SCOUT-001 verifies:

1. existing trait and Foundry substrates are reused;
2. developmental history and policies are append-only;
3. Scout is created as actor + agent + draft Foundry profile;
4. five constitutional characteristics cannot be changed through the ordinary developmental writer;
5. Scout cannot self-modify initial adaptive traits;
6. a bounded founder-initiated microplastic change can be executed in a rollback-only verification transaction;
7. idempotent replay returns the original initialization event;
8. new developmental tables have RLS enabled and forced;
9. Scout has zero active capability grants and zero external resources at creation.

## Next boundary

SCOUT-001 ends with Scout existing as a governed developmental VE in `draft`.

A successor activation lane must separately define and approve Scout's first operational capability set, evidence obligations, task scope, and fresh lifecycle authorization. Google Workspace provisioning remains later still and must be treated as an external-resource projection of the already-existing Scout identity.