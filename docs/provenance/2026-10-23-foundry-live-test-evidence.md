# Foundry live Test execution evidence

GitHub Actions run: https://github.com/jlhogarth/CoMind/actions/runs/39918058517

Run #2 completed successfully on `main` at commit `252bc368e8bae0dc7f1d17660aa81263b90af1b9`.

Independent Test database readback confirmed:

- one lease claim at fencing epoch 1
- one attempt out of maximum one
- lease terminal state `completed`
- exactly two lease events: `claimed`, `completed`
- exactly one execution context
- exactly one execution outcome
- exactly one adapter operation
- exactly one adapter result
- terminal execution status `succeeded`
- adapter `ollama_local`
- model `qwen2.5:0.5b`
- authority `C1`
- target `jlhogarth/CoMind`
- execution was synthetic and non-cost-bearing
- no production execution and no separate ChatGPT session communication was proven

Recorded PROOF result summary:

> This is a live CoMind Test Supabase execution using the local ollama_local adapter at C1 authority. The task is to verify the synthetic ATLAS to PROOF handoff. The grant is synthetic-only, scoped to jlhogarth/CoMind, non-cost-bearing, and limited to one task.

The runner-generated JSON was created during the successful run, but the upload step looked in the wrong repository-relative path and therefore uploaded no Actions artifact. This record was reconstructed from the successful GitHub job log plus independent authoritative Test database readback.

Observed lifecycle gaps after terminal success:

- task status remained `in_progress`
- execution context `closed_at` remained null
- adapter operation status remained `approved`
- adapter operation `completed_at` remained null

These gaps do not invalidate the one-shot execution proof. They require separate lifecycle-consistency hardening before broader worker activation.
