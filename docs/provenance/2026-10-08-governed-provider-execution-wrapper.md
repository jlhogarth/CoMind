# Governed provider execution wrapper provenance

Date: 2026-10-08
Issue: https://github.com/jlhogarth/CoMind/issues/68
Pull request: https://github.com/jlhogarth/CoMind/pull/69
Authoritative base: `e953b318a3a5633552c27cc99aa98af4946465ea`
Verified implementation head before provenance commit: `cf918d95906aa2aec42e6de19fd47a65ef94b451`

## Purpose

Issue #68 connects the previously merged provider execution controls into one reusable governed runtime execution path:

immutable provider envelope -> trustworthy input-token preflight -> conservative maximum-exposure quotation -> atomic durable reservation -> exact provider execution -> authoritative telemetry persistence -> execution-role-correct settlement.

The contract is provider-execution oriented rather than assistant-route specific so the same authority model can be reused by chat, agents, workflows, tools, services, database operations, and future Virtual Employees.

## Reused authoritative layers

Issue #68 deliberately does not introduce a second identity, pricing, or accounting authority.

- Issue #57 remains the durable monetary source of truth.
- Issue #59 remains the current-runtime binding and reservation authority.
- Issue #62 remains the authoritative telemetry settlement contract and role-specific locator authority.
- Issue #64 remains the reviewed provider maximum-exposure quotation and OpenAI rate-card authority.
- Issue #66 remains the immutable provider execution envelope and trustworthy input-token preflight authority.

## Governed execution contract

For exactly one governed provider attempt, the reusable kernel now requires this order:

1. accept one immutable provider execution envelope;
2. verify envelope integrity;
3. reject nonzero automatic retry authority before monetary authorization;
4. obtain trustworthy input-token preflight bound to the exact envelope fingerprint;
5. quote maximum exposure from the exact preflight input-token count and immutable output bound;
6. fail closed on unavailable, malformed, ambiguous, or unquotable exposure;
7. derive deterministic reservation idempotency from the exact envelope fingerprint;
8. reserve maximum exposure through the durable current-runtime budget authority;
9. reject denied or ambiguous reservation results;
10. reject an idempotent existing reservation before a provider replay can occur;
11. reverify envelope and preflight integrity;
12. execute the exact immutable envelope request;
13. return the provider response plus a durable governed execution receipt for authoritative persistence and later settlement.

The governed execution receipt preserves provider, operation, execution role, envelope fingerprint, trustworthy token preflight, exposure quote, durable reservation identity, reservation idempotency identity, reservation status, and idempotent state.

## Explicit attempt identity and retry authority

Issue #66 originally established deterministic execution identity around provider, model, mode, role, timeout, retry policy, and exact provider request. Issue #68 exposed an important retry-authorization edge case: separately authorized attempts with identical request content would otherwise reuse the same fingerprint and reservation identity.

The immutable provider execution envelope therefore now includes `attempt_number` as part of the canonical execution identity and SHA-256 fingerprint. It defaults to 1 and must be a positive safe integer.

Consequences:

- attempt 1 and attempt 2 for otherwise identical provider requests have different fingerprints;
- each separately authorized retry receives its own token preflight, quote, reservation, provider attempt, telemetry identity, and settlement identity;
- the governed path requires `max_retries = 0` so the SDK cannot silently create several paid attempts behind one reservation;
- replay of an already reserved attempt is rejected before the provider executor;
- replay of a finalized attempt is rejected by the durable budget authority;
- a legitimate retry must use a new immutable `attempt_number` and therefore a new execution fingerprint and reservation identity.

This keeps retry authority explicit and auditable without creating a parallel runtime identity model.

## OpenAI adapter

The OpenAI governed adapter reuses the Issue #66 immutable envelope and Issue #64 quotation authority.

The quotation path verifies envelope and preflight integrity and feeds:

- exact trustworthy input-token count;
- immutable envelope `max_output_tokens`;
- requested model;
- processing mode

into the existing reviewed OpenAI maximum-exposure quotation contract.

The adapter validates requested model, canonical model, and processing mode identity against the envelope before monetary authorization continues.

Provider execution still uses the exact frozen request object held by the immutable envelope.

## Current-runtime budget authority and settlement

`CurrentRuntimeProviderBudgetAuthority` is the server adapter over the already-established Issue #59 and Issue #62 database functions.

Reservation uses `comind.cm_reserve_paid_provider_execution` with the current-runtime binding and deterministic idempotency key `provider-execution:<envelope fingerprint>`.

Settlement remains deliberately post-persistence. The governed wrapper does not mark monetary execution finalized before authoritative telemetry exists in `comind.cm_message.meta`.

