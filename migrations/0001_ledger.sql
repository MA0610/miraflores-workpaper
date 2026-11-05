-- Shared workpaper ledger (Cloudflare D1). Append-only: a reset starts a new epoch, nothing is deleted.
CREATE TABLE IF NOT EXISTS events (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL,
  epoch INTEGER NOT NULL,
  body TEXT NOT NULL,
  UNIQUE (epoch, id)
);
CREATE INDEX IF NOT EXISTS events_epoch_seq ON events (epoch, seq);

CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v INTEGER NOT NULL);

CREATE TABLE IF NOT EXISTS presence (tab TEXT PRIMARY KEY, body TEXT NOT NULL, at INTEGER NOT NULL);
