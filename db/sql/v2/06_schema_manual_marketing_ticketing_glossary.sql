-- CoMind One‑Shot v2 - 06_schema_manual_marketing_ticketing_glossary.sql
BEGIN;
SET search_path TO comind, public;

-- Manual & Versioning
CREATE TABLE IF NOT EXISTS cm_manual_page (
  page_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  slug CITEXT UNIQUE,
  body TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cm_manual_version (
  version_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id UUID REFERENCES cm_manual_page(page_id) ON DELETE CASCADE,
  version TEXT NOT NULL,
  body TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cm_manual_link (
  link_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_page UUID REFERENCES cm_manual_page(page_id) ON DELETE CASCADE,
  to_page UUID REFERENCES cm_manual_page(page_id) ON DELETE CASCADE,
  label TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Marketing/News/Ticketing
CREATE TABLE IF NOT EXISTS cm_marketing_asset (
  asset_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind TEXT NOT NULL, -- image, poster, logo, copy
  title TEXT,
  url TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cm_campaign (
  campaign_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','completed')),
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cm_social_post (
  post_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES cm_campaign(campaign_id) ON DELETE SET NULL,
  platform TEXT,
  content TEXT,
  posted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS cm_news_issue (
  issue_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT,
  number INTEGER,
  published_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS cm_news_item (
  item_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id UUID REFERENCES cm_news_issue(issue_id) ON DELETE CASCADE,
  title TEXT,
  url TEXT,
  summary TEXT
);

CREATE TABLE IF NOT EXISTS cm_ticket (
  ticket_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','blocked','closed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cm_ticket_comment (
  comment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID REFERENCES cm_ticket(ticket_id) ON DELETE CASCADE,
  author_id UUID REFERENCES cm_actor(actor_id) ON DELETE SET NULL,
  body TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cm_ticket_tag (
  ticket_id UUID REFERENCES cm_ticket(ticket_id) ON DELETE CASCADE,
  tag TEXT,
  PRIMARY KEY (ticket_id, tag)
);

-- Glossary / Word Vault
CREATE TABLE IF NOT EXISTS cm_glossary_term (
  term_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  term CITEXT UNIQUE NOT NULL,
  definition TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cm_glossary_alias (
  alias_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  term_id UUID REFERENCES cm_glossary_term(term_id) ON DELETE CASCADE,
  alias CITEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cm_glossary_tag (
  term_id UUID REFERENCES cm_glossary_term(term_id) ON DELETE CASCADE,
  tag TEXT,
  PRIMARY KEY (term_id, tag)
);

COMMIT;