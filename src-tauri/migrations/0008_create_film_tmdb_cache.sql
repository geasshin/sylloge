CREATE TABLE film_tmdb_cache (
  film_id TEXT PRIMARY KEY NOT NULL REFERENCES films(id) ON DELETE CASCADE,
  tmdb_id INTEGER NOT NULL,
  language TEXT NOT NULL CHECK (
    length(language) = 5
    AND language GLOB '[a-z][a-z]-[A-Z][A-Z]'
  ),
  payload_json TEXT NOT NULL,
  fetched_at TEXT NOT NULL CHECK (
    length(fetched_at) = 20
    AND fetched_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9]Z'
  ),
  refresh_after TEXT NOT NULL CHECK (
    length(refresh_after) = 20
    AND refresh_after GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9]Z'
  ),
  expires_at TEXT NOT NULL CHECK (
    length(expires_at) = 20
    AND expires_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9]Z'
  )
);

CREATE INDEX film_tmdb_cache_refresh_idx ON film_tmdb_cache(refresh_after);
