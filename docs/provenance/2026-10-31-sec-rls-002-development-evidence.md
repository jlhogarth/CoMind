# SEC-RLS-002 Development Evidence RLS Hardening

## Scope

SEC-RLS-002 hardens `comind_development.artifact`, `comind_development.external_reference`, and `comind_development.journal_entry` after SEC-RLS-001 completed its declared `comind` and `comind_pm` scope.

Production change: false.

## Reconstructed ownership and use

The three relations are part of the canonical development-evidence substrate. `artifact` identifies repository, Drive, CI, and other durable artifacts; `external_reference` records source references; `journal_entry` records chronological development evidence. They are not browser or Data API application surfaces.

Repository inspection found direct application-side reads of `artifact` and `journal_entry` in the Maintenance Control auditor. GER and HAI architecture/provenance records also identify the development schema as the canonical development-evidence substrate. No repository function or view was found that requires ordinary-role access to these three relations.

Connected Test catalog inspection before implementation showed:

- all three tables owned by `postgres`;
- RLS disabled on all three;
- no PUBLIC, `anon`, or `authenticated` table privileges were observed;
- ordinary API roles therefore had no demonstrated table access;
- no database function definition was found that directly references these three tables;
- existing maintenance and administrative access uses privileged database identities.

The gap is therefore defense-in-depth and consistency hardening, not evidence of an active ordinary-role data exposure.

## Decision

Enable RLS on all three tables and create no permissive policies. Explicitly revoke table privileges from PUBLIC and, when present, `anon` and `authenticated`.

This is intentionally fail closed. The tables are development evidence, not user-scoped application data. Creating ordinary-role policies without a demonstrated consumer would expand authority rather than harden it.

PostgreSQL owners and governed BYPASSRLS administrative identities retain their existing behavior. The migration does not grant new privileges or create a new service identity.

## Verification contract

The dedicated isolated PostgreSQL 17 proof:

1. creates the three target tables and ordinary roles;
2. deliberately grants ordinary-role table access before migration;
3. applies the migration twice to prove idempotency;
4. verifies RLS is enabled on every target;
5. verifies zero policies exist on every target;
6. verifies `anon` and `authenticated` no longer have SELECT;
7. verifies privileged owner readback still works.

## Connected Test acceptance

After the dedicated exact-head `SEC-RLS-002 Development Evidence RLS` workflow passed and a fresh collision read found no competing shared-Test mutation claimant, the bounded migration was applied to canonical Supabase Test.

Supabase migration ledger:

- version `20261031111456`
- name `sec_rls_002_development_evidence_hardening`

Independent post-change catalog readback proved for all three target relations:

- `relrowsecurity = true`;
- `relforcerowsecurity = false`;
- owner remains `postgres`;
- policy count is exactly zero;
- `anon` SELECT is false;
- `authenticated` SELECT is false.

Privileged readback remained functional and preserved the existing evidence rows: 13 artifacts, 43 external references, and 40 journal entries at acceptance readback. No evidence contents were rewritten or deleted.

## Recovery

If a legitimate non-BYPASSRLS consumer is later demonstrated, do not add a broad policy. Reconcile that consumer's identity and minimum required operations in a successor hardening decision. Repository rollback is a normal revert; connected database rollback requires an explicit evidence-backed policy decision because disabling RLS would weaken the accepted security posture.
