# RSE-001 Railway Test sandbox milestone

Owner: [Issue #586](https://github.com/jlhogarth/CoMind/issues/586). Tier T2, metered Test execution under the Founder's bounded authorization. The only branch is `issue-586-rse-001-railway-sandbox`. The approved project is CoMind AED Test Runtime, environment `test` (`f9371d64-57a4-4b2e-8665-84fe040ef90c`). Existing AED return and Postgres resources remain independently owned.

## Console proof on November 24, 2026

Railway Usage showed Hobby $5.00 included monthly usage and Test project usage $0.0004. The Test sandbox list was empty before creation. The dashboard created sandbox `10e616d9-f6d6-4154-93e0-2bba3a71ab38` in SFO with a 30-minute idle timeout. The console ran a deterministic `printf | tee | sha256sum` command and displayed `RSE-001|issue-586|railway-test|proof-20261124-01` and UTC `2026-11-24T06:59:01Z`. The screenshot is retained only in the conversation session. The destroy confirmation was interrupted before submission; neither explicit destruction nor independent teardown readback was observed. Treat this sandbox as a possible orphan until the Test sandbox list or API independently proves it destroyed. Do not create another sandbox before that check.

## Automated proof runner

`proof.mjs` uses Railway's official SDK. It fails closed unless a Test-scoped project token, the exact Test environment ID, a writable JSONL evidence path, and an observed included-credit balance of at least $0.10 no older than ten minutes are supplied. The token and balance are never written to evidence. It creates one 0.5 vCPU/0.5 GB, isolated, non-public VM with a one-minute idle timeout. The proof command has a 20-second timeout, captures at most 4 KiB, and compares its output digest to a locally computed SHA-256. `finally` requests destruction, then independently lists active sandboxes and records `TEARDOWN_VERIFIED` only if the ID is absent. It records `TEARDOWN_UNCERTAIN` on an error. An uncertain create response remains a possible orphan until a separate environment list is inspected; the one-minute idle timer is the recovery bound in that case.

To run, install the package from this directory with `npm install` using Node 22 or later. Populate `RAILWAY_TOKEN`, `RAILWAY_ENVIRONMENT_ID`, `RSE_EVIDENCE_PATH`, `RSE_CREDIT_OBSERVED_AT` (ISO UTC), and `RSE_VERIFIED_REMAINING_CREDIT_USD` from a fresh account readback, then run `npm run proof`. The JSONL file must be copied into durable, sanitized RunBook evidence after the run. The token must be scoped to the Test environment. Do not use an account-wide token or expose any secret in GitHub.

This is a bounded admission check and cleanup protocol, not a provider-side hard dollar cap. The current workspace compute hard-limit setting was not changed. A 0.5 GB VM remaining at peak memory for two minutes would consume about $0.00116 in RAM at the documented VM rate, plus actual CPU and egress. Actual usage must be read from Railway later; the estimate is not a billing receipt.

## Acceptance state

| Gate | State | Evidence / next check |
| --- | --- | --- |
| Existing infrastructure and ownership | Observed | Test project has offline AED return and Postgres; no service modified |
| Sandbox create, deterministic command | Observed once via console | Synthetic output in session, not yet exported |
| Explicit destroy and independent teardown | **Unknown** | Confirm old sandbox absent; clean it if present |
| SDK proof runner | Code committed, not executed | Execution workspace failed startup; token not bound |
| Durable evidence | Partial | Canonical Google Drive Development RunBook entry; SDK JSONL pending |
| FinOps actual cost | Unknown | Obtain post-run Railway usage; preserve source timestamp |
| AED/Foundry/CRP runtime integration | Pending | Reconcile owners and bind reusable adapter behind existing authority |
| Recovery, idempotency, origin isolation, supervisor, operator controls | Pending | Isolated acceptance after runner proof |
| Exact-chat wake | Separate acceptance | Do not infer from sandbox success |

## Recovery and rollback

The safe rollback for this milestone is destroying only the RSE sandbox ID and independently re-reading the Test sandbox list. Do not change or delete the Test project, Postgres volume, AED return service, or their variables. On an SDK error, inspect the JSONL last event and query Railway for the run's sandbox ID before retrying; a missing creation receipt does not prove no sandbox exists. Keep the branch and PR draft until a real SDK proof and the required downstream gates are verified. No Production change or new paid service is authorized.

Source: [Railway sandbox reference](https://docs.railway.com/sandboxes), [quickstart](https://docs.railway.com/sandboxes/quickstart), [VM rates and included usage](https://docs.railway.com/pricing/plans).
