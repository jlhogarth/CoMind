# THROTTLE-002: Measurement and Evaluation Contract

Status: Public-safe measurement contract
Issue: #524
Scope: Pulse, Throttle, Compute Fit, AI Gas Pedal
Production activation: Not authorized

## Purpose

THROTTLE-002 defines the evidence required to determine whether adaptive compute governance is materially improving cost efficiency without degrading quality, safety, latency, or user authority.

It complements the existing CoMind FinOps and Resource Governor. FinOps governs economic envelopes and cost lineage. Throttle governs whether the selected AI compute is appropriate to the work before and during inference.

## Canonical evidence objects

### Pulse State

Minimum public-safe fields:

- observation timestamp
- conversation/workflow identifier
- current phase classification
- user-importance band
- complexity band
- consequence/risk band
- uncertainty band
- context-sufficiency band
- verification-need band
- reversibility band
- novelty band
- failure-pressure band
- latency-sensitivity band
- state confidence
- source/provenance references

### Compute Recommendation

Minimum fields:

- recommendation identifier
- Pulse State reference
- provider-agnostic compute class
- recommendation confidence
- recommendation type: maintain, escalate, de-escalate, block, or request context/verification
- reason codes
- generated timestamp
- user-policy reference
- provider-mapping reference when provider-specific guidance is shown

### Compute Fit Assessment

Minimum fields:

- current configuration when observable
- recommended compute class
- fit band or score
- capability-fit component
- cost-fit component
- risk-fit component
- latency-fit component
- confidence
- assessment timestamp

Exact production calculations remain proprietary calibration material.

### Incongruity Event

Minimum fields:

- over-compute or under-compute classification
- severity
- current configuration
- recommended class
- reason codes
- confidence
- estimated avoidable consumption where supportable
- estimated quality/risk exposure where supportable

### Context/Verification Blocker

Minimum fields:

- blocker type
- missing information, file, permission, tool, evidence, or verification class
- whether more reasoning is expected to help
- recommended corrective action
- confidence

### User Compute Policy

Minimum fields:

- operating philosophy: Economy, Balanced, or Assurance
- user importance overrides
- risk tolerance
- cost sensitivity
- quality preference
- notification policy
- model/provider exclusions or preferences
- categories where automatic switching is prohibited
- effective timestamp and version

### Provider Mapping

Minimum fields:

- provider
- provider-agnostic compute class
- model/reasoning/speed mapping
- source/version
- effective period
- verification timestamp
- freshness status

### Phase Transition Event

Minimum fields:

- prior phase
- new phase
- transition timestamp
- transition confidence
- reason codes
- whether Throttle re-evaluation occurred
- re-evaluation latency

### Outcome Observation

Minimum fields:

- recommendation reference
- user accepted, rejected, or ignored
- actual compute used when observable
- regeneration/correction indicator
- task-success evidence when available
- test or verification result when applicable
- latency
- measured or estimated consumption
- user override reason when supplied

### Evaluation Case

A governed benchmark scenario containing:

- task context
- expected phase
- importance/risk assumptions
- context and verification availability
- expected recommendation class or allowable range
- expected block/escalation/de-escalation behavior
- quality-preservation criteria
- economic criteria

### Evaluation Run

Records:

- evaluated version
- benchmark set version
- provider mapping versions
- start/end timestamps
- per-case result
- aggregate metrics
- regressions
- exceptions
- evidence references

### Visual Companion Reference

Canonical concepts may reference a rights-cleared visual asset through:

- concept identifier
- asset or icon name
- source library
- source URL
- license
- attribution/notice requirements
- semantic meaning
- approved uses
- accessibility label guidance
- visual version

## Core measurement families

### 1. Sensing quality

Measure:

- phase classification accuracy
- material transition detection recall
- transition false-positive rate
- transition detection latency
- state-confidence calibration

### 2. Recommendation quality

Measure:

- agreement with governed benchmark cases
- justified escalation precision/recall
- justified de-escalation precision/recall
- false escalation rate
- false de-escalation rate
- context-insufficiency detection accuracy
- verification-gate accuracy
- recommendation-confidence calibration

### 3. Economic performance

Measure:

- avoidable premium-compute consumption prevented
- percentage reduction in compute consumption for equivalent successful work
- cost per successful task before and after Throttle
- savings attributed to de-escalation
- wasted retries prevented by blocker detection

Savings must not be counted as successful optimization when quality or required assurance materially degrades.

### 4. Quality preservation and improvement

Measure:

- task success rate
- test/verification pass rate where applicable
- regeneration rate
- correction rate
- user-reported quality
- quality delta after de-escalation
- quality delta after escalation

Primary safety condition:

`economic improvement is acceptable only when required quality and assurance remain inside policy bounds.`

### 5. Human governance

Measure:

- user override rate
- recommendation acceptance rate
- repeated dismissals by event class
- policy-change proposals accepted/rejected
- automatic-switch prohibition compliance
- explanation availability

A high override rate may indicate either poor recommendations or a misconfigured user policy and must not be interpreted as model failure without investigation.

### 6. Notification burden

Measure:

- alerts per active hour/session
- alerts dismissed without action
- repeated alerts for the same unchanged state
- user-muted categories
- time between material state change and useful warning
- warning fatigue proxy

The objective is not maximum notification. The objective is minimum interruption that preserves decision usefulness.

### 7. Provider mapping integrity

Measure:

- mapping freshness
- stale mapping rate
- provider capability changes detected
- recommendation failures attributable to outdated mappings
- mapping source/provenance completeness

## Baseline and comparison design

Throttle evaluation should compare materially equivalent task cohorts:

1. baseline behavior without Throttle guidance
2. Throttle advisory behavior
3. later, only if authorized, bounded automatic switching

Comparison must control for task class, importance/risk band, provider availability, and output-quality requirement where practicable.

## Minimum success evidence for an MVP

An MVP is not considered validated merely because recommendations render correctly.

Evidence should demonstrate:

- Pulse detects benchmark phase changes reliably enough to trigger re-evaluation.
- Throttle recommendations agree with governed benchmark expectations at an acceptable rate.
- Context and verification blockers prevent blind compute escalation.
- De-escalation reduces consumption on suitable tasks without material quality loss.
- Escalation improves quality or assurance on suitable difficult tasks often enough to justify the additional compute.
- Compute Fit directionally tracks recommendation appropriateness.
- User overrides and notification burden remain observable.
- Every recommendation has sufficient provenance to reconstruct why it occurred.

Exact numeric production thresholds require empirical calibration and are not defined in this public document.

## Known unvalidated areas

Until runtime instrumentation exists, the following cannot be honestly claimed as proven:

- actual percentage cost savings
- actual quality preservation across providers
- user-specific acceptance behavior
- alert-fatigue performance
- recommendation-confidence calibration
- provider-specific optimal mappings
- long-term outcome-learning effectiveness

These are measurement targets, not current capabilities.

## Acceptance

THROTTLE-002 is complete when this measurement contract is durable, public-safe, aligned with existing FinOps governance, and sufficient to drive schema, telemetry, benchmark, and UI implementation without inventing unsupported performance claims.
