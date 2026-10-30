# SCOUT-003R Canonical Authorization Reference Array Repair

Date: 2026-10-30
Issue: #435
Predecessor: SCOUT-003 / PR #432 / merge `c0af6d1ab4ec7aff368e71ad1b19ae7065975fb3`
Failed workflow run: `41104312138`

## Failure

The first post-merge SCOUT-003 live Test dispatch failed before Scout lifecycle activation. PostgreSQL rejected the lifecycle authorization request with SQLSTATE `23514` on `cm_foundry_authorization_request_evidence_refs_ck`.

Canonical database inspection proved:

- `comind.cm_foundry_authorization_request.evidence_refs` must be a JSON array.
- `comind.cm_foundry_authorization_decision.policy_refs` must be a JSON array.
- accepted Foundry authorization records use arrays of durable string references.
- the merged SCOUT-003 harness supplied JSON objects for both fields in lifecycle and work authorization paths.

## Recovery baseline

Independent live readback after the failed workflow proved Scout remained `draft`, `activated_at` remained null, authority remained C0-C1, external resources remained zero, no research capability grant existed, no SCOUT-R001 task existed, and no authoritative SCOUT-R001 execution existed. The only pre-failure durable mutation was idempotent registration of `research.evidence.synthesize`, which carries no authority by itself.

## Repair

The four SCOUT-003 authorization reference expressions now use canonical JSON arrays of durable string references:

1. lifecycle request `evidence_refs`;
2. lifecycle decision `policy_refs`;
3. SCOUT-R001 request `evidence_refs`;
4. SCOUT-R001 decision `policy_refs`.

The repair preserves the existing founder attestation UUID, authority levels, isolated Test environment, exact targets, one-task ceiling, local Ollama provider, zero paid cost, revocation requirement, idempotency keys, and Production=false boundary.

Static contract coverage now fails if the old SCOUT-003 object-shaped authorization-reference expression returns or if all four canonical array expressions are not present.

## Restart condition

After exact-head acceptance and merge of this repair, rerun the existing SCOUT-003 post-merge workflow with canonical founder-attestation audit UUID `73932620-d4bc-46ec-ae8e-4ce50abc6bfe`. No new human attestation is required or authorized by this repair.
