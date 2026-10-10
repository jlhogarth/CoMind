# Interactive Runtime Performance baseline 008

Base main: `1e47dd1c61e9f6f91bc50ba8bad8a19bee8fab4f`. This initial baseline is deliberately limited to deterministic, no-network CI fixtures. It is **not** a measurement of deployed production latency.

## Lane status

**MONITORING / TRIGGER-DRIVEN REACTIVATION.**

Interactive Runtime Performance is not an active development stream after acceptance of baseline 008. The existing CI measurements remain a standing performance guardrail. No new runtime-performance implementation milestone should be opened merely to extend instrumentation.

The lane should reactivate only when at least one of these conditions is materially present:

1. **Measured regression:** a meaningful deterioration appears in interactive p50/p95 latency, query count, checkpoint cost, synchronous work, or another already-instrumented runtime phase.
2. **Major runtime-path change:** CoMind adds or materially changes memory retrieval, agent orchestration, governance gates, checkpointing, external API calls, persistence behavior, or another component expected to affect the interactive critical path.
3. **Concurrency becomes decision-relevant:** the web application or Virtual Employee runtime reaches a stage where realistic concurrency, contention, throughput, queueing, or load testing would change an architecture or release decision.
4. **Deployed latency becomes measurable:** a governed deployed environment exists where end-to-end latency can be measured safely and meaningfully, allowing CI, isolated PostgreSQL, and production observations to be distinguished rather than conflated.

When a trigger fires, first compare the new condition against the established baseline and open the smallest justified performance milestone. Prefer diagnostic evidence and warning-only guardrails before adding persistent monitoring infrastructure, blocking thresholds, historical trend storage, or other runtime overhead.

If none of the trigger conditions is present, this lane remains under monitoring and development attention should stay on higher-value active CoMind work.

## Existing runtime instrumentation

- `server/src/routes/assistant.ts` already emits `Server-Timing` claim, memory, provider, and persistence durations in milliseconds, plus structured completion logs. Claim includes PostgreSQL advisory locking, replay checks, history and generation claim. Memory includes synchronous retrieval when project-scoped. Persistence includes the assistant message insert and generation completion.
- `server/src/foundry-runtime.ts` persists one pre-dispatch `cm_foundry_recovery_checkpoint` after authority and budget checks and before adapter invocation. Checkpoint insert is a synchronous PostgreSQL dependency.
- `server/src/db.ts` uses a PostgreSQL connection pool; actual query latency includes connection acquisition in its default query wrapper.
- CI runs Node 24, TypeScript build and deterministic tests. Do not conflate GitHub job wall time with request latency.

## Baseline artifacts

Two compact CI artifacts cover the baseline:

- `runtime-performance-baseline.json` is a deterministic in-process smoke fixture. It reports interactive request p50/p95, checkpoint payload size, five query-stub calls per request, synchronous checkpoint-fixture bookkeeping, and a paired control comparison for the local measurement overhead. This is instrumentation evidence only, not PostgreSQL or production latency.
- `foundry-checkpoint-postgres-baseline.json` is emitted by the existing isolated `comind_ci` PostgreSQL Foundry integration workflow. It measures real `cm_foundry_recovery_checkpoint` INSERT roundtrips in that disposable CI database and reports sample count, p50/p95, serialized parameter bytes, Node version, limitations and warnings.

The final accepted baseline on 2026-10-10 recorded:
- Deterministic interactive fixture: 40 samples, interactive request p50 `0.349 ms`, p95 `0.822 ms`, measurement-overhead p50 delta `0.001 ms`, p95 delta `0 ms`, checkpoint payload `260` bytes, five query-stub calls per request, and no warnings.
- Isolated PostgreSQL checkpoint fixture: 3 real checkpoint INSERT samples, p50 `0.677 ms`, p95 `0.752 ms`, parameter payload range `260-282` bytes, and no warnings.

The isolated PostgreSQL values include connection-pool acquisition and PostgreSQL roundtrip on a GitHub-hosted CI runner. These measurements must not be represented as production latency or as a service-level objective.

Regression reporting remains warning-only. No new database schema, agent, service, external dependency, paid provider call, or production database mutation was introduced for this baseline.

Future work remains trigger-gated, not pre-authorized by baseline 008: historical trend storage, concurrency testing, write amplification analysis, blocking regression thresholds, and deployed production-latency monitoring.
