# IIC-001 Foundation Evidence

## Development Contract checkpoint

IIC-001 began from `main` commit `e53c4044dc9b80b481393615da44f4cc84262ffb`, the merge that established the canonical CoMind Development Environment Contract v1.0.

The implementation is T1 reversible repository development. It is additive and does not change Production, schema, RLS, grants, credentials, live data, paid-provider access, Foundry, MDO, Conversation History, Operator Console, RuleBook, or VE lifecycle implementation code.

## Collision and freshness check

The branch was created directly from the verified current `main` head. The initial compare showed the branch ahead by four commits, behind by zero, with four new implementation files and no modified existing path. This provenance record was then added as the fifth branch file.

Initial implementation files:

- `.github/workflows/implementation-integrity.yml`
- `docs/integrity/IIC-001.md`
- `scripts/check_implementation_integrity.py`
- `scripts/test_check_implementation_integrity.py`

No pre-existing repository path is modified by IIC-001 foundation.

## Reuse decision

The existing No Placeholder Policy remains the NPH-001 hard gate. IIC-001 does not duplicate or replace it. The new implementation follows the same repository-level enforcement pattern and introduces a reusable engine for successor integrity controls.

## Failure evidence retained

### YAML list-form parser defect

The first NDT-001 parser did not recognize GitHub Actions list-form `- run:` and `- uses:` entries. Synthetic tests exposed the defect. The matcher was corrected and the initial nine-test suite passed afterward.

### Generated-output false positives

The first exact-head repository shadow scan completed successfully but reported two unbaselined findings from `server/package.json`:

- `start:dist/index.js`
- `maintenance:audit:dist/maintenance-control/cli.js`

These were investigated rather than baselined. `server/tsconfig.json` declares `rootDir: src` and `outDir: dist`; `server/src/index.ts` and `server/src/maintenance-control/cli.ts` both exist. The findings therefore represented generated TypeScript outputs backed by checked-in source, not dead paths.

The detector was refined to accept a generated JavaScript target only when a local `tsconfig.json` contains literal `rootDir` and `outDir` values and the corresponding checked-in source exists. A generated target without matching source remains a finding. Two synthetic tests were added for these cases.

## Verification to date

- Python compilation passed for the engine and test file before the first PR run.
- Initial nine-test synthetic suite passed.
- First exact-head Implementation Integrity workflow completed successfully.
- Its preserved machine-readable artifact contained exactly two findings, both classified as generated-output detector false positives after source/build inspection.
- Refined local suite contains eleven tests and passes.
- Existing No Placeholder prohibited-pattern set returned zero findings across the initial new files.

Fresh exact-head GitHub evidence is required after the generated-output refinement before acceptance or any enforcement promotion.

## Evidence discipline

The two initial repository findings are not placed in a baseline because doing so would convert detector error into accepted debt. Baseline creation remains deferred until any remaining exact-head findings have been classified and the detector is considered sufficiently precise for promotion.

## Recovery and cost

Recovery is revert or branch abandonment. There is no live-state rollback. No paid provider, external Python package, or runtime service is introduced. Cost is limited to GitHub Actions runner time and short-retention GitHub Actions evidence storage.