Settlement uses `comind.cm_finalize_paid_provider_message_execution` and derives the telemetry locator from the immutable execution role instead of accepting an arbitrary caller locator:

- `root` -> `root`
- `draft` -> `quality_gate.passes.draft`
- `verifier` -> `quality_gate.passes.verifier`
- `repair` -> `quality_gate.passes.repair`

This preserves the Issue #62 requirement that one provider execution cannot be settled against another role's telemetry.

## Authoritative telemetry

Provider success telemetry now includes the envelope `attempt_number` along with the existing requested model, canonical model, processing mode, execution role, request fingerprint, timeout policy, and retry policy.

When a provider execution is governed, the same authoritative metadata also persists the governed execution receipt.

Quality-gate pass extraction preserves `attempt_number` and `governed_execution` for draft, verifier, and repair so role-specific settlement can resolve the exact durable receipt from persisted telemetry.

The existing non-governed OpenAI provider path remains compatible. Issue #68 adds the governed execution machinery without silently switching configured runtime traffic to paid governed execution.

## Deterministic verification

Network-free unit tests cover at minimum:

- count -> quote -> reserve -> execute ordering;
- token-count failure before provider execution;
- unquotable exposure before provider execution;
- reservation denial and ambiguity before provider execution;
- rejection of nonzero automatic retry policy;
- exact preflight input count and immutable output bound in quotation;
- exact immutable envelope execution;
- attempt-number fingerprint separation;
- deterministic reservation identity;
- root, draft, verifier, and repair attribution;
- quality-pass preservation of governed provenance;
- reserved-attempt provider replay rejection.

## Isolated PostgreSQL full-chain verification

A permanent `Governed Provider Execution` GitHub Actions gate uses PostgreSQL 17 plus pgvector and an isolated `comind_ci` database. It refuses non-local or non-`comind_ci` database targets before running.

The integration proof uses a deterministic fake token counter and synthetic provider response. No provider network request is made.

The proof executes root, draft, verifier, and repair independently and verifies:

- four provider attempts;
- four distinct envelope fingerprints;
- trustworthy token count of 100 per attempt;
- immutable maximum output bound of 512;
- Issue #64 maximum-exposure quotation;
- four durable reservations;
- exact provider execution;
- authoritative root and quality-pass telemetry persistence;
- role-correct Issue #62 settlement;
- four finalized usage events;
- exact aggregate accounting;
- settlement replay idempotency;
- provider replay rejection while reserved;
- provider replay rejection after finalization.

The ordinary conversation recovery integration suite was updated only to expect the newly authoritative `attempt_number: 1` metadata field. Runtime recovery behavior itself was not changed by that correction.

## Exact implementation-head verification

The implementation head `cf918d95906aa2aec42e6de19fd47a65ef94b451` passed all permanent gates before this provenance document was added:

- CI: https://github.com/jlhogarth/CoMind/actions/runs/37749473226
- Governed Provider Execution: https://github.com/jlhogarth/CoMind/actions/runs/37749472849
- Runtime Budget Authority Adapter: https://github.com/jlhogarth/CoMind/actions/runs/37749472864
- No Placeholder Policy: https://github.com/jlhogarth/CoMind/actions/runs/37749472926
- CoMind Repository Configuration: https://github.com/jlhogarth/CoMind/actions/runs/37749472993

The full CI run includes successful build, typecheck, server tests, dependency audit, durable budget authority, conversation lifecycle integration, development runtime verification, devcontainer verification, and PM ledger migration.

A final permanent-gate cycle is required on the documentation-adjusted PR head before merge. Final PR-head and post-merge evidence belongs in the durable CoMind Runbook and GitHub Actions history so this tracked provenance file does not require self-referential commit rewriting.

## Safety state

Issue #68 deterministic implementation and verification used:

- no paid OpenAI/provider request;
- no live OpenAI input-token-count request;
- no live Supabase mutation;
- no production deployment;
- no credential or secret exposure.

All provider-facing verification is deterministic and network-free.

## Deferred recovery layer

Issue #68 establishes the successful governed execution and durable settlement contract plus replay protection. The next coherent milestone should harden provider failure and recovery semantics, including token-count failure, unquotable execution, reservation denial, provider failure, timeout, explicit retry authorization, confirmed pre-provider cancellation, unknown cost, stale reservations, settlement mismatch, and rejected-settlement recovery.

A deliberately bounded live provider proof should occur only after the recovery layer is complete and all deterministic gates are green, unless Joseph explicitly authorizes an earlier paid verification.
