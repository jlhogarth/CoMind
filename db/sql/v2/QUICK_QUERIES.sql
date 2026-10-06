-- CoMind Neon Quick Queries (Version 001)

-- Checklist overview
SELECT item, priority, status, config_checked, migration_done, test_done
FROM comind.cm_enterprise_checklist
ORDER BY priority, created_at;

-- Research references
SELECT title, url, notes, tags FROM comind.cm_research_refs ORDER BY created_at DESC;

-- Conversations and messages count
SELECT COUNT(*) AS conversations FROM comind.cm_conversation;
SELECT COUNT(*) AS messages FROM comind.cm_message;

-- Vector index info (pgvector)
-- \\d+ comind.cm_embedding  -- run in psql to view index details

-- RLS enabled tables
SELECT relname AS table, relrowsecurity AS rls_enabled
FROM pg_class
WHERE relnamespace = 'comind'::regnamespace AND relkind='r'
ORDER BY relname;