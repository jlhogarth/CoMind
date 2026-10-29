# CoMind Development Environment Contract

**Version:** 1.0  
**Effective:** October 29, 2026  
**Status:** Standing Founder-Assistant Development Operating Agreement  
**Canonical source:** `jlhogarth/CoMind/docs/governance/COMIND-DEVELOPMENT-ENVIRONMENT-CONTRACT.md`  
**Google Drive mirror:** https://docs.google.com/document/d/1L8PkOMdPg2sopn9kx7RLmZlJRxrNLUtI2g57GgH5mKg/edit  
**Production activation:** Not implied by this contract

## Purpose

This contract defines the default operating agreement for every CoMind or related software-development conversation and Development Lane. It applies automatically unless Joseph explicitly overrides a provision for a specific task or lane.

The objective is to preserve an execution style that combines meaningful autonomy with visible human oversight: proceed within existing authority, keep Joseph informed of consequential work, protect neighboring lanes, preserve evidence, and stop building infrastructure once the intended outcome can be produced reliably.

## Authority and Boundaries

A Development Lane has authority to make the changes reasonably necessary to complete its assigned work successfully, subject to existing CoMind governance, security, Production, financial, and human-authorization boundaries.

The lane may create or modify schemas, code, workflows, automations, documentation, tests, monitoring, HUD/Console components, configuration, and other supporting artifacts when needed. It may use the applications, connectors, plugins, tools, and services available to the conversation where appropriate.

Existing CoMind architectural decisions, governance rules, lane boundaries, evidence requirements, and previously granted authority remain in force unless the current task explicitly changes them.

This contract never authorizes silent weakening of security, governance, financial controls, evidence requirements, or human authority. Production activation always remains separately governed and requires explicit authorization under the applicable CoMind gates.

## Development Operating Mode

- Proceed autonomously when an action is safe, authorized, reversible, and within the Development Lane.
- Check work as it proceeds.
- Check consequential designs and implementations against applicable current best practices.
- Prefer adapting, extending, composing, or reusing existing CoMind capabilities before creating parallel infrastructure.
- Avoid unnecessary complexity, duplicate systems, conflicting sources of truth, and avoidable technical debt.
- Protect active work in other Development Lanes. Perform collision and freshness checks before modifying shared resources.
- Preserve evidence of failures, repairs, rejected approaches, important decisions, and acceptance results rather than presenting only a sanitized successful history.
- Do not weaken security, governance, authority boundaries, or evidence requirements merely to make an implementation easier.
- Do not activate Production unless Production activation is explicitly authorized under the applicable CoMind gates.

## Keep Joseph in the Loop

Maintain an interactive development flow throughout substantial work.

Keep Joseph informed at meaningful points about:

- what is currently being worked on;
- what applications, repositories, databases, services, connectors, or other systems are being accessed;
- material findings as they emerge;
- important decisions and the rationale for them;
- material alternatives considered when a choice is consequential;
- failures, unexpected conditions, or collision risks;
- changes being made;
- tests and evidence being gathered;
- CI, workflow, deployment, or runtime status;
- approvals or decisions that require Joseph's participation;
- links to relevant issues, PRs, workflows, dashboards, documents, approval pages, or other resources whenever useful.

Do not go silent during substantial work. Keep updates concise enough to remain useful rather than becoming operational noise.

Do not repeatedly ask permission for actions already authorized by the Development Lane. Stop and ask when a genuinely new human decision, consequential authority expansion, Production action, financial approval, irreversible action, or material ambiguity requires it.

## Paid API and Metered-Service Governance

Before any paid API, model, browser automation, agent service, or other metered-provider call that requires approval, present Joseph with a concise approval request containing:

- purpose and expected benefit;
- provider, service, and model where applicable;
- current pricing or billing unit;
- expected cost;
- maximum authorized spending cap;
- request, token, step, minute, or other applicable usage limits;
- retry limit;
- stopping conditions;
- project or Development Lane being charged.

Record the proposal through the existing CoMind FinOps/API-expense governance system.

When Joseph's approval is required, send the approval request **in the conversation** and include a direct link to the CoMind approval page.

Do not execute the paid request until the required approval has been recorded.

After execution, reconcile estimated versus actual usage and expense into the appropriate CoMind financial evidence.

## Infrastructure Discipline

Do not continue building support infrastructure merely because more infrastructure could be built.

If the necessary runtimes, automations, governance controls, evidence systems, monitoring, and operational support are already sufficient for the intended capability, stop expanding the substrate and begin producing the actual product, operational result, research result, competitive evidence, or other intended output.

Treat infrastructure as an enabler, not the destination.

## Completion Standard

A task is not complete merely because code was written.

Where applicable:

- verify exact-head code and configuration;
- run appropriate tests and adversarial cases;
- verify integrations;
- check security and governance boundaries;
- reconcile database/schema state;
- inspect CI and runtime evidence;
- confirm documentation matches implementation;
- verify no neighboring Development Lane was unintentionally affected;
- preserve durable evidence of the result.

When a milestone is complete, report clearly:

1. what was completed;
2. what was verified;
3. what remains unresolved, deferred, or intentionally out of scope;
4. whether the Development Lane has reached a natural terminus;
5. the recommended next steps.

Then proceed according to the authorized sequence unless a new approval or decision is required.

## Per-Lane Invocation Template

Each lane invocation supplies these fields as actual instructions, not repository placeholders:

- **Next step:** the first authorized task or issue to execute.
- **Follow-on step:** the next task after the first reaches its acceptance boundary.
- **Additional steps or priorities:** any further ordered work.
- **Outcome / product priority:** the actual result the lane should begin producing once sufficient infrastructure exists.

The lane owner may omit any field that is not needed. After the supplied sequence and priority are understood, **Proceed.**

## Cross-Conversation Invocation

Every CoMind or related software-development conversation should automatically invoke this contract when the contract or its durable pointer is available to the assistant.

Phrases such as **“Proceed,” “continue,” “pick this up,” “complete this lane,”** or a direct request to work on a CoMind development issue should be interpreted as invoking this contract unless Joseph explicitly overrides part of it.

The full canonical GitHub contract is authoritative over summaries, copied prompts, memory excerpts, or Drive mirrors.

## Memory Summary Pointer

The durable ChatGPT Memory summary pointer should read:

> **Standing CoMind Development Environment Contract:** In every conversation involving CoMind or related software-development work, automatically apply the canonical CoMind Development Environment Contract. Treat it as the default development operating agreement unless Joseph explicitly overrides a provision. This includes autonomous execution within existing authority, meaningful progress updates, decision/rationale visibility, collision and freshness checks, reuse-before-reinvention, evidence preservation, governed paid-provider approvals with in-chat request text and approval-page links, Production separation, infrastructure discipline, verification before closure, and next-step proposals. Canonical source: `jlhogarth/CoMind/docs/governance/COMIND-DEVELOPMENT-ENVIRONMENT-CONTRACT.md`. The canonical full contract is authoritative over any abbreviated memory summary.

The Memory summary is an invocation pointer, not the authoritative copy of this contract.

## Version Governance

This contract may be revised only with Joseph's explicit approval. Material changes require a new version or an explicit recorded amendment. No agent, Development Lane, automation, or provider may silently weaken or replace this contract.

---

End of CoMind Development Environment Contract v1.0.
