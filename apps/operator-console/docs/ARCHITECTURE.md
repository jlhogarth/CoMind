# Operator Console architecture

## Boundary

The Operator Console remains part of CoMind while living under `apps/operator-console`. Its generic schema and query contracts are deliberately separable so the subsystem can later be extracted without forcing that commitment now.

## Data path

`PostgreSQL catalog metadata -> protected metadata provider -> validation -> normalized schema graph -> dynamic explorer`

Ordinary row reads use the Supabase Data API with a publishable key and remain constrained by grants and Row Level Security. Privileged metadata access is a separate trust boundary.

## Core modules

- `src/lib/schema/types.ts`: normalized metadata contract.
- `src/lib/schema/validate.ts`: runtime trust-boundary validation.
- `src/lib/schema/registry.ts`: deterministic graph construction.
- `src/lib/schema/relationships.ts`: bidirectional relation navigation.
- `src/lib/schema/provider.ts`: protected metadata-provider interface and fail-closed behavior.
- `src/lib/queries/read.ts`: bounded read-only page queries.
- `src/lib/queries/filters.ts`: typed filter contract and identifier validation.
- `src/lib/supabase`: browser-safe Supabase configuration.
- `src/components`: generic relational navigation and row presentation.

## Mutation architecture

Mutation capabilities are deliberately absent from OC-001. Future parent-child writes must be atomic at the database/server transaction boundary. Future deletes must evaluate actual PostgreSQL FK actions and provide impact evidence before execution. Raw SQL must remain behind an independently authorized server boundary.

## Extraction trigger

Consider a separate repository only if the console develops an independent release lifecycle, independent ownership/security boundary, or substantial use outside CoMind. Until then, keeping it in CoMind reduces integration and provenance overhead.
