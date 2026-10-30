# SCOUT-002 Minimum C1 Research Package Provenance

Control: SCOUT-002  
Issue: #409  
Environment: isolated/Test only  
Production activation: false

## Purpose

Prepare Scout for its first bounded research milestone while preserving the accepted SCOUT-001 birth boundary. This lane defines capability, curriculum activation policy, evidence obligations, and the first assignment. It does not activate Scout and does not grant live runtime authority.

## Authoritative predecessor

Canonical Scout state comes from issue #395 and merged PR #398. Duplicate recovery issue #399 and closed unmerged PR #402 are preserved as design evidence but do not define runtime state.

Accepted predecessor invariants:

- actor `agent.scout`;
- role `emerging_technology_research_analyst`;
- lifecycle `draft`;
- authority C0-C1;
- zero active capability grants;
- zero external resources;
- zero budget-authority bindings;
- no paid provider authority;
- no Production authority;
- no delegation;
- no developmental self-mutation.

RLIB-003 is accepted on main after the post-merge migration namespace correction in issue #403 / PR #405.

## Reuse decision

SCOUT-002 does not create a second agent platform, research store, learning-management system, provider registry, or authority model.

It reuses:

- canonical Scout actor, agent, and Foundry profile;
- Foundry capability, grant, authorization, execution, recovery, and outcome substrate;
- local Ollama Foundry adapter;
- RLIB Research Library and VE standards learning path;
- canonical `cm_evidence` and `cm_audit_log` evidence concepts;
- accepted VE lifecycle controls;
- Durable RunBook for lane continuity.

The existing `mdo.plan.research` capability is not reused as Scout's general research authority because its target kind and adapter semantics are specifically tied to MDO module plans. Reusing it would conflate organizational role with a mismatched capability contract.

## Minimum capability

SCOUT-002 defines exactly one capability:

`research.evidence.synthesize`

Contract:

- action `synthesize_evidence`;
- target kind `research_assignment`;
- maximum authority C1;
- low risk;
- non-cost-bearing;
- initial adapter `ollama_local`;
- first target `scout-r001:ve-standards-operational-readiness`;
- one-task initial ceiling;
- isolated environment only;
- expiry required;
- revocable;
- no delegation.

Capability registration is not a grant. SCOUT-002 must leave the canonical Scout profile draft with zero active grants.

## Learning-path activation policy

The RLIB-003 learning path remains a governed curriculum object rather than an implicit authority source.

Activation requires current primary required sources, strong fingerprints, freshness, correct source-authority classification, correct withdrawn-source supersession, exact accepted VE standard lineage, unchanged Scout identity/authority boundaries, and attributable accountable-human attestation.

Curriculum activation, curriculum completion, Scout lifecycle activation, capability grant, and execution authorization remain separate events.

## Evidence contract

The SCOUT-002 evidence contract carries forward the SCOUT-001 manifest obligations and makes the first operational research proof machine-checkable. It requires source provenance and authority, lifecycle status, observation time, findings, uncertainty, contradictory or negative evidence, currentness caveats, tool/model provenance, exact authority and authorization provenance, explicit cost, work-product digest, human review state, failures/escalations, and developmental-change disclosure.

Research output cannot expand authority, activate Scout, or mutate developmental identity.

## First assignment

`SCOUT-R001: VE Standards Operational-Readiness Synthesis`

The assignment uses only the supplied RLIB-003 source packet and accepted VE-STD-001. Open-web discovery is deliberately excluded from the first proof. Scout must distinguish current primary sources, secondary non-normative guidance, and withdrawn historical evidence; map risk and GenAI controls to its own bounded research role; preserve currentness caveats and uncertainty; identify prohibited actions; and recommend no authority expansion.

The assignment is defined but not authorized by SCOUT-002.

## Acceptance model

Dedicated CI provisions the accepted Foundry substrate and canonical Scout draft identity in disposable PostgreSQL 17, registers the capability twice for idempotency, validates all machine-readable package artifacts, and executes a synthetic active acceptance profile through the real Foundry runtime broker with a deterministic local-adapter test double.

Required negative proofs include:

- wrong target rejected;
- C2 request rejected;
- one-task ceiling enforced;
- expired grant rejected;
- revoked grant rejected;
- no budget binding required because the capability is non-cost-bearing;
- rejected executions do not reach the adapter;
- canonical Scout remains draft with zero live grants before and after the proof.

The existing local Ollama adapter unit and integration controls remain responsible for the local HTTP/provider boundary. No paid provider call is required for SCOUT-002 acceptance.

## Next lifecycle boundary

After SCOUT-002 is accepted and merged, operational use of SCOUT-R001 still requires separately attributable evidence for learning-path activation/attestation, fresh C2 Scout lifecycle activation authorization, an exact C1 capability grant, and a fresh execution authorization. Those actions are intentionally excluded from this lane.
