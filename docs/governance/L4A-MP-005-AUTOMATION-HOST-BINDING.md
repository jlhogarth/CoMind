# L4A-MP-005 Automation-Hosted Persistent Scheduler Binding

**Status:** Candidate accepted external binding pending repository exact-head CI  
**Issue:** #462  
**Production change:** false  
**Paid-service commitment:** false  
**Authority expansion:** false

## Purpose

L4A-MP-005 binds the accepted L4A-MP-004 Decision-Complete / No-Idle Continuation contract to CoMind's existing persistent ChatGPT Automations. The purpose is practical continuity between ordinary conversational turns without falsely treating dormant development conversations as autonomous workers.

The automation host is a coarse continuity layer. It does not replace AED's Temporal durable-liveness architecture and it is not the timely AED clock.

## Bound persistent hosts

### CoMind Dev Supervisor

- Automation ID: `6ae4bba4fd008191b9d4788636fae06f`
- Existing schedule preserved unchanged: hourly at minute 05 in `America/Indiana/Indianapolis`
- Role: reconstruct active development state, select highest-priority dependency-valid work, execute authorized reversible work, merge qualifying non-Production PRs, and continue to successor work.

### CoMind Recovery Sweep

- Automation ID: `6ae4bbab111481918abc6b156564ef70`
- Existing schedule preserved unchanged: hourly at minute 35 in `America/Indiana/Indianapolis`
- Role: identify stalled, failed, interrupted, abandoned, diverged, or semantically non-progressing lanes and perform the smallest safe recovery without colliding with active ownership.

No cadence change was made in this milestone.

## No-idle binding

Both automation prompts now explicitly require the current canonical Development Environment Contract v1.2 and durable L4A authority to be refreshed when available.

Each run applies the following continuation invariant:

- identifying or recommending the next action is not completion when the action is already authorized, dependency-valid, reversible, non-Production, and executable through an available governed tool or actuator;
- the run executes that action instead of waiting for Joseph to repeat `Proceed`;
- a selected lane entering a bounded external wait does not automatically end the run when another independent dependency-valid lane can safely progress;
- a valid canonical claim/lease prevents duplicate dispatch or recovery;
- a run may terminate only at truthful `COMPLETE`, bounded `WAIT`, explicit `BLOCK`, mandatory `ESCALATE`, explicit `UNAVAILABLE`, or an actual platform/runtime execution limit;
- unsupported execution surfaces are reported as unavailable rather than fabricated;
- a dormant ChatGPT conversation is never claimed to have been awakened unless an actual supported actuator did so.

The existing heartbeat evidence requirements remain intact for both controllers.

## Independent readback verification

After updating the prompts, the Automations service was read back independently for each existing automation ID.

Verified for the Dev Supervisor:

- ID unchanged: `6ae4bba4fd008191b9d4788636fae06f`;
- title unchanged: `CoMind Dev Supervisor`;
- enabled state remained true;
- schedule remained `FREQ=HOURLY` at minute 05 in the existing timezone;
- saved prompt contains Contract v1.2, Decision-Complete / No-Idle Continuation, CLEAR, claim/lease collision protection, truthful `UNAVAILABLE`, automatic successor activation, and durable heartbeat requirements.

Verified for the Recovery Sweep:

- ID unchanged: `6ae4bbab111481918abc6b156564ef70`;
- title unchanged: `CoMind Recovery Sweep`;
- enabled state remained true;
- schedule remained `FREQ=HOURLY` at minute 35 in the existing timezone;
- saved prompt contains Contract v1.2, Decision-Complete / No-Idle Continuation, CLEAR, claim/lease collision protection, safe recovery continuation, truthful `UNAVAILABLE`, and durable heartbeat requirements.

## Platform limitation

ChatGPT Automations cannot run more than once per hour. Therefore this binding provides eventual coarse continuity, not minute-scale AED liveness. It must not be represented as the final persistent scheduler host.

The accepted AED architecture remains responsible for the timely control-loop design. A future self-hosted or otherwise persistent worker can reuse the L4A-MP-004 scheduler contract to provide event-driven or durable-timer execution without changing CoMind's authority model.

## Security and governance

This milestone changes controller prompts only. It does not:

- create or rotate credentials;
- expose tokens, cookies, MFA material, or raw authorization data;
- create a paid service commitment;
- activate or modify Production;
- expand L4A authority;
- alter the automation schedules;
- create a second scheduler authority, lease system, evidence ledger, or policy engine.

## Successor boundary

The next architectural gap is a genuinely timely persistent actuator host. Any successor must reuse the L4A-MP-004 scheduler and existing AED/Foundry/CLEAR contracts. New infrastructure spend, new credentials, paid provider execution, broader mutation authority, or Production activation remain separately governed human boundaries.
