# SCOUT-003 governed activation and first day of work

Date: 2026-10-30
Issue: #427
Predecessor: SCOUT-002, merged as `8ef4583c0cc125eb22376b69030aaa42911a4f8a`

## Purpose

SCOUT-003 converts the accepted Scout identity and C1 research package into a separately gated live Test activation and one-assignment execution path. The implementation preserves the separation between learning-path activation, VE lifecycle activation, capability grant, task authorization, runtime execution, evidence, and human review.

## Reuse

The lane reuses the existing `VeLifecycleCoordinator`, the VE lifecycle live Test harness, `FoundryRuntimeOrchestrator`, `FoundryAdapterRegistry`, the local Ollama Foundry adapter, canonical capability/grant/authorization tables, canonical Foundry execution context/outcome tables, `cm_task`, `cm_evidence`, and the RLIB learning-path/source registry. No parallel authority, execution, task, research, or evidence store is introduced.

## Human boundary

The accepted SCOUT-002 learning policy forbids automatic learning-path activation. Live execution requires an exact durable `scout.learning_path.activation_attested` audit record by canonical founder actor `joseph.hogarth`, and the learning path must be `active`. PR CI cannot create this record. The live workflow requires the exact audit UUID as a dispatch input.

## Source packet

The first assignment is source-bounded. The evidence packet is derived from the governed RLIB copies of:

1. NIST AI RMF 1.0, DOI `10.6028/NIST.AI.100-1`.
2. NIST AI RMF Playbook.
3. NIST AI 600-1 Generative AI Profile, DOI `10.6028/NIST.AI.600-1`.
4. Secondary non-normative ISO/IEC 42001 implementation guidance, retained only with its secondary classification.
5. Withdrawn NIST AI 600-1 Initial Public Draft, retained only as historical supersession evidence.

The packet contains bounded paraphrased material points, source IDs, classifications, lifecycle state, hashes, and freshness dates. It does not copy the source documents into the repository and does not grant Scout Drive or web access.

## Runtime boundary

Live execution is post-merge `workflow_dispatch` on `main`. GitHub Actions starts a local `ollama/ollama:0.40.8` service with cloud disabled and pulls `qwen3:0.6b`. The real Foundry runtime executes the C1 assignment against canonical Supabase Test. No paid provider, Production target, Google identity, external email, delegation, or external-resource mutation is authorized.

## First-day safety state

The research grant is exact-target, C1, isolated, non-delegable, two-hour maximum, and `max_tasks=1`. After successful SCOUT-R001 execution, the runner proves a second execution is blocked by `grant_task_limit_exceeded`, then revokes the grant. Scout therefore ends the first-day proof active but with zero active research grants.

## Failure and recovery

A failed live attempt revokes any active SCOUT-R001 research grant before exiting. No automatic retry is performed. Existing lifecycle, authorization, execution, and failure evidence remains inspectable. A subsequent run may proceed only through the explicit replay/recovery behavior and current governance state.

## Production and cost

Production is false. Paid provider use is false. Expected model cost is USD 0. GitHub Actions runner and existing Supabase Test usage are the only execution resources.
