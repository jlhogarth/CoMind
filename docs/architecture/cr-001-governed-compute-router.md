# CR-001 Governed Compute Substrate Router

Status: Development implementation
Production activation: false
Issue: #516

## Purpose

CR-001 operationalizes the existing FinOps Resource Governor rule: use the least expensive capability that reliably satisfies required quality, security, authority, and latency.

The router does not replace the Cognitive Router, provider registry, rate cards, budget authority, or governance. It adds a deterministic substrate-selection layer before model/provider selection.

## Initial routes

- `LOCAL`: deterministic code, cache, local model, or owned compute.
- `API_BATCH`: asynchronous bulk provider execution where the completion window is acceptable.
- `API_REALTIME`: synchronous provider execution when hosted reasoning is required but browser interaction is not.
- `CHAT_WORK`: ChatGPT Work when browser/computer interaction, authenticated UI operation, or active human participation is materially required.

## Governing principle

A more capable route is not automatically a better route. A route is eligible only when it satisfies capability, quality, latency, data sensitivity, authority, and economic-evidence requirements.

Among eligible routes, the router chooses the lowest normalized estimated cost. Equal-cost ties prefer `LOCAL`, then `API_BATCH`, then `API_REALTIME`, then `CHAT_WORK`.

## Failure avoidance

CR-001 is deliberately a pure deterministic function. It performs no provider calls, browser operations, database writes, or paid execution.

Metered routes require:

1. a normalized USD estimate supplied by the existing FinOps layer;
2. fresh cost evidence;
3. sufficient capability and quality;
4. permitted data sensitivity;
5. compatible latency.

If none qualify, routing fails closed with `NO_GOVERNED_ROUTE_AVAILABLE`.

Critical work or any request explicitly marked as requiring human approval fails closed with `HUMAN_APPROVAL_REQUIRED` until approval is present.

## Batch policy

`API_BATCH` is eligible only when the task is bulk-suitable, deferred execution is allowed, and the maximum latency budget is at least 86,400 seconds. The router does not hard-code provider token prices or discount percentages. Rate-card logic remains external and time-versioned.

## ChatGPT Work policy

`CHAT_WORK` is eligible in CR-001 only when one or more of these are required:

- browser operation;
- authenticated UI operation;
- active human interaction.

This prevents Work credits from becoming a general-purpose compute substitute for API or local execution.

## Inputs

Routing consumes:

- task classification;
- browser/authenticated UI/human-interaction requirements;
- deferred-processing permission;
- latency budget;
- bulk suitability;
- required quality score;
- risk tier;
- data sensitivity;
- user importance;
- approval state;
- per-route availability, sufficiency, quality, sensitivity ceiling, normalized cost, and cost evidence freshness.

No credential, token, cookie, MFA value, browser storage, or provider secret belongs in the routing request.

## Outputs

The router returns:

- `ROUTED` or `BLOCKED`;
- selected route, if any;
- explicit rationale;
- rejected routes and rejection reasons;
- decision confidence;
- escalation reason when blocked.

This output is intended to become durable FinOps routing evidence in a later database-bound slice.

## Next dependency-valid slices

1. Bind router inputs to existing provider/rate-card and budget-authority read models.
2. Add usage telemetry so estimated and actual route cost can be reconciled.
3. Add Operator Console projection for route, savings, and blocked decisions.
4. Add API Batch job submission adapter behind the existing provider-neutral execution contract.
5. Add local execution descriptors for owned server/GPU capacity.
6. Add Work-credit telemetry only when an authoritative usage source is available.

No paid provider execution or Production activation is authorized by CR-001.
