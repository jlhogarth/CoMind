# Interactive Runtime Performance baseline 008

Base main: `1e47dd1c61e9f6f91bc50ba8bad8a19bee8fab4f`. This initial baseline is deliberately limited to deterministic, no-network CI fixtures. It is **not** a measurement of deployed production latency.

Existing runtime instrumentation:
- `server/src/routes/assistant.ts` already emits `Server-Timing` claim, memory, provider, and persistence durations in milliseconds, plus structured completion logs. Claim includes PostgreSQL advisory locking, replay checks, history and generation claim. Memory includes synchronous retrieval when project-scoped. Persistence includes the assistant message insert and generation completion.
- `server/src/foundry-runtime.ts` persists one pre-dispatch `cm_foundry_recovery_checkpoint` after authority and budget checks and before adapter invocation. Checkpoint insert is a synchronous PostgreSQL dependency.
- `server/src/db.ts` uses a PostgreSQL connection pool; actual query latency includes connection acquisition in its default query wrapper.
- CI runs Node 24, TypeScript build and deterministic tests. Do not conflate GitHub job wall time with request latency.

Two compact CI artifacts now cover the baseline:
- `runtime-performance-baseline.json` is a deterministic in-process smoke fixture. It reports interactive request p50/p95, checkpoint payload size, five query-stub calls per request, synchronous checkpoint-fixture bookkeeping, and a paired control comparison for the local measurement overhead. This is instrumentation evidence only, not PostgreSQL or production latency.
- `foundry-checkpoint-postgres-baseline.json` is emitted by the existing isolated `comind_ci` PostgreSQL Foundry integration workflow. It measures real `cm_foundry_recovery_checkpoint` INSERT roundtrips in that disposable CI database and reports sample count, p50/p95, serialized parameter bytes, Node version, limitations and warnings.

The first verified isolated PostgreSQL artifact on 2026-10-10 recorded 3 checkpoint INSERT samples, p50 `0.619 ms`, p95 `0.663 ms`, parameter payload range `260-282` bytes, and no warnings. These values include connection-pool acquisition and PostgreSQL roundtrip on a GitHub-hosted CI runner. They must not be represented as production latency or as a service-level objective.

Regression reporting remains warning-only. No new database schema, agent, service, external dependency, paid provider call, or production database mutation was introduced for this baseline.

Future work, not authorized by this milestone: historical trend storage, concurrency testing, write amplification analysis, and blocking regression thresholds.
