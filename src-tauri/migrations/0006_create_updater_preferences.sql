CREATE TABLE IF NOT EXISTS updater_preferences (
  singleton INTEGER PRIMARY KEY NOT NULL CHECK (singleton = 1),
  automatic_checks_enabled INTEGER NOT NULL DEFAULT 1 CHECK (automatic_checks_enabled IN (0, 1)),
  ignored_version TEXT,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

INSERT OR IGNORE INTO updater_preferences (singleton, automatic_checks_enabled)
VALUES (1, 1);
