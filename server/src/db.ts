import { Database } from "bun:sqlite";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  lat REAL NOT NULL,
  lon REAL NOT NULL,
  heading INTEGER,
  maxspeed INTEGER,
  device TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  confirmed_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  up INTEGER NOT NULL DEFAULT 0,
  down INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS reports_lat_lon ON reports (lat, lon);
CREATE INDEX IF NOT EXISTS reports_expires ON reports (expires_at);

CREATE TABLE IF NOT EXISTS votes (
  report_id INTEGER NOT NULL REFERENCES reports (id) ON DELETE CASCADE,
  device TEXT NOT NULL,
  vote INTEGER NOT NULL,
  at INTEGER NOT NULL,
  PRIMARY KEY (report_id, device)
) WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS report_events (at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS report_events_at ON report_events (at);

CREATE TABLE IF NOT EXISTS fixed_cameras (
  id TEXT PRIMARY KEY,
  lat REAL NOT NULL,
  lon REAL NOT NULL,
  kind TEXT NOT NULL,
  maxspeed INTEGER,
  direction INTEGER,
  country TEXT,
  source TEXT NOT NULL
) WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL) WITHOUT ROWID;
`;

export function openDb(path = ":memory:"): Database {
  const db = new Database(path, { create: true, strict: true });
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA synchronous = NORMAL");
  db.exec("PRAGMA busy_timeout = 5000");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(SCHEMA);
  return db;
}

export function getMeta(db: Database, key: string): string | null {
  const row = db.query<{ value: string }, [string]>("SELECT value FROM meta WHERE key = ?").get(key);
  return row?.value ?? null;
}

export function setMeta(db: Database, key: string, value: string): void {
  db.query("INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value").run(
    key,
    value,
  );
}
