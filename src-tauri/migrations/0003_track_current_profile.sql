CREATE TABLE IF NOT EXISTS current_profile (
  singleton INTEGER PRIMARY KEY NOT NULL CHECK (singleton = 1),
  profile_id TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (profile_id) REFERENCES profiles(id)
);

INSERT INTO current_profile (singleton, profile_id)
VALUES (1, 'default')
ON CONFLICT(singleton) DO NOTHING;
