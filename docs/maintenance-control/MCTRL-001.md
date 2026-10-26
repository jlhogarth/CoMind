# MCTRL-001 - CoMind Maintenance Control v0.1

## Status

Implementation lane for GitHub Issue #213.

Development classification: T1 Reversible Development.
Auditor runtime authority: T0 Informational, read-only.
Target environment for live verification: Test.
Production mutation: prohibited by this version.
Automatic remediation: not implemented.

## Purpose

MCTRL-001 detects maintenance drift in CoMind's canonical evidence and documentation control plane and identifies which derived artifacts should be reconsidered after consequential changes.

It does not create a competing source of truth. Canonical facts remain in the existing evidence system. The version-controlled maintenance configuration records expected baselines and explicit change-impact rules so drift can be detected deterministically.

## Components

1. `config/maintenance-control.v1.json`
   - governed control definitions;
   - explicit baseline expectations;
   - change-impact rules;
   - remediation guidance.
2. `server/src/maintenance-control/config.ts`
   - validates the complete control map with Zod;
   - rejects duplicate IDs and dangling required-check references.
3. `server/src/maintenance-control/db.ts`
   - requires a dedicated `MAINTENANCE_CONTROL_DATABASE_URL`;
   - never falls back to the application's generic `DATABASE_URL`;
   - opens a PostgreSQL `READ ONLY` transaction;
   - applies bounded statement and lock timeouts.
4. `server/src/maintenance-control/auditor.ts`
   - executes deterministic checks;
   - reports `PASS`, `WARNING`, or `FAIL`;
   - treats query errors as `FAIL`;
   - resolves explicit change-impact rules.
5. `server/src/maintenance-control/cli.ts`
   - emits a JSON audit report;
   - exits nonzero on `FAIL`.
6. `.github/workflows/mctrl-001-maintenance-control.yml`
   - proves the contract against isolated PostgreSQL 17 on pull requests;
   - after reviewed code lands on `main`, repeats the isolated proof and runs one bounded read-only audit against CoMind Test;
   - preserves the live JSON audit report as a GitHub Actions artifact.

## Initial control coverage

The v0.1 baseline checks:

- required canonical schema columns;
- canonical concept count;
- active, retired, and priority-weighted concept relationship counts;
- candidate/proposed/unresolved relationship leakage into active canonical relationships;
- CCI, MLC, DPE-001, and DPE-002 entity versions;
- selected DPE and MLC payload invariants;
- orphaned relationship endpoints/evidence references;
- orphaned artifact ownership;
- declared Test RLS posture;
- verified DPE-002 milestone journal state;
- maintenance-control external research write-through.

A baseline mismatch is not automatically corruption. Expected counts and versions can legitimately change. A mismatch means the dependent projections must be reconciled and the baseline updated as part of the same governed change rather than allowing silent drift.

## Change Impact Map

The initial map covers explicit triggers for:

- concept identity changes;
- relationship changes;
- lifecycle evidence and maturity changes;
- schema, RLS, and privilege changes;
- external research completion/correction.

Only `current` rules participate in impact resolution. Candidate and retired rules do not affect current maintenance decisions.

MCTRL-001 does not infer impact from semantic similarity or model plausibility. New impact relationships require an explicit rule with rationale and required checks.

## Read-only enforcement

The auditor uses a dedicated connection URL and then executes:

1. `SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY`;
2. `BEGIN READ ONLY`;
3. bounded statement and lock timeouts;
4. an explicit `SHOW transaction_read_only` preflight.

The PostgreSQL 17 integration test attempts a write from inside the auditor transaction and requires PostgreSQL error `25006` (`read_only_sql_transaction`). The test then independently verifies the target table remains unchanged.

This runtime guard does not replace least-privilege database credentials. A future operational deployment should use a dedicated login/role with SELECT-only privileges in addition to transaction read-only enforcement.

## Running the auditor

Build first:

```bash
cd server
npm ci
npm run build
```

Run against an explicitly selected Test database:

```bash
MAINTENANCE_CONTROL_DATABASE_URL='postgresql://...' npm run maintenance:audit
```

Optional configuration override:

```bash
MCTRL_CONFIG_PATH='/absolute/path/maintenance-control.v1.json' \
MAINTENANCE_CONTROL_DATABASE_URL='postgresql://...' \
npm run maintenance:audit
```

The CLI intentionally does not accept `DATABASE_URL` as a fallback, and the test suite proves that refusal.

### CI and live-Test proof

Pull requests run only the isolated PostgreSQL 17 contract proof and receive no live Test database credential from the MCTRL workflow.

A push of the reviewed MCTRL implementation to `main` runs the isolated proof first. Only after that job succeeds does the workflow use the existing governed Supabase session secret to execute one bounded read-only Test audit. The Supabase database CA is downloaded over HTTPS and its SHA-256 certificate fingerprint is checked against the repository's established pinned value before the connection is attempted.

The live audit output is retained as `mctrl-001-live-test-audit` for 30 days. A failed audit fails the workflow; the report is still uploaded for diagnosis when a report file exists.

## Report semantics

`PASS`
: Observed state matches the governed control expectation.

`WARNING`
: Drift or staleness exists in a control whose mismatch is not itself proof of unsafe state. Reconciliation is required.

`FAIL`
: A hard integrity expectation failed, the query could not be executed, required structure is missing, or non-canonical state contaminated an active canonical surface.

A database/query error always returns `FAIL`, regardless of the configured mismatch severity.

## Recovery and remediation

MCTRL-001 never repairs findings in v0.1. The operator must:

1. identify whether the observed difference is legitimate change or defect;
2. follow the referenced canonical evidence and affected-artifact path;
3. perform the repair in the appropriate governed development lane;
4. rerun the audit;
5. update the baseline only when the new state is verified and intended.

The auditor is therefore a detector and impact resolver, not an authority that rewrites canonical truth.

## Best-practice alignment

The design follows the configuration-management pattern checked during MCTRL-001 research:

- establish and version baselines;
- track and assess changes;
- detect deviations from approved state;
- generate durable findings;
- validate changes before operational adoption;
- keep remediation separate from detection authority.

The research session is recorded as `MCTRL-001-CONFIG-MAINTENANCE-BEST-PRACTICES-20261026` in the CoMind research evidence system.

## Current limitations

- v0.1 performs a bounded live Test audit when reviewed MCTRL code lands on `main`, but it is not a continuous monitor;
- Drive document text/version checks are not executed by the database CLI itself;
- GitHub state is not yet a live auditor input;
- expected baselines remain version-controlled configuration and must be updated with intentional canonical changes;
- no automatic remediation exists;
- no dedicated least-privilege database audit role has yet been created.

These are explicit boundaries, not implied future capabilities.
