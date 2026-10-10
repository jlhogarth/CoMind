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
- Every provider retry, fallback, or reroute that causes another external request is a distinct governed attempt and must not hide behind automatic SDK retry behavior.
- Material providers, gateways, models, supplier-chain changes, and consequential model/provider changes remain subject to the existing AIMS inventory, risk, approval, and reassessment controls.

## Lineage

The decision generalizes provider-independence concepts previously developed for the CoMind PTSD infrastructure, including user/provider choice, private/BYOK operation, managed versus user-funded usage, team-scoped routing, and local/offline model concepts.

The current evidence supports strong historical design intent and architecture lineage. It does not establish that a production-ready generalized BYOK/provider gateway was completed in the earlier PTSD implementation.

## Repository findings

The repository already contains provider-neutral infrastructure that must be reused:

- immutable provider execution envelope;
- governed provider execution wrapper;
- Foundry capability broker/runtime authorization;
- budget authority and FinOps controls;
- provider telemetry and provenance;
- AIMS AI-system, supplier, risk, oversight, and change-control records.

The current application surface still contains direct OpenAI coupling and provider-specific configuration. Initial paths are recorded in the Issue #104 retrofit plan.

Current GOV-003 evidence also establishes two important boundaries that this architecture must preserve:

- ordinary configured assistant traffic is not yet proven to converge through the later governed-provider wrapper in production;
- Foundry capability/broker evidence is repository/isolated verification, not proof of deployed production autonomy.

Architecture language therefore describes target authority reuse without upgrading repository or isolated evidence into deployed or operating control claims.

## Acceptance review reconciliation

The Issue #104 acceptance review identified and corrected four material ambiguities before approval:

1. **Supplier governance integration.** New direct providers, gateways, upstream model suppliers, and material provider/model changes are explicitly bound to the existing AIMS inventory, risk, approval, and reassessment process. The runtime provider registry must not become a shadow governance database.
2. **Fallback and retry authority.** Multi-provider retry/fallback is explicitly required to preserve the existing one-governed-attempt semantics. Hidden SDK retries or gateway failovers cannot silently create additional cost-bearing attempts under one execution identity.
3. **Evidence-state precision.** The architecture now states that ordinary assistant convergence through the governed wrapper and live Foundry capability operation remain future/deployment work rather than current operating controls.
4. **Implementation sequencing.** The follow-on plan is test-first: freeze current fixture/OpenAI behavior and establish the network-free conformance contract before provider registry migration changes observable routing behavior.

The review also strengthens model provenance by recording resolved model revision/version/build identity when exposed and an observation time when aliases may drift.

## Concurrency boundary

At branch creation, PR #84 remained open for ACP-001 independent acceptance review. Issue #104 therefore begins as an architecture/documentation slice and does not alter ACP-001 runtime code, production routing, live Supabase, or paid-provider configuration.

## Artifacts

- `docs/architecture/provider-independence-and-model-arbitration.md`
- `docs/roadmap/provider-independence-retrofit-plan.md`
- this provenance record
- GitHub Issue #104

## Safety state

This architecture slice performs no paid model call, no live database mutation, no provider-key creation, no production enablement, and no credential handling.

It does not claim deployed, operating, compliant, certification-ready, or certified provider independence from architecture documentation alone.

## Next implementation dependency

After architecture acceptance, the first implementation slice should freeze current fixture/OpenAI behavior, establish the deterministic network-free provider adapter conformance harness, and confirm existing governed-execution, budget, provenance, and AIMS integration points. The next dependent slice should then introduce provider/model descriptors, explicit model-family identity, acquisition mode, and the canonical provider registry while preserving current observable behavior.
