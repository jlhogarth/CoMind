# IIC-003 Development Evidence

Issue: #347  
Branch: `iic-003-ndt-hard-enforcement`  
Starting main: `927caa0a69eb7cb2622480d783961549abd93c4d`

## Promotion evidence

IIC-002 PR #346 merged only after exact-head reconciliation to the then-current `main` and all returned workflows passed. Its exact-head integrity artifact recorded:

- NDT-001 findings: 0;
- NFS-001 candidates: 4;
- blocking findings: 0.

The four NFS candidates were reviewed as intentional tolerance and were not suppressed or baselined.

## Local IIC-003 verification

Before repository write:

- the existing 20-test IIC-002 engine suite passed;
- the new enforcement contract validator passed against the proposed workflow;
- the new 8-test enforcement/adversarial suite passed;
- Python compilation passed for the new validator and test module.

The adversarial suite proves NDT enforcement fails for missing workflow, local-action, and package paths while NFS candidates remain nonblocking.

## Anti-bypass decision

IIC-003 uses both self-validation in the primary Implementation Integrity workflow and a separate Integrity Governance workflow. This provides independent repository-visible evidence if the primary enforcement contract is weakened.

No baseline file is created because accepted NDT debt is zero.

## Exact-head evidence metadata defect and repair

The first successful IIC-003 enforcement artifact correctly reported zero NDT findings, four NFS candidates, and zero blocking findings, but its JSON still contained the historical field `lane: IIC-002` inherited from the multi-control refactor. The control behavior was correct, but the artifact metadata overstated stale lane identity.

The branch was not accepted in that state. The engine evidence identity was changed to stable, lane-neutral metadata:

- `lane: IIC`;
- `component: implementation-integrity`.

The engine docstring was also made increment-neutral, and the regression suite now asserts both metadata fields. NDT/NFS fingerprint identity was not changed. Local engine, enforcement, contract, and compile checks were rerun successfully after the repair. Fresh exact-head CI is required after this change.

## Known boundary

GitHub branch metadata reports `protected: false` and required status-check enforcement off for `main`. The repository-level setting is therefore not claimed as implemented. CoMind acceptance discipline and CI fail-closed behavior are implemented here; repository-administration hardening remains a separate boundary.

## Cost and recovery

No paid provider, database mutation, Production action, or external package. Cost is GitHub Actions runner time. Recovery is repository revert.
