-- CoMind One‑Shot v2 - 01_extensions.sql
CREATE SCHEMA IF NOT EXISTS extensions;

CREATE EXTENSION IF NOT EXISTS pgcrypto;         -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions; -- pgvector for embeddings
