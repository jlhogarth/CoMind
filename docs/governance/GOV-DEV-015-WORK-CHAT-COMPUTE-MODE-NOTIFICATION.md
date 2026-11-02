# GOV-DEV-015: Work Chat Compute Mode Notification Contract

**Status:** Standing CoMind Application Development Contract amendment  
**Effective:** November 2, 2026  
**Authority:** Joseph Hogarth, Founder  
**Applies to:** All current and future CoMind Development Lanes using ChatGPT Work or an equivalent metered Work/Codex execution surface  
**Parent contract:** `docs/governance/COMIND-DEVELOPMENT-ENVIRONMENT-CONTRACT.md`  
**Production activation:** Not authorized or implied

## Incorporation

Joseph explicitly authorizes this document as a standing amendment to the CoMind Application Development Contract. It is incorporated by reference into the canonical Development Environment Contract and remains binding until superseded, narrowed, or revoked by Joseph.

This amendment governs compute-selection communication and FinOps behavior. It does not expand Production authority, security authority, credential authority, publication authority, legal authority, or any other existing human stop boundary.

## Purpose

CoMind development must not require Joseph to memorize model pricing, reasoning tiers, speed multipliers, or task-to-model mapping. The acting Development Lane is responsible for recognizing when the current Work configuration is materially more expensive, slower, less capable, or otherwise less appropriate than the task requires and for surfacing the change clearly before meaningful cost-bearing execution.

The governing principle is:

> **Use the least expensive compute configuration that reliably satisfies the task's verification and quality requirements.**

The current approved baseline for ordinary CoMind Work execution is:

> **Sol-class model / Standard speed / Medium reasoning**

This baseline is a governance default, not a permanent product-name dependency. If OpenAI renames, replaces, reprices, or materially changes available models or reasoning/speed tiers, the lane must map this rule to the nearest current capability-equivalent configuration using current verified provider information.

## Mandatory Work Mode Change Notification

Whenever the acting Development Lane determines that a CoMind task would materially benefit from changing the current Work model, reasoning level, or speed, it must interrupt before material cost-bearing execution and present a highly visible mode-change notice.

No material Work mode escalation or de-escalation may be recommended silently.

### Advisory change

Use this exact heading when the current configuration is acceptable but another configuration is materially preferable:

> **⚠️ WORK MODE CHANGE RECOMMENDED**

The notice must contain, in this order:

- **CURRENT SETTING:** the visible or reliably known model, reasoning level, and speed. If not verifiable, state `Not verifiable from this lane`.
- **SWITCH TO:** the exact recommended model, reasoning level, and speed.
- **WHY:** the task-specific technical reason for the change.
- **COST / USAGE EFFECT:** the expected direction of credit or allowance impact, stated quantitatively when reliable current pricing or usage information is available and qualitatively otherwise.
- **WHEN TO SWITCH BACK:** the objective completion condition for returning to the normal baseline or another lower-cost configuration.

An advisory notice does not create a new approval ritual. If the current configuration remains safe, authorized, and economically reasonable, the lane may continue under existing L4A authority unless the user-interface setting must be changed manually to obtain the intended benefit.

### Required change

Use this exact heading when continuing with the current setting would materially waste credits, create avoidable technical or verification risk, or make successful completion materially less likely:

> **🛑 WORK MODE CHANGE REQUIRED**

The same five fields are mandatory:

- **CURRENT SETTING**
- **SWITCH TO**
- **WHY**
- **COST / USAGE EFFECT**
- **WHEN TO SWITCH BACK**

When the Work interface requires Joseph to change the setting manually, a required change is a valid platform-enforced human interaction boundary. The lane must pause material cost-bearing execution only for the smallest necessary setting change, while continuing any unrelated safe work that does not depend on that change.

## Escalation Rules

Premium compute is an exception, not the default.

Escalation to an Astra-class model, High or Extra High reasoning, Fast speed, Ultrafast speed, or any future materially higher-cost equivalent requires an explicit technical justification tied to at least one of the following:

