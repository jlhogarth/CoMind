-- CFR-001G canonical local PostgreSQL parity.
-- Reuse the same forward migrations accepted in Supabase Test so local v2
-- bootstrap exercises the identical analytical evidence contract.

\ir ../../migrations/20261025_012_conversation_analytics_intent_derivation.sql
\ir ../../migrations/20261025_013_conversation_analytics_policy_hardening.sql
