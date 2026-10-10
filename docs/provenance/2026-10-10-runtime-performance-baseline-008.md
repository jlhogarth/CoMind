# Interactive Runtime Performance baseline 008

Base main: `1e47dd1c61e9f6f91bc50ba8bad8a19bee8fab4f`. This initial baseline is deliberately limited to a deterministic, no-network test fixture. It is **not** a measurement of deployed PostgreSQL or production user latency.

Existing runtime instrumentation:
- `server/src/routes/assistant.ts` already emits `Server-Timing` claim, memory, provider, and persistence durations in milliseconds, plus structured completion logs. Claim includes PostgreSQL advisory locking, replay checks, history and generation claim. Memory includes synchronous retrieval when project-scoped. Persistence includes the assistant message insert and generation completion.
- `server/src/foundry-runtime.ts` persists one pre-dispatch `cm_foundry_recovery_checkpoint` after authority and budget checks and before adapter invocation. Checkpoint insert is a synchronous PostgreSQL dependency.
- `server/src/db.ts` uses a PostgreSQL connection pool; actual query latency includes connection acquisition in its default query wrapper.
- CI runs Node 24, TypeScript build and deterministic tests. Do not conflate GitHub job wall time with request latency.

The companion JSON artifact reports checkpoint fixture serialization size, local instrumentation overhead, and query-stub timing. It is useful as an instrumentation smoke test only. Actual checkpoint persistence latency and write amplification require a separate isolated-PostgreSQL integration measurement, which remains an acceptance gap until implemented and verified. No production targets are claimed.

Future work (not authorized here): historical trend store, concurrency tests, write amplification and blocking regression thresholds.
