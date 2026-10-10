# CoMind AIMS Objectives and Metrics

Date: 2026-10-10
Status: Draft measurement model. Targets require management approval and observed baselines before they become acceptance thresholds.

## Measurement principles

- Prefer directly observed evidence over self-reported status.
- Separate leading indicators from outcome measures.
- Record numerator, denominator, source, observation period and missing-data conditions.
- Never invent a target because a standard or dashboard seems to need one.
- Establish baseline first where no defensible target exists.
- A green metric does not override an unresolved high/critical risk.

## Initial objectives

| Objective | Indicator | Evidence source | Initial target state |
| --- | --- | --- | --- |
| Consequential execution is authorized | Percentage of T2/T3 or otherwise consequential executions with valid identity, capability, scope and authorization evidence | Foundry execution/authorization provenance | Target value to be set after runtime path is deployed; design intent is complete coverage |
| Revoked/expired authority is not usable | Unauthorized dispatches succeeding after revocation/expiry | Isolated/runtime security tests and incident evidence | Zero accepted failures once capability is operating |
| Material AI systems are inventoried | In-scope material systems with complete owner/purpose/model/tool/data/risk references | AIMS inventory | Establish baseline, then complete in-scope inventory before certification-readiness claim |
| Material suppliers are governed | Critical suppliers with current assessment, owner, risk and contingency record | Supplier inventory | Establish baseline; no unsupported completeness claim |
| AI risks have accountable owners | Open high/critical risks with named human owner and current treatment/acceptance state | Risk register | All high/critical risks require owner once register is operating |
| Evidence claims are honest | Unsupported claims detected in audit/review | Audit findings, evidence scans | Zero knowingly unsupported certification/deployment/test claims |
| Control evidence remains current | Material controls whose evidence is stale or unavailable | Evidence index | Baseline first; define freshness by control family |
| Incidents lead to verified correction | Material incidents/nonconformities with corrective action and effectiveness review | Incident/corrective-action records | All material cases require closure evidence or documented open status |
| Virtual Employee work does not disappear silently | Delegated work without durable owner/status/terminal handling | Work-lease/continuity evidence when available | Zero unexplained silent-loss events after relevant controls are operating |
| Governance does not silently degrade responsiveness | Interactive latency and checkpoint/runtime overhead relative to performance baseline | Runtime-performance measurements | Thresholds must be set from PR #88 baseline after acceptance |
| Provider costs remain bounded | Unexpected or unauthorized AI-provider spend | FinOps/budget evidence | No spend outside approved budget authority; numerical tolerances separately defined |
| Recovery is reliable | Eligible recovery tests completing with verified authority/state and preserved provenance | ACP/Foundry recovery tests | Set from accepted continuity baseline; failed recovery remains visible |
| Agentic security is tested | Applicable OWASP Agentic/MITRE scenarios with test or explicit rationale | Security test register | Coverage target after threat model is finalized |
| Human approvals are usable | Approval latency, expiry, overrides, rejected actions and repeated fatigue patterns | Authorization/approval evidence | Baseline first; optimize without weakening authority |
| AIMS improves over time | Repeated audit findings, overdue corrective actions, objective trend | Audit/review records | Material recurrence requires root-cause escalation |

## Required metadata for each metric

Each operating metric must identify:

- metric ID and owner;
- definition and business/control purpose;
- source system and query/calculation method;
- observation frequency;
- expected data latency;
- scope and exclusions;
- threshold/target and approval record;
- warning/critical boundary where applicable;
- escalation route;
- evidence retention;
- known blind spots/quality limitations;
- last-definition revision.

## Anti-gaming rules

- Do not reduce scope solely to improve a percentage.
- Do not delete failed runs from denominator unless exclusion criteria were defined before observation.
- Do not count proposed/documented controls as operating controls.
- Do not treat missing telemetry as success.
- Do not average away a critical tail event where maximum impact matters.
- For latency, record distributions/percentiles and workload context rather than relying only on means.
- For costs, reconcile provider usage and internal accounting where practical rather than using estimates alone.

## Dashboard relationship

These metrics are future data sources for the Virtual Employee Management Dashboard and AIMS governance views. The dashboard must display freshness and evidence state so a visually green tile cannot imply current compliance from stale or design-only data.