# L4A-MP-001 Provenance

Date: 2026-10-30

Joseph requested that the Operator Console provide as close as safely possible to the full L4A development-management picture previously identified as missing. The lane was created as issue #429 under standing L4A authority after a fresh read of `main`, the migration namespace, RunBook state, open blockers, durable L4A authorization, and existing Console code.

Collision review identified draft OC-002 PR #119 modifying the Console landing page and shared Supabase server wrapper. L4A-MP-001 deliberately avoids those files. It adds isolated management-plane route/API/library files and only adds navigation links to the newer Activity, RuleBook, and Integration Gateway pages.

The database design reuses canonical `comind_pm` RunBook/evidence structures and creates no second management-state table. A service-role-only bounded RPC provides the Console projection. Production is unchanged.
