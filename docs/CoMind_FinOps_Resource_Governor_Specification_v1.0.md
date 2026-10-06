# CoMind FinOps and Resource Governor

Version 1.0  
Date: 2026-09-10  
Owner: CoMind Development Office  
Ultimate authority: Joseph Hogarth

## 1. Purpose

The FinOps and Resource Governor makes CoMind's proactive agent workforce economically rational. It gives agents authority to handle routine development work while bounding cost, iteration count, duration, provider choice, environment access, and escalation.

The subsystem operationalizes this rule:

> Use the least expensive capability that reliably satisfies the required quality, security, and latency.

It also encodes the founding failure case from the first CoMind PTSD build: an agent must not confuse continued activity with continued value.

## 2. Architectural placement

The Resource Governor is part of the CoMind Agent Ecosystem Layer and works under the Governance Triad.

It integrates with:

- ThreadKeeper for runtime coherence and loop detection
- Future Continuity Node for reversibility and provider portability
- ARIS Technology Sprawl Control for platform rationalization
- ARIS Upgrade Assessment Engine for cost-benefit evaluation
- Integration Log Registry for external-service events
- Agent Registry for role-specific authority
- Cognitive Router for model and provider selection
- Governance Decisions for exceptions and consequential commitments

The Resource Governor does not replace Governance. It supplies economic evidence and enforces previously authorized limits.

## 3. Operating model

Every cost-bearing workflow receives an economic envelope before execution. The envelope defines:

- Objective and responsible agent
- Environment and capability level
- Estimated cost
- Soft and hard spending limits
- Maximum iterations
- Maximum duration
- Permitted providers
- Quality and confidence thresholds
- Stop conditions
- Escalation rules

Before an external operation begins, the agent must reserve its expected cost. The reservation is atomic. Parallel agents cannot independently spend the same remaining budget.

After execution, measured usage consumes the reservation, records the actual cost, updates the envelope, and produces an alert when a threshold is reached.

## 4. Authority model

| Level | Authority | Examples |
|---|---|---|
| C0 | Observe | Read logs, schemas, deployments, documents, and rate cards |
| C1 | Draft | Prepare code, SQL, documentation, estimates, and plans |
| C2 | Non-production execution | Create branches, tests, previews, and development migrations |
| C3 | Reversible production action | Deploy an approved release or perform an approved rollback |
| C4 | Consequential action | Delete data, rotate credentials, create recurring costs, change security, or publish externally |

Agents may proceed autonomously only through the level authorized by the applicable budget and governance policy. C4 always requires explicit human authorization.

## 5. Routing decision standard

For every material provider decision, the Cognitive Router records:

1. Task classification
2. Required capabilities
3. Data sensitivity
4. Candidate routes
5. Local execution suitability
6. Cache suitability
7. Batch or deferred-processing suitability
8. Estimated cost and latency
9. Expected quality
10. Selection rationale

The most capable model is not the default. Deterministic code, cached output, local inference, inexpensive hosted inference, and premium reasoning are considered in that order when they can satisfy the requirement.

## 6. Loop and diminishing-value controls

At each material iteration, an execution checkpoint records:

- Cumulative cost
- Progress toward the objective
- Marginal value of another iteration
- Current confidence
- Continue, reroute, pause, complete, escalate, or halt decision
- Rationale and next action

Execution stops when:

- The hard budget is reached
- Maximum iterations are reached
- Maximum duration is reached
- A stop condition becomes true
- Required progress is absent across successive checkpoints
- Marginal value falls below the configured threshold
- A policy or security boundary is encountered

Agents must attempt an economical reroute before requesting additional budget when a suitable alternative exists.

## 7. Rate-card governance

Provider prices are dynamic data, not prompt text. Each rate-card record contains:

- Provider, service, and meter
- Billing unit and unit quantity
- Unit price and currency
- Effective period
- Preferred processing windows
- Pricing conditions
- Authoritative source
- Source version
- Verification timestamp

Stale or unverifiable rate cards lower routing confidence and may block high-cost autonomous execution.

## 8. Causal cost lineage

CoMind must explain why a cost occurred, not merely identify the vendor.

The lineage is:

`objective -> project -> workflow -> agent -> routing decision -> provider -> reservation -> usage event -> artifact -> outcome`

This supports cost per feature, agent, provider, environment, completed objective, failed attempt, and unit of delivered value.

## 9. Development meeting reporting

The Development Director and Resource Governor jointly report:

- Budget versus actual spending
- Cost by project, workflow, agent, and provider
- Forecasted recurring commitments
- Failed-attempt and rework cost
- Savings from local execution, caching, batching, and deferred work
- Open budget exceptions
- Unusual usage or loop-risk alerts
- Higher-cost choices that produced measurable value
- Decisions requiring Joseph Hogarth's authorization

## 10. Security model

- Provider secrets are never stored in these tables.
- `credential_reference` stores only a vault reference or connection identifier.
- All subsystem tables have Row Level Security enabled.
- `PUBLIC`, `anon`, and `authenticated` receive no direct access.
- Backend execution uses a protected server-side role.
- Reservation and usage functions are security-invoker functions.
- Production credentials remain separate from development and preview environments.
- Governance authorization and credential custody remain separate responsibilities.

## 11. Implementation sequence

1. Apply the migration to an isolated development database or Supabase branch.
2. Run the verification script and database advisors.
3. Connect provider usage sources without importing secrets into database records.
4. Populate current, sourced rate cards.
5. Establish project and agent budget policies.
6. Integrate cost reservation into the Cognitive Router before provider calls.
7. Integrate usage recording after every billable operation.
8. Add checkpoint evaluation to agent loops.
9. Build Development Office cost and exception dashboards.
10. Conduct a controlled replay of the PTSD build scenario.
11. Review evidence through the Governance Triad.
12. Authorize production activation only after limits behave correctly under concurrency.

## 12. Acceptance criteria

The subsystem is ready for production consideration when:

- Parallel reservations cannot exceed an envelope's hard limit.
- An unauthorized or halted workflow cannot reserve additional cost.
- Usage is traceable to a workflow, agent, provider, and routing decision.
- Soft and hard limits produce alerts.
- Provider rate cards are time-versioned and source-attributed.
- Public and authenticated clients cannot access internal FinOps tables.
- Agent loops stop at iteration, duration, policy, or cost limits.
- Budget exceptions produce a governance decision trail.
- Meeting reports reconcile estimated, reserved, measured, and invoiced cost.
- The PTSD replay cannot reproduce the earlier unbounded spending behavior.

## 13. Decision status

Status: Accepted for development implementation  
Production status: Not authorized  
Required next gate: Migration verification in an isolated development environment


