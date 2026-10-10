# Provider Independence and Model Arbitration Provenance Record

Date: 2026-10-10
Issue: #104
Branch: `issue-104-provider-independence-arbitration`
Base main: `8d6bead77ab5064f070b6eb7b2a7abed60ac93c9`

## Decision

CoMind adopts provider independence and governed model arbitration as a Greater CoMind architectural direction.

Canonical statement:

**CoMind owns the continuity of cognition, not the underlying LLM vendor.**

Supporting rules:

- Agents never own credentials. Agents receive governed capabilities.
- No externally consequential action bypasses the Capability Control Plane.
- BYOK, BYOM, BYOP, and CoMind Managed are first-class provider acquisition modes.
- A strict second opinion requires model-family independence, not merely a different endpoint or account.
- Consensus is evidence, not truth.
- External gateways are replaceable adapters, not CoMind governance authorities.

## Lineage

The decision generalizes provider-independence concepts previously developed for the CoMind PTSD infrastructure, including user/provider choice, private/BYOK operation, managed versus user-funded usage, team-scoped routing, and local/offline model concepts.

The current evidence supports strong historical design intent and architecture lineage. It does not establish that a production-ready generalized BYOK/provider gateway was completed in the earlier PTSD implementation.

## Repository findings

The repository already contains provider-neutral infrastructure that must be reused:

- immutable provider execution envelope;
- governed provider execution wrapper;
- Foundry capability broker/runtime authorization;
- budget authority and FinOps controls;
- provider telemetry and provenance.

The current application surface still contains direct OpenAI coupling and provider-specific configuration. Initial paths are recorded in the Issue #104 retrofit plan.

## Concurrency boundary

At branch creation, PR #84 remained open for ACP-001 independent acceptance review. Issue #104 therefore begins as an architecture/documentation slice and does not alter ACP-001 runtime code, production routing, live Supabase, or paid-provider configuration.

## Artifacts

- `docs/architecture/provider-independence-and-model-arbitration.md`
- `docs/roadmap/provider-independence-retrofit-plan.md`
- this provenance record
- GitHub Issue #104

## Safety state

This architecture slice performs no paid model call, no live database mutation, no provider-key creation, no production enablement, and no credential handling.

## Next implementation dependency

After architecture acceptance, the first implementation slice should introduce provider/model descriptors, explicit model-family identity, and a canonical provider registry while preserving current fixture/OpenAI behavior and reusing all existing execution, financial, authorization, and provenance authorities.
