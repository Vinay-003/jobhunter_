-- 005_keepalive.sql — Supabase keepalive / heartbeat table
-- Purpose: Prevent Supabase free tier pause after 7 days of inactivity.
-- Any INSERT/SELECT on this table counts as database activity.
-- Hit via public endpoint GET /keepalive | /api/keepalive | /api/v1/keepalive
-- and via Cloudflare Worker cron (see workers/keepalive-worker/).

CREATE TABLE IF NOT EXISTS keepalive_pings (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pinged_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  source      TEXT NOT NULL DEFAULT 'cron',
  ip          TEXT,
  method      TEXT,
  user_agent  TEXT
);

CREATE INDEX IF NOT EXISTS idx_keepalive_pings_pinged_at ON keepalive_pings (pinged_at DESC);
CREATE INDEX IF NOT EXISTS idx_keepalive_pings_source ON keepalive_pings (source);

-- Optional: single-row heartbeat table alternative (upsert-based, if you prefer UPDATE over INSERT)
-- Uncomment if you want a fixed single row instead of append-only pings:
-- CREATE TABLE IF NOT EXISTS heartbeat (
--   id         INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
--   last_ping  TIMESTAMPTZ NOT NULL DEFAULT now(),
--   ping_count BIGINT NOT NULL DEFAULT 0
-- );
-- INSERT INTO heartbeat (id, last_ping, ping_count) VALUES (1, now(), 0) ON CONFLICT (id) DO NOTHING;

COMMENT ON TABLE keepalive_pings IS 'Heartbeat pings to keep Supabase active; hit via /keepalive endpoint on a cron (e.g. Cloudflare Worker every 12h)';
