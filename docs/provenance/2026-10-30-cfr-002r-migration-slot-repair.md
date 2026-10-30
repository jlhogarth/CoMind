# CFR-002R Migration Slot Repair Provenance

Date: 2026-10-30
Issue: #418
Blocked lane: MDO-005T #411
Environment: repository only
Production: unchanged

## Trigger

MDO-005T performed its required immediate freshness check before shared Supabase Test DDL. During that check, `main` had advanced through CFR-002 PR #388 and contained two files using migration slot `20261030_026`:

- `20261030_026_mdo_004_governed_plan_disposition.sql`
- `20261030_026_cfr_002_dual_acquisition_foundation.sql`

MDO-004 predates CFR-002 and is already present in canonical Supabase Test migration history. CFR-002 is not present in that history. The Test write therefore failed closed before MDO-005T mutated the database.

## Decision

The unapplied CFR-002 migration is moved to the next verified free repository slot, `20261030_030_cfr_002_dual_acquisition_foundation.sql`. At repair time, `_030` was absent from `main` and from all open pull-request migration paths.

No SQL semantics are changed. The migration content SHA-256 before and after the rename is `4c2f6ddd04fc15d6dcbc3e5d606a19e19d210d5a586f8d7161b51139c4ac345b`.

## Changed references

- `.github/workflows/cfr-002-dual-acquisition.yml`
- `scripts/test_cfr_002_dual_acquisition.sh`
- `docs/provenance/2026-10-30-cfr-002-dual-acquisition-foundation.md`

## Boundaries

- no Supabase DDL or DML
- no Production change
- no provider or model execution
- no paid resource
- no credential change
- no CFR runtime activation
- no change to CFR-002 database semantics

After merge, MDO-005T must repeat its freshness and migration-ledger checks before resuming shared Test activation.
