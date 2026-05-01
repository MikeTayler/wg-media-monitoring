CREATE TABLE IF NOT EXISTS entities (
  id          serial PRIMARY KEY,
  name        text UNIQUE NOT NULL,
  description text NOT NULL DEFAULT '',
  enabled     boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS keywords (
  id          serial PRIMARY KEY,
  entity_id   integer NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  keyword     text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entity_id, keyword)
);

CREATE TABLE IF NOT EXISTS recipients (
  id          serial PRIMARY KEY,
  entity_id   integer REFERENCES entities(id) ON DELETE CASCADE,
  email       text NOT NULL,
  enabled     boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS settings (
  key         text PRIMARY KEY,
  value       text NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS articles (
  id           text PRIMARY KEY,
  source       text NOT NULL,
  url          text UNIQUE NOT NULL,
  title        text NOT NULL,
  body         text NOT NULL DEFAULT '',
  published_at timestamptz NOT NULL,
  ingested_at  timestamptz NOT NULL DEFAULT now(),
  paywalled    boolean NOT NULL DEFAULT false,
  batch_id     text NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_articles_batch_id ON articles(batch_id);
CREATE INDEX IF NOT EXISTS idx_articles_ingested_at ON articles(ingested_at);

CREATE TABLE IF NOT EXISTS pipeline_status (
  key        text PRIMARY KEY,
  value      jsonb NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS digest_sent_urls (
  url_norm      text PRIMARY KEY,
  first_sent_at timestamptz NOT NULL DEFAULT now()
);
