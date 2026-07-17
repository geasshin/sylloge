CREATE TABLE IF NOT EXISTS backup_settings (
  profile_id TEXT PRIMARY KEY NOT NULL,
  backup_directory TEXT NOT NULL CHECK (length(trim(backup_directory)) > 0),
  last_automatic_snapshot_day TEXT,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (profile_id) REFERENCES profiles(id)
);
