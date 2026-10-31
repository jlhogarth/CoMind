-- CE-001 least-privilege hardening discovered by explicit ACL verification.
-- Supabase default privileges on public-schema views can grant service_role more
-- table privileges than the explicit CE SELECT grant intended.

REVOKE ALL ON TABLE
  public.v_ce_operator_summary,
  public.v_ce_operator_state_counts
FROM service_role;

GRANT SELECT ON TABLE
  public.v_ce_operator_summary,
  public.v_ce_operator_state_counts
TO service_role;
