# Operator Console security boundary

## OC-001 classification

T1 Reversible development. Repository-only changes are isolated on the Issue #112 feature branch. OC-001 performs no authorized live schema mutation and contains no destructive database workflow.

## Credential boundary

Browser code may receive only the Supabase project URL and publishable key. It must remain subject to PostgreSQL grants and Row Level Security.

Secret keys, legacy service-role keys, database connection strings, passwords, and privileged metadata credentials must not use `NEXT_PUBLIC_` variables and must never be bundled into browser code.

## Metadata boundary

The Operator Console needs richer metadata than ordinary Data API table reads provide. PostgreSQL catalog introspection will therefore cross a protected server boundary. The implementation must choose the least-privilege mechanism that can return the approved metadata contract.

OC-001 does not silently create a `SECURITY DEFINER` function or other privileged RPC to solve this problem. If a database function is later required, it must receive an explicit authority classification, grants review, search-path hardening, isolated verification, and migration evidence before production consideration.

## Mutation boundary

General CRUD, parent-child transactional writes, cascade deletion, and raw SQL are outside OC-001. Later mutation endpoints must validate authorization server-side and preserve an auditable operation result. Destructive operations require an impact preview and explicit confirmation contract.

## Failure behavior

Missing configuration fails closed. RLS or permission denial must be shown as an actionable error rather than triggering a fallback to privileged browser access. Foreign-key metadata that references an undiscovered relation fails schema normalization rather than producing an incomplete relationship graph.
