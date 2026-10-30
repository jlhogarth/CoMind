# CoMind Development Environment Contract

**Version:** 1.1  
**Effective:** October 30, 2026  
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

## L4A Bounded Autonomous Development Authority

Joseph's standing L4A Bounded Autonomous Development Authority is part of this contract when a durable granted authorization is present in the canonical CoMind evidence system. L4A permits autonomous non-Production development, recovery, issue/branch/PR progression, qualifying merge, evidence capture, and dependency-valid continuation without routine human approval.

Before relying on L4A for consequential work, a lane must resolve current durable authority rather than infer authority from conversational tone or an old copied prompt. Connection availability does not itself grant authority.

L4A never bypasses its mandatory human stop boundaries. Production activation or consequential Production modification, irreversible destructive Production operations, canonical-evidence deletion or corruption, material weakening of security or governance, unauthorized credential changes, new paid commitments, material departure from approved architecture, consequential legal or corporate commitments, separately governed external publication, and platform-enforced human confirmation remain human gates.

## Governed Integration Gateway

CoMind may use managed integration gateways to provide durable, reusable access to external developer tools and services. Composio is the current CIG-001 integration provider for the verified GitHub and Supabase development paths. This designation makes Composio an execution and authentication substrate, not a source of CoMind authority.

For every consequential external action performed through an integration gateway, the lane must:

1. resolve the current canonical version of this contract and current durable authority when those sources are available;
2. confirm that the required provider connection is active and scoped to the intended account, project, repository, or resource;
3. apply applicable RuleBook trust-boundary, egress, tenancy/project, secret-handling, logging, and human-review controls;
4. execute the least-privilege action needed for the authorized objective;
5. independently verify the resulting provider state when practical;
6. preserve non-secret provenance, result, failure, and recovery evidence in the canonical evidence system.

OAuth access tokens, refresh tokens, passwords, authorization headers, API keys, client secrets, service-role keys, and equivalent credential material must remain in the provider, connector, approved secrets manager, or authenticated platform session. Raw credential material must not be copied into prompts, RunBook events, RuleBook evidence, Console projections, source-control documentation, or ordinary agent logs.

An integration interruption is an operational state, not automatically a lane failure. Use states such as `AUTH_REQUIRED`, `SCOPE_REQUIRED`, `EXPIRED`, `HUMAN_CONFIRMATION_REQUIRED`, or `BLOCKED` to checkpoint the affected operation. Continue unrelated safe work when dependencies permit. Never bypass a platform authentication, confirmation, scope, or safety boundary.

Prefer an existing native connector when it provides a safer, narrower, or more reliable path. Prefer the governed integration gateway when coordinated multi-application execution, managed credential lifecycle, or cross-session continuity materially improves the authorized workflow. Do not maintain duplicate integration implementations without a documented reason.

For a ChatGPT-hosted plugin path, these controls are enforced procedurally by the acting lane because the external plugin call is outside CoMind runtime interception. A CoMind-hosted agent, Virtual Employee, or application runtime that uses the Composio SDK or another integration broker must invoke the common RuleBook preflight before consequential external execution.

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

Every CoMind or related software-development conversation should automatically invoke this contract when the contract or its durable pointer is available to the assistant. At lane start, lane recovery, and before consequential external execution, the acting lane should refresh the canonical contract version and durable authority when tool access permits. Cached chat context, copied prompts, and memory summaries are pointers and must not override a newer canonical contract or durable authorization record.

Phrases such as **“Proceed,” “continue,” “pick this up,” “complete this lane,”** or a direct request to work on a CoMind development issue should be interpreted as invoking this contract unless Joseph explicitly overrides part of it.

The full canonical GitHub contract is authoritative over summaries, copied prompts, memory excerpts, or Drive mirrors.

## Memory Summary Pointer

The durable ChatGPT Memory summary pointer should read:

> **Standing CoMind Development Environment Contract:** In every conversation involving CoMind or related software-development work, automatically apply the canonical CoMind Development Environment Contract. Treat it as the default development operating agreement unless Joseph explicitly overrides a provision. This includes L4A bounded autonomy when durably granted, canonical-contract freshness checks, governed integration-gateway use, managed credential custody, meaningful progress updates, decision/rationale visibility, collision and freshness checks, reuse-before-reinvention, evidence preservation, governed paid-provider approvals with in-chat request text and approval-page links, Production separation, infrastructure discipline, verification before closure, and next-step proposals. Canonical source: `jlhogarth/CoMind/docs/governance/COMIND-DEVELOPMENT-ENVIRONMENT-CONTRACT.md`. The canonical full contract is authoritative over any abbreviated memory summary.

The Memory summary is an invocation pointer, not the authoritative copy of this contract.

## Version Governance

This contract may be revised only with Joseph's explicit approval. Material changes require a new version or an explicit recorded amendment. No agent, Development Lane, automation, or provider may silently weaken or replace this contract.

---

End of CoMind Development Environment Contract v1.1.
