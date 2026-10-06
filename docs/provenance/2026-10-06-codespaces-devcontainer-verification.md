# Codespaces devcontainer runtime verification evidence

Date: 2026-10-06
GitHub issue: #21
Pull request: #23
Verified branch: `feature/codespaces-bootstrap-verification`
Verified implementation commit before this evidence record: `2e894570ccc4aced089fa6a5a9c7fc0648ccf287`
Successful CI workflow run: `37516413631`
Initial diagnostic CI workflow run: `37515666566`

## Objective

Verify and harden the CoMind Codespaces development container and developer bootstrap path without touching live Supabase, using Neon, committing credentials, making a paid OpenAI request, or introducing a production Docker deployment path.

## Runtime contract

The development container contract now explicitly requires:

- `mcr.microsoft.com/devcontainers/javascript-node:24` as the workspace base image.
- `node` as the remote development user.
- Dev Containers UID updating for the remote user.
- PostgreSQL client 17 in the workspace image.
- `pgvector/pgvector:0.8.6-pg17-bookworm` for the isolated database service.
- The dedicated database name `comind_runtime`.
- Forwarded port 3000.
- `/workspaces/CoMind` as the workspace folder.
- `scripts/bootstrap_dev_runtime.sh` as the single guarded database bootstrap path invoked by `postCreateCommand` after `npm ci`.

The repository includes `scripts/verify_devcontainer_contract.mjs` so drift between `.devcontainer`, the README, and the declared runtime can fail CI.

## Diagnostic finding and correction

The first new devcontainer CI run, `37515666566`, successfully validated the static contract, Compose configuration, workspace image build, PostgreSQL 17 + pgvector service startup, and database health. It then failed when the `node` user attempted `npm ci` against the GitHub Actions bind-mounted checkout:

```text
EACCES: permission denied, mkdir '/workspaces/CoMind/server/node_modules'
```

This exposed an ownership difference between raw Docker Compose on a GitHub Actions runner and the Dev Containers runtime, which performs remote-user UID handling for bind-mounted workspaces.

The correction made the intended Codespaces user contract explicit with `remoteUser: node` and `updateRemoteUserUID: true`. The CI harness now aligns ownership of only the writable `server` subtree to that declared remote user before executing the exact `postCreateCommand`. This CI-only ownership preparation compensates for raw Compose not applying the Dev Containers UID update behavior itself.

## Successful devcontainer evidence

CI run `37516413631` built the workspace image from the Node 24 Dev Containers base image and installed PostgreSQL client 17.11.

The compose-managed database became healthy before the workspace started. The exact configured post-create lifecycle command then ran successfully:

```text
cd server && npm ci && cd .. && bash scripts/bootstrap_dev_runtime.sh
```

Dependency installation completed with zero reported vulnerabilities. The guarded bootstrap initialized only the isolated development database and reported:

```text
comind_runtime|t|t
Isolated CoMind chat development database is initialized.
```

The values establish the expected database name, PostgreSQL 17-or-newer behavior, and presence of the `vector` extension.

The workspace then completed the TypeScript build and server test suite inside the devcontainer runtime:

```text
tests 36
pass 36
fail 0
```

The final database assertion reported:

```text
Devcontainer runtime verified: comind_runtime|t|t
```

The CI cleanup removed the workspace container, database container, network, and `comind_runtime_pgdata` volume.

## Existing runtime regression coverage

The same successful CI run also passed the existing isolated `dev-runtime-verification` job. That job bootstrapped `comind_runtime`, exercised the real HTTP chat path, ran the Chrome browser persistence verification, and uploaded its browser verification screenshot.

The ordinary build job, PM Ledger migration job, and conversation lifecycle integration job also passed on the same commit.

## Required gates

For commit `2e894570ccc4aced089fa6a5a9c7fc0648ccf287`:

- CI run `37516413631`: success.
- Devcontainer contract validation: success.
- Docker Compose configuration validation: success.
- Devcontainer image build and isolated bootstrap: success.
- Node 24 runtime assertion: success.
- PostgreSQL client 17 runtime assertion: success.
- Server TypeScript build inside the devcontainer: success.
- Server tests inside the devcontainer: 36 passed, 0 failed.
- PostgreSQL 17 + pgvector database assertion: success.
- Existing isolated HTTP and Chrome browser runtime verification: success.
- PM Ledger migration verification: success.
- Conversation lifecycle integration: success.
- No Placeholder Policy run `37516413303`: success.
- Repository Configuration run `37516413302`: success.

## Safety statement

All database verification used isolated PostgreSQL containers and the dedicated `comind_runtime` or CI database names. No live Supabase database was read or mutated. Neon was not used. No OpenAI live-provider request was made. No credentials were committed. The Docker and Compose definitions remain development and verification infrastructure only.

## Hosted Codespaces observation boundary

The available GitHub connector does not expose Codespaces create or remote-exec operations, and its generic repository fetch endpoint does not permit the Codespaces API. Therefore this automated verification directly exercised the repository's exact Dockerfile, Compose services, lifecycle bootstrap command, user contract, build, tests, and database assertions, but it did not programmatically create a hosted GitHub Codespace instance.

The repository-level path is now deterministic and CI-enforced. A hosted Codespaces rebuild from this branch should execute the same `postCreateCommand` under the explicitly declared `node` remote user and then allow `npm run dev` with `/chat` available through forwarded port 3000.