1. the task contains genuinely difficult or novel reasoning beyond the demonstrated capability of the approved lower-cost baseline;
2. a lower-cost configuration has failed a defined verification or acceptance gate;
3. latency itself is materially blocking an authorized dependency and the faster mode is likely to reduce end-to-end completion time rather than only token-generation time;
4. the task carries sufficient architectural, security, data-integrity, governance, or financial risk that additional reasoning capability is justified;
5. a current provider capability is uniquely available only in the premium configuration and that capability is necessary for the authorized objective.

Convenience, impatience, novelty, or the mere availability of a premium mode are not sufficient reasons for escalation.

## De-escalation Rules

The lane must also actively recommend de-escalation when premium compute is no longer justified.

After the difficult, high-risk, or latency-sensitive portion of a task is complete, the lane must issue:

> **⚠️ WORK MODE CHANGE RECOMMENDED**

and direct Joseph back to the least expensive configuration that can reliably complete the remaining work, normally the approved baseline or an appropriate lower-cost routine-work model.

A premium setting must not remain active through routine documentation, repetitive edits, status reporting, extraction, classification, ordinary testing, or other lower-complexity work merely because it was required earlier in the conversation.

## Routine Lower-Cost Routing

When available and reliable, Terra-class or Luna-class models may be recommended for focused, repetitive, extraction, classification, short-edit, formatting, or other low-risk routine work that does not require the full baseline capability.

The same visible notification rule applies whenever Joseph must manually change the Work setting.

## Unknown Current Setting

The acting Development Lane must not invent or assume the visible Work configuration.

If the current model, reasoning level, or speed cannot be verified, the notice must state:

> **CURRENT SETTING: Not verifiable from this lane**

The lane must then specify the recommended configuration and why it is appropriate. Lack of visibility into the interface does not excuse silence when a mode change is materially recommended.

## Relationship to L4A and No-Idle Continuation

This amendment does not weaken L4A Bounded Autonomous Development Authority or the Decision-Complete and No-Idle Continuation rule.

The lane continues autonomously whenever the required compute configuration is already in effect or when the current configuration remains acceptable. It may pause only when a manual Work-interface change is genuinely required before material execution.

A mode-change notice is operational guidance, not a general request for permission.

## FinOps Evidence

Where practical, CoMind should preserve durable evidence of meaningful compute-selection decisions, especially premium escalations, including:

- task or Development Lane;
- prior configuration;
- selected configuration;
- justification;
- failed cheaper attempt, if any;
- usage or credit impact when available;
- verification outcome;
- de-escalation point.

This evidence should progressively support empirical task-to-compute routing so future CoMind model selection is based on observed success, cost, latency, and verification outcomes rather than intuition alone.

## Acceptance Standard

GOV-DEV-015 is satisfied when:

1. Work mode changes are surfaced with the required visible headings;
2. every notice includes CURRENT SETTING, SWITCH TO, WHY, COST / USAGE EFFECT, and WHEN TO SWITCH BACK;
3. premium escalation is technically justified;
4. unnecessary premium settings are actively de-escalated;
5. unknown interface state is disclosed rather than guessed;
6. the rule applies automatically across CoMind Development Lanes unless Joseph explicitly overrides it;
7. no existing Production or human-authority boundary is weakened.

## Example Required Notice

> **🛑 WORK MODE CHANGE REQUIRED**  
> **CURRENT SETTING:** Astra-class / Fast / High  
> **SWITCH TO:** Sol-class / Standard / Medium  
> **WHY:** The remaining work is routine repository implementation and verification. Premium reasoning and accelerated generation are not technically justified.  
> **COST / USAGE EFFECT:** Expected to materially reduce Work allowance or credit consumption.  
> **WHEN TO SWITCH BACK:** Do not switch back unless a defined verification failure or genuinely difficult reasoning problem triggers the escalation rules above.
