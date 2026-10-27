# PFC-A01 recovery acceptance

Lifecycle: implementation and synthetic verification. Owner: PFC-A01, issue #241, PR #246. Parent PFC-001 remains open. No real history baseline is claimed.

## In this document
- [Behavior](#behavior)
- [Verification](#verification)
- [Authority and recovery](#authority-and-recovery)

## Behavior
Interrupted attempts retain all committed observations and receive an ABANDONED terminal receipt. Explicit recovery creates one clean successor with immutable source/parser/schema lineage. Repeated recovery resolves to the same successor; successful ingestion is reused on replay. A shared source advisory lock serializes ingestion and recovery. Recovery lock acquisition times out after five seconds. Empty attempts remain directly retryable; attempts containing events or quarantine require recovery even without valid conversations.

## Verification
The archive CI runner now executes the exact lineage verifier and reapplies the migration to prove idempotency. CHIST CI executes the ABANDONED certification-rejection script. Those verifiers existed before this acceptance work but were not invoked by CI. Archive run 40465520014 passed after wiring. Run 40465709337 passed after the certification fixture correction. Final immutable-head results are recorded on PR #246 and the Development Journal before acceptance.

The newly executed verifier exposed an invalid PUBLIC role lookup; PUBLIC privileges are now checked through ACL expansion. The certification fixture initially collided with another fixture's repeated hash. It now uses a fixture-specific SHA-256. Both failures remain in Actions history. Migration was moved from the occupied October 26 slot to 20261027_001. It drops and recreates its own constraints transactionally so reapplication succeeds.

The interruption test creates the durable state after a committed conversation transaction. It does not claim an OS process-kill test. Concurrent recovery processes converge on one successor. Tests verify original observations remain unchanged, successful retry, idempotent replay, lineage immutability, ordinary-role exclusion, and inability to certify ABANDONED evidence.

## Authority and recovery
T1 repository/isolated PostgreSQL work; T2 shared Supabase Test deployment under Joseph's October 27 explicit schema and Conversation ingestion authorization. Only CoMind Test sbgfuanxiqepcoboxzcl is in scope. No production, private export, paid provider, or unrelated-lane mutation. Existing archive role remains the writer, with no certification authority or destructive source privileges. Standards traceability uses the parent's existing governance references; no conformity claim is added.

Repository rollback is a revert. After deployment, preserve new attempt lineage and use forward repair, never delete interrupted evidence or remove used lineage columns. Session locks add bounded serialization; no new service or model cost. Existing CHIST and downstream lanes consume the accepted archive contract. Differential ingestion is issue #250 and follows this acceptance.
