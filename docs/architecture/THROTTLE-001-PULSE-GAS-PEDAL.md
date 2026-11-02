# THROTTLE-001: Pulse, Throttle, and AI Gas Pedal

Status: Public-safe architectural contract
Issue: #522
Scope: Provider-agnostic adaptive compute governance

## Purpose

This document establishes the canonical relationship among Pulse, Throttle, and the AI Gas Pedal.

## Product doctrine

**AI cost optimization should happen before inference, not merely after the bill arrives.**

The system should continuously determine whether the current AI compute configuration fits the work being performed, then recommend escalation, de-escalation, or no change before avoidable consumption occurs.

## Canonical stack

```text
PULSE
Sense the work

   ↓

THROTTLE
Decide the right compute

   ↓

AI GAS PEDAL
Show the user what to do
```

### Pulse

Pulse is the sensing layer. It observes task and conversation state and reports material changes that may affect compute requirements.

Pulse may identify changes in areas such as:

- task phase
- user importance
- complexity
- consequence and risk
- uncertainty
- context sufficiency
- verification need
- reversibility
- novelty
- failure pressure
- latency sensitivity

Pulse does not independently choose a model or reasoning level.

### Throttle

Throttle is the compute governance layer. It receives state from Pulse, applies user policy and governance constraints, and determines an appropriate provider-agnostic compute class.

Throttle must distinguish among:

- compute that is appropriate for the task
- over-compute, where additional capability is unlikely to justify its cost
- under-compute, where the current configuration may create avoidable quality or risk exposure
- blocked escalation, where missing information, access, permissions, evidence, or verification is the true constraint

Provider-specific model and reasoning mappings are downstream configuration, not part of the provider-agnostic governance contract.

### AI Gas Pedal

The AI Gas Pedal is the customer-facing decision surface. Its job is not to expose every internal variable. Its job is to communicate current state, significance, and recommended action with the least visual complexity that preserves decision-relevant information.

Canonical minimal representation:

```text
               AI GAS PEDAL

      ECONOMY  STANDARD  DEEP  MAX
          ○────────●────────○────○
                   ▲
                CURRENT

          Recommended: STANDARD
          Compute Fit: 92%

Importance      ███████░░░
Complexity      █████░░░░░
Risk            ███░░░░░░░
Uncertainty     ████░░░░░░

                 ✓ GOOD FIT
```

## Compute Fit

Compute Fit is the primary user-facing indication of alignment between the current compute configuration and the configuration Throttle recommends for the present work.

The exact calculation, weighting, thresholds, calibration, learning methodology, and other potentially protectable mechanics are intentionally not specified in this public repository.

## Decision Compression Principle

Primary operator views should present the minimum information required for a human to understand:

1. system state
2. consequence or significance
3. recommended action

Additional rationale, evidence, history, policy, and calculation should remain progressively available one interaction deeper.

Decision compression does not mean hiding uncertainty or removing human authority. It means removing nonessential interface burden from the primary decision surface.

## User governance

The system must preserve the following boundaries:

- User importance is an explicit governance input and remains overrideable.
- User notification preferences are separate from detection logic.
- Recommendation confidence must be available to the decision process and visible when material.
- Elevated consequence combined with low recommendation confidence should favor a conservative configuration rather than aggressive cost optimization.
- Low confidence caused by missing context should result in a context or verification warning rather than automatic compute escalation.
- Outcome learning may propose future policy adjustments but must not silently rewrite governing user policy.

## Conversation and workflow transitions

The compute recommendation is stateful. It must be re-evaluated when the nature of the work changes.

Example phases may include:

```text
Brainstorm
   ↓
Requirements
   ↓
Architecture
   ↓
Implementation
   ↓
Debugging
   ↓
Verification
   ↓
Documentation
```

A single conversation can legitimately require different compute classes across these phases.

## Portability

Pulse and Throttle are intentionally provider-agnostic. Future mappings may support:

- CoMind
- enterprise AI gateways
- developer environments
- API routing
- autonomous agents
- multi-model orchestration
- corporate FinOps
- mobile AI applications
- multiple LLM providers

## IP boundary

This public document defines names, responsibilities, safety boundaries, and interface intent only.

Do not place proprietary scoring weights, inference heuristics, threshold calibration, learning mechanics, confidential user-policy inference logic, or other protectable implementation details in the public repository without explicit disclosure authorization.

## Authority

THROTTLE-001 Issue #522 and this architecture record establish Pulse, Throttle, AI Gas Pedal, Compute Fit, the pre-inference optimization doctrine, and the Decision Compression Principle as canonical CoMind concepts for future implementation work.
