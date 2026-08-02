-- Jalon 0.4.21 : vues personnalisées enregistrées, isolées par profil et par
-- médium. Les critères sont un document JSON borné et versionné
-- (schema_version), jamais du SQL persisté. Décision actée au brief :
-- portabilité locale uniquement — cette table n'entre ni dans les snapshots
-- ni dans les exports de bibliothèque.

CREATE TABLE IF NOT EXISTS saved_views (
  id TEXT PRIMARY KEY NOT NULL,
  profile_id TEXT NOT NULL,
  medium TEXT NOT NULL
    CHECK (medium IN ('films', 'series', 'books', 'games', 'artworks')),
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  view TEXT NOT NULL
    CHECK (view IN ('all', 'recent', 'favorites', 'ranking')),
  criteria_json TEXT NOT NULL,
  schema_version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (profile_id, medium, name),
  FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
);
