# Assistant failure and recovery testing evidence

Date: 2026-10-06
Issue: https://github.com/jlhogarth/CoMind/issues/17
Pull request: https://github.com/jlhogarth/CoMind/pull/18
Branch: `test/assistant-failure-recovery`
Baseline main: `81867aee7fbdfa552c9027b243e9bd2b0a0367e8`
Verified regression-test implementation: `9ba8e7a0c90a0a82fad4ac2f7cf673e34b04d8e3`

## Executed PostgreSQL regression tests

The new `server/test/integration/assistant-recovery.test.mjs` uses the production Fastify application, production OpenAI adapter, and real PostgreSQL queries. Only the provider transport is replaced through test dependency injection. No provider credential or paid API call is required.

Five additional tests passed:

1. Disabled provider returns HTTP 503; direct SQL confirms the exact user row is unchanged, and reload retains its identifier.
2. Rejected upstream request returns generic HTTP 502 without upstream private details; SQL, reload, and search confirm the durable user message and absence of assistant output.
3. Empty provider text returns HTTP 502 and creates no assistant row.
4. Persisted tool-role history returns HTTP 502 before provider transport is called; existing rows remain unchanged.
5. Recovery after a failed attempt persists one assistant response. A later turn receives the selected conversation's chronological user/assistant/user history. Another conversation's rows remain unchanged and its content is absent from the provider request. SQL, reload, search, analytics, provider identifiers, model fallback, and token usage corroborate the two successful responses and four durable messages.

Each new test removes its own conversations. The new test file rejects nonlocal hosts and database names other than `comind_ci` before importing the database pool. A local negative check with `remote.invalid` was executed and exited with the expected assertion failure before database initialization.

## GitHub Actions execution

All permanent gates passed for the regression-test implementation:

| Gate | Run | Result |
| --- | --- | --- |
| CI | 37498878766 | Success |
| No Placeholder Policy | 37498878789 | Success |
| Repository configuration | 37498878835 | Success |

CI job evidence:

| Job | Job ID | Executed validation |
| --- | --- | --- |
| build | 112390415971 | Node 24 install, TypeScript build, 32 unit/route/provider/environment tests, production audit threshold |
| conversation-lifecycle-integration | 112390416404 | PostgreSQL 17 with pgvector, 11 integration tests, zero failures |
| pm-ledger-migration | 112390416626 | Isolated PostgreSQL 17 migration verification passed |
| dev-runtime-verification | 112390416278 | Isolated runtime bootstrap, real Fastify HTTP, Chrome create/send/reload, direct SQL persistence |

The browser gate continues to run with the assistant provider disabled. It does not establish a live OpenAI response or exercise provider-enabled UI behavior.

## Dependency audit finding and resolution

The initial production audit reported two moderate dependency findings affecting Fastify and fast-uri. They were below the existing high-severity CI failure threshold, so a green initial gate did not mean a clean audit.

Ran `npm audit fix --omit=dev` using Node 24 and npm. The compatible lockfile updates are:

- Fastify: 5.12.4 to 5.12.5.
- fast-uri direct resolution: 4.1.4 to 4.2.1.
- Two nested fast-uri resolutions: 3.1.7 to 3.1.8.

No forced major-version update or package manifest change was used. Reinstalled with `npm ci`, rebuilt TypeScript, and reran all 32 ordinary tests successfully. `npm audit --omit=dev --audit-level=moderate` reported zero vulnerabilities at execution time.

Advisory references:

- https://github.com/advisories/GHSA-hrr3-gc8f-f4qj
- https://github.com/advisories/GHSA-jvvf-x445-j334
- https://github.com/advisories/GHSA-4mh8-r7rc-xpvc

The PR check runs establish verification of the subsequent lockfile/evidence commit. Final run identifiers and complete logs are recorded in the PR description and the Google Drive session record. Ready-for-review status is set only after the final head passes all permanent gates.

## Source audit disposition

The repository scanner passed. A source review found no unresolved implementation markers, production test providers, or stubbed provider/persistence paths. Disabled-provider null values, absent optional usage metadata, explicit rejection of unsupported history, and HTML input hint attributes are deliberate behavior. Test fixtures and injected deterministic transports remain confined to test files.

This bounded regression pass does not certify production readiness, authentication isolation, concurrent/replayed generation requests, or live-provider operation.

## Live-provider blocker and handoff

No authorized development OpenAI key was supplied. A real paid provider call remains unverified. Resolver: Joseph Hogarth supplies a development credential through a protected runtime environment for the guarded `scripts/verify_openai_live.sh` path, which permits only local `comind_runtime`.

Before enabling broader provider use, a separate issue should address input-history budgets and explicit transport timeout/retry budgets. Source review shows output-token limits exist, but the adapter currently forwards all persisted history and constructs the SDK client without explicit timeout/retry settings. This is a follow-on scope, not evidence of a bounded live cost test.

No live Supabase changes, Neon, Linear, production deployment, or PR merge occurred in this testing pass. Keep this issue active until PR #18 is merged. Detailed execution logs and the resume record belong in CoMind Google Drive; chat carries only concise decisions, results, and blockers.
