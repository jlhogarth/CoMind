# FinOps #550 operational journal

**November 9, 2026 · CoMind Test · L4A · T1 development and T2 private recordkeeping**

- Verified main `be7c2c4d8c3c9811c115b40a364c5580d1354262`, FinOps starting head `d82d870786eda248ab109b1f5d6251d69e5b5e88`, and AED-007 dependency head `32d19fc955b9620db5c3ddcfadb8420362bf9cdb`. The existing FinOps lane is [#550](https://github.com/jlhogarth/CoMind/issues/550) and [draft PR #551](https://github.com/jlhogarth/CoMind/pull/551). [AED #540](https://github.com/jlhogarth/CoMind/issues/540) and [draft PR #541](https://github.com/jlhogarth/CoMind/pull/541) retain source, collection and recovery ownership. AED-006 browser instrumentation in [#537](https://github.com/jlhogarth/CoMind/pull/537) is separate process telemetry. [CI-FINOPS #510](https://github.com/jlhogarth/CoMind/issues/510) retains CI cost control. FinOps schema and allowance intake remained in their existing ownership.
- Live authorized read-only Supabase queries returned 65, 122, and 59 events. All 246 have valid-format recorded payload digests and complete sequences. Execution and artifact digests were unchanged across the pre-change and revised projections. No duplicate event keys and no recorded actual USD amounts. Existing API usage, cost reservations, alerts, and API receipts returned zero rows in their checked tables. Archived source bytes for the historical rows were outside this verification.
- RLS remains enabled on both AED tables. Live `SET LOCAL ROLE` access probes for `anon` and `authenticated` returned SQLSTATE `42501` at the private schema. The management session could execute the authorized read-only query but was denied permission to assume `comind_aed_monitor_reader`. Direct testing with that dedicated identity remains pending.
- A private Drive archive independently matched its recorded SHA-256. The bridge rehashed all five members, validated the execution and both snapshots, reproduced the observation sidecar and AED report, and reported the observation as unallocated. The archive run is absent from the persisted baseline. Tests cover the same-execution join and conflict rejection. The live check did not exercise a single execution present in both sources.
- Fourteen deterministic Python tests passed, plus a local monitored run of the reconciliation CLI using live Supabase results and the verified Drive archive. The monitored step completed successfully. The owner-only reconciliation report and FlowOps log preserve run identity and byte counts. The private CoMind API Cost Register now has separate FlowOps Measurements and Work Allowance Evidence tabs. The new rows were read back exactly and the receipt ledger header and leading rows were unchanged. Whole-session Work allowance and provider charges remain unknown.
- The pre-change [No Placeholder Policy job](https://github.com/jlhogarth/CoMind/actions/runs/42702820425) failed. The local scanner reproduced the existing finding at `server/test/chatgpt-successor-registry.test.mjs:106`. This lane leaves that file to its owner. The existing CI, Integrity Governance and Implementation Integrity jobs passed at the starting head.
- No database writes, browser grants, migrations, paid inference tests, or Production deployment. Rollback is to revert the scoped FinOps code and, if required, correct the supplemental private register rows in place using their execution identities. Existing AED and API accounting records remain authoritative.
- Next acceptance action is a single authorized report using the dedicated reader and a normal monitored execution already archived through AED-007's approved ingestion workflow. A synchronized account window for that same run should be supplied by the existing allowance capture mechanism. Require a separate authorization decision if a new ingestion or credential change is necessary.

## Independent head verification and safeguards

- A concurrent update advanced PR #551 during verification. The review
  adopted its existing CLI and test paths. The follow-up rejects reuse of
  a snapshot across adjacent observation windows and suppresses token and
  duration totals for incomplete persisted sequences. Fifteen deterministic
  FinOps tests and six upstream meter tests passed.
- The authoritative query was rerun in CoMind Test. The historical source and
  artifact SHA-256 values and ordered payload-hash fingerprints matched the
  independent preflight snapshot. Both browser roles were denied. Catalog
  checks confirmed RLS and read-only privileges for the dedicated reader.
- An independently generated private report was retrieved from Drive and
  matched its local SHA-256. No private account readings were added to GitHub.
