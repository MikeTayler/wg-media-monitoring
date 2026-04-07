CREATE TABLE IF NOT EXISTS entities (
  id          serial PRIMARY KEY,
  name        text UNIQUE NOT NULL,
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
  entity_id   integer NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  email       text NOT NULL,
  enabled     boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entity_id, email)
);

CREATE TABLE IF NOT EXISTS settings (
  key         text PRIMARY KEY,
  value       text NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);
