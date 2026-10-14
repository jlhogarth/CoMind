# OC-001 acceptance evidence

## Verified repository state

- Feature branch: `issue-112-operator-console-foundation`.
- Base main SHA at branch creation: `1d40350450d0352810cb9beb6f22d8d4b624fba0`.
- Operator Console is isolated under `apps/operator-console` except for its dedicated CI workflow and root ignore entries.
- Live Supabase has not been mutated by OC-001.
- Schema contract preserves inbound/outbound FKs and CASCADE, SET NULL, SET DEFAULT, RESTRICT, and NO ACTION semantics.
- Browser configuration explicitly rejects public-prefixed privileged key/database variables.
- Read query helper bounds page size and rejects unsafe relation/order identifiers.
- Metadata provider fails closed until a protected provider is configured.

## Not yet verified

The repository connector can write and inspect GitHub state but does not provide a local Node execution environment for this branch. Therefore the following must not be represented as passing yet:

- npm dependency resolution and generated `package-lock.json`
- unit tests
- TypeScript type check
- Next.js production build
- live Supabase metadata discovery
- live RLS-bound table reads

The dedicated CI workflow is designed to expose these gaps. It will require an npm-generated lockfile to be committed before the test/typecheck/build stages can become acceptance evidence.

## Current authority boundary

No live Supabase schema mutation, privileged metadata RPC, destructive database operation, raw SQL execution, or production deployment is authorized by OC-001.
