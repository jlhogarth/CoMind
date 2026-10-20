# SDN Supabase Test ingestion slice

Issue #150 adds a small Test-only landing area that complements the local SDN-001 lifecycle proof. It does not synchronize the local SDN node or read from the existing CoMind, Foundry, Archive, or RunBook records.

The migration creates a private `sdn_test` schema with three append-only evidence tables:

- `synthetic_event`: producer-scoped event identity, canonical JSON SHA-256, immutable policy label, and synthetic marker;
- `provenance_edge`: source-to-derived event relationship;
- `integrity_conflict`: durable evidence when the same producer/event identity arrives with changed content.

The schema is not an application API. It grants no schema, table, sequence, or function access to `PUBLIC`, `anon`, `authenticated`, or `service_role`; each table has RLS enabled without policies. Ingestion runs through an invoker function that the application roles cannot execute.

## Isolated acceptance

From the repository root, run:

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/comind_ci \
  bash scripts/test_sdn_supabase_ingestion.sh
```

The script refuses database names other than `comind_ci` or `sdn_test_ci`, requires PostgreSQL 17, applies the migration twice, verifies canonical key ordering and a fixed payload digest, checks replay/conflict/provenance behavior and access boundaries, then rolls back the synthetic fixtures.

The CoMind Supabase Test project receives only the repository-tracked DDL through its migration workflow. CI is the isolated PostgreSQL contract proof. Test-project verification must report schema objects, privileges, RLS state, and migration history without copying any existing project data.

This slice has no lifecycle worker, retention automation, purge, remote ingress, Data API exposure, source-data ingestion, production data, or production readiness claim.
