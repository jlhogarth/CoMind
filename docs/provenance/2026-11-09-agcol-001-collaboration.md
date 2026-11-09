# AGCOL-001 collaboration implementation checkpoint

Date: 2026-11-09 (Indianapolis)
Issue: #548
Draft PR: #549
Environment: CoMind Test only
Tier: T2 bounded cross-agent Test execution; the repository change itself is T1

## Implementation

`server/src/agent-collaboration.ts` composes the accepted MDO planning queue and Foundry worker. It takes the ten canonical MDO roles in phase order. Each assignment supplies a distinct profile and worker identity. After a fenced claim, it checks the exact plan, capability, canonical role and sequence, predecessor contribution count, and evidence references. A separate accountable authorization callback supplies the task-specific decision, which the existing Foundry broker independently verifies. The MDO worker retains ownership of the lease once execution starts and persists Foundry outcome, provider evidence, contribution and terminal lease state. The runner returns a bounded receipt for every completed specialist and stops on failure. It does not grant itself authority, create a queue, or call a paid provider.

The existing MDO-003 Test acceptance runner now invokes this composition with its accepted, task-specific authorization issuer. A pre-dispatch mismatch releases the fenced claim through the canonical work-lease function. This alters the Test harness, not the Production application path. The AGCOL workflow is limited to the exact #548 branch and repository owner/actor for its secret-bearing live Test job. The Test harness independently reads back canonical work and evidence as before.

## Local validation

On the candidate worktree, `npm run build` passed and `node --test test/agent-collaboration.test.mjs test/mdo-planning-runtime.test.mjs` passed 10 tests. These verify complete ordered handoff, missing predecessor evidence, provider failure without double release, invalid role order, and accepted MDO worker behavior. Local tests use fakes and do not establish live activation. Exact-head CI and the live Test job must be inspected after the commit.

## Boundary and recovery

No Production deployment, external MCP mutation, paid inference or new persistent authority was performed by local validation. The Test workflow uses the existing local Ollama model and Supabase Test secret. If the workflow cannot start or fails, preserve its run and artifact/error; do not describe profiles as running. A mismatch before worker dispatch releases the claim; a failure inside the MDO worker follows its existing fenced release path. Revoke any short-lived Test grants through the accepted harness cleanup without deleting evidence.

Known unrelated CI gate: the No Placeholder Policy on the previous documentation head failed on `server/test/chatgpt-successor-registry.test.mjs:106` for a prohibited sample domain present on main. This branch changes only the synthetic invalid-host fixture to a reserved `.invalid` test domain; the expected rejection remains the same.

## Remaining proof

The exact AGCOL PR head must pass the build, new tests, MDO and Foundry regressions, then run the guarded live Test job. Inspect the uploaded artifact, database task/lease/authorization/execution/contribution/evidence readback, grant cleanup, and current main before merging. Do not claim enterprise readiness from one pilot.

## First live Test attempt and bounded repair

GitHub Actions AGCOL run 42712431165 at exact head `8e960bae4258e4bf68bc418e98977fbb860dfae1` passed the contract and isolated PostgreSQL claim-scope jobs. The live job connected to Supabase Test, then stopped in fixture preflight before workforce grants or agent execution: the existing synthetic MDO-003 module was at lifecycle stage `specified`, while the historical harness asserted `conceived`. The failed artifact is GitHub artifact 13717040710. The failure does not prove an agent execution.

The repair accepts only the verified pre-build fixture stages `conceived` or `specified`, records the stage before execution, and asserts the readback stage is unchanged. It does not move the module backward or change maturity. Syntax, whitespace and No Placeholder checks passed locally after this edit. A new exact-head CI and live Test run is required.
