CREATE TABLE IF NOT EXISTS profiles (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS films (
  id TEXT PRIMARY KEY NOT NULL,
  profile_id TEXT NOT NULL,
  title TEXT NOT NULL CHECK (length(trim(title)) > 0),
  original_title TEXT,
  year INTEGER,
  status TEXT NOT NULL DEFAULT 'à découvrir'
    CHECK (status IN ('à découvrir', 'en attente', 'terminé', 'abandonné')),
  is_favorite INTEGER NOT NULL DEFAULT 0
    CHECK (is_favorite IN (0, 1)),
  rating REAL
    CHECK (
      rating IS NULL
      OR (
        rating BETWEEN 0.5 AND 5.0
        AND rating * 2 = CAST(rating * 2 AS INTEGER)
      )
    ),
  watched_at TEXT,
  personal_note TEXT,
  director TEXT,
  summary TEXT,
  provider_name TEXT,
  provider_id TEXT,
  poster_url TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (profile_id) REFERENCES profiles(id)
);

CREATE INDEX IF NOT EXISTS films_profile_id_idx ON films(profile_id);
