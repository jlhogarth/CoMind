# AGCOL-002 Test acceptance checkpoint, 2026-11-10

Issue [#553](https://github.com/jlhogarth/CoMind/issues/553), draft PR [#556](https://github.com/jlhogarth/CoMind/pull/556), branch `issue-553-agcol-002-bounded-parallel-mcp`. This is T2 bounded cross-agent Test execution, not a Production activation or enterprise certification.

## Exact-head proof

Candidate `7d926aa55d67c75dacf221f7f06c1ec50656457a`, [GitHub Actions run 42907300897](https://github.com/jlhogarth/CoMind/actions/runs/42907300897): contract, isolated PostgreSQL migration verifier, and guarded Supabase Test jobs passed. The contract job built the server and passed 13 graph/MCP/AGCOL-001 tests. The migration was applied twice in isolated PostgreSQL and its rollback-only verifier checked exact project/task claim, duplicate refusal, wrong-project denial, stale token denial and lease events. It was applied to Supabase CoMind Test through the migration API and direct readback confirmed the function and service-role EXECUTE privilege. The [acceptance artifact 13805482399](https://github.com/jlhogarth/CoMind/actions/runs/42907300897/artifacts/13805482399) has digest `sha256:854a87154ac80854a5eb45a4f580f049bb36bc9f8078d5611870c2a8b8d566a2`.

Independent read-only Supabase Test query for the exact run key `agcol002:7d926aa55d67:42907300897` found three done tasks, three completed fenced leases at epoch 1, three execution contexts, three successful outcomes, three canonical MCP evidence rows linked by execution context, three approved task decisions, zero active run grants and zero orphan ready AGCOL tasks. Negative authorization rows for expired decision, consumed grant and revoked grant had zero execution contexts. The guarded harness also asserted a wrong-project request was refused before execution and that a replay could not claim a completed task.

## Failure and recovery chronology

The first live job on candidate `fee302f6d1e46f4774c0a19e1b958c93f9b5592c` ran before the Test migration was installed and blocked without claiming tasks. After installation, a targeted rerun passed. Earlier cancelled and failed attempts left 12 synthetic unclaimed ready tasks; a scoped Test cleanup changed those tasks to `blocked` with history retained. The harness now blocks unfinished synthetic tasks in its finally path and revokes all run grants. This incident is why live migration sequencing and recovery cleanup remain explicit gates.

## Limits

The proof uses a fixed local read-only MCP fixture and synthetic evidence. It proves bounded concurrent roots and an evidence-backed dependent reviewer, not human-quality specialist reasoning, reviewer dissent propagation, crash-safe graph resume or full provider resource attribution. No paid service, external write, Production deployment or broad standing agent authority was authorized. The issue remains open for these gaps and independent review. The draft PR must not be called enterprise-ready solely from this Test proof.
