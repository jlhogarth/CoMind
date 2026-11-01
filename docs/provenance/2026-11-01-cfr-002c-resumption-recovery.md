# CFR-002C Resumption and Recovery

Issue: #471
Parent: #387
Predecessor: CFR-002B / #439 / PR #470
Production change: false

## Activation

CFR-002B is closed and merged on current main `4eb1ed7efc1ccc2e6536f5cb3ade9faec8647b40`. CFR-002C extends the accepted durable stream gateway rather than creating a second transcript, recovery ledger, authority path, or evidence store.

## Contract

Recovery is sequence-based and reads already durable CoMind event receipts. Reconnect never requires re-running inference merely to replay accepted events. Already acknowledged events are filtered, out-of-order durable reads are deterministically ordered, duplicate replay is suppressed, foreign generation events are excluded, and a durable sequence gap fails closed rather than fabricating a missing event.

The recovery layer remains downstream of CFR-002B persist-before-delivery semantics. Client disconnect, server restart, or replay cannot roll back durable acquisition evidence.

## Acceptance slice

This checkpoint is synthetic/Test-only. Deterministic tests cover acknowledgement-based replay, restart idempotence, duplicate suppression, out-of-order read normalization, generation isolation, and fail-closed sequence gaps. No Production activation, credential/session-cookie provisioning, private browser capture, paid model call, destructive pruning, or authority change is included.
