CREATE TABLE IF NOT EXISTS backup_snapshots (
  profile_id TEXT NOT NULL,
  file_name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (profile_id, file_name),
  FOREIGN KEY (profile_id) REFERENCES profiles(id)
);

CREATE INDEX IF NOT EXISTS backup_snapshots_profile_created_at
  ON backup_snapshots (profile_id, created_at DESC, file_name DESC);
