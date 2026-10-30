# L4A-MP-002 Provenance

Date: 2026-10-30
Issue: https://github.com/jlhogarth/CoMind/issues/433

After L4A-MP-001 merged, deployment inspection of Vercel project `comind_activity_hud_colab` showed that Preview already had the browser-safe Supabase URL and publishable key but no `SUPABASE_SECRET_KEY`. Rather than copy a broad Supabase service-role credential into Vercel, this successor adopts the existing Activity HUD hashed-capability architecture with a separate capability namespace.

The implementation and verification may proceed under L4A because they create no persistent secret. A synthetic capability is inserted only inside the verifier transaction and is rolled back. The real `l4a_management_v1` capability and Vercel `OPERATOR_CONSOLE_MANAGEMENT_CAPABILITY` binding remain a mandatory human security step. Production is unchanged.
