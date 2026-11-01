# CFR-002B Durable Stream Gateway

Issue: #439
Parent: #387
Production change: false

## Freshness and collision checkpoint

CFR-002A is complete through Issue #421 and merged PR #425. Current canonical main at activation is 13b95e58c0c3ea75000db34b9c827ebae47733ed. No open pull request was found for CFR-002B before this branch was created.

The existing implementation already provides two boundaries that CFR-002B must preserve rather than replace:

1. server/src/routes/assistant.ts durably claims the latest user turn and records user_message_observed plus assistant_generation_started before provider generation begins.
2. The CFR-002A AssistantResponseObserver.onProviderEvent path awaits persistOpenAIProviderAcquisitionEvent for each observed supported provider event before provider iteration proceeds.

CFR-002B therefore extends these accepted durability boundaries into an explicit gateway contract. It must not create a second transcript, conversation, provider-event ledger, or authority path.

## Implementation contract

The next code slice on this branch will make downstream delivery an explicit consumer of already accepted durable events. Delivery failure or client disconnect must not roll back or erase an accepted input, acquisition observation, canonical CFR capture event, or assistant-generation terminal state.

Required ordering:

durable user input -> generation claim -> provider event received -> acquisition persistence -> downstream delivery eligibility

The gateway must preserve CFR-002A provider sequence identity and CFR-001 canonical text semantics. Duplicate, out-of-order, interrupted, failed, and unknown provider events remain durable evidence. No hidden chain-of-thought claim is permitted.

## Acceptance

Acceptance remains synthetic/Test-only and requires deterministic proof of commit-before-inference, persist-before-delivery, client-disconnect survival, duplicate/out-of-order handling, and restart-safe durable boundaries. No credential, private browser session, paid model call, Production activation, or destructive pruning is authorized.
