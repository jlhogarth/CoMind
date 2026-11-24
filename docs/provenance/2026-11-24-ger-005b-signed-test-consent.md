# GER-005B signed Test consent checkpoint, November 24, 2026

Owner: GER-005 [#382](https://github.com/jlhogarth/CoMind/issues/382), implementation [#584](https://github.com/jlhogarth/CoMind/issues/584), draft [PR #585](https://github.com/jlhogarth/CoMind/pull/585). Tier T3 security-control change under Joseph's Test continuation authority. No Production, paid inference, or real-participant data.

## Observed implementation

- Existing Test identity binding from GER-005A remained exactly one synthetic actor linked to one confirmed Supabase Auth account. No personal profile was copied. It is not a claim that the synthetic actor represents Joseph or Lisa.
- Applied migration `ger005_test_consent_signed_principal_v1` in CoMind Test project `sbgfuanxiqepcoboxzcl`, PostgreSQL 17.11. The migration introduces an append-only private consent decision event, a signed-principal resolver, and narrowly granted `authenticated` RPCs for `allow`/`deny` and current decision. The purpose is fixed to `digital-twin-synthetic-test`.
- Ran `db/verification/20261124_001_ger005_test_consent_verification.sql`: table RLS, direct grants, RPC grants, immutability trigger checked; decisions total 0. A transaction under `authenticated` with no signed subject failed to call `allow`; independent readback still showed 0 decisions. This is a negative role check, not signed JWT proof.
- `apps/operator-console` `npm ci --ignore-scripts` and `npm run build` passed, including `/ger-005-test`. Exact GitHub head `24d5e2137aa4b25fff83fa9e600bb507d2132238` passed CI, Operator Console CI, Implementation Integrity, Integrity Governance, and No Placeholder Policy.
- Vercel preview deployment `dpl_44VyuaKAe7XDYhozvo9hSBsXLNgd` reached READY from that head and branch. The rendered route showed the fictional Test purpose and sign-in field. Preview configuration readback included the existing Test Supabase URL and publishable key. No Production alias promotion.

## Open gate and acceptance

There is no `allow` or `deny` decision yet. A real subject must sign into the preview and explicitly choose a decision. The SQL role test cannot stand in for that signed action. Independently review the SECURITY DEFINER code, sign-in redirect and grants before treating this as a generalized consent pattern. The current event gives evidence for a purpose-scoped Test decision only; it does not erase source data, create a GER assertion, deploy a Twin view, or make the caller-supplied `assessTwinPromotion` context authoritative. No durable promotion is authorized from this event alone.

Next bounded execution: complete genuine signed session and decision, read back the event independently, then implement the smallest GER-owned fictional candidate eligibility readback, prove denial and correction remove it from the current projection, and preserve prior lineage. Revoke the two RPC grants to disable the Test route if needed; retain append-only audit events.
